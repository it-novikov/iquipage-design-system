package com.sprintique.planning.domain

import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.domain.TaskRules
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.contracts.ExperimentalContracts
import kotlin.contracts.contract

/**
 * Computes what a planning command changes. The input state is never modified: the command runs on a working copy,
 * the result lists the tasks, releases, milestones and constraints that differ, each with its next revision.
 */
@Suppress("TooManyFunctions")
class PlanChange private constructor(private val original: PlanningState) {
    private val tasks = original.tasks.associateByTo(LinkedHashMap(), TaskState::id)
    private val releases = original.releases.associateByTo(LinkedHashMap(), Release::id)
    private var milestones = original.milestones.toMutableList()
    private var constraints = original.constraints.toMutableList()
    private var defaults = original.defaults
    private val before = PlanningRows.project(original)
    private val beforeById = before.associateBy(PlanningRow::id)
    private var selection: MutableSet<String> = LinkedHashSet()
    private var history: Pair<String, String>? = null
    private var historyRows: List<PlanningRow> = emptyList()
    private val commandedMilestones = HashSet<String>()

    private fun run(command: PlanningCommand): PlanResult {
        selectionOf(command)?.let {
            selection = LinkedHashSet(PlanningRows.selected(it, before, releases.values))
            requireCondition(selection.isNotEmpty(), 422, "EMPTY_SELECTION", "Выберите задачи.")
        }
        apply(command)
        for (task in tasks.values) {
            requireCondition(
                task.plannedStart == null || task.plannedEnd == null || task.plannedStart <= task.plannedEnd,
                422,
                "DATE_RANGE",
                "Начало не может быть позже окончания.",
            )
        }
        return result(command)
    }

    private fun selectionOf(command: PlanningCommand): Selection? = when (command) {
        is PlanningCommand.Prepare -> command.selection
        is PlanningCommand.Admission -> command.selection
        is PlanningCommand.Assign -> command.selection
        is PlanningCommand.Bulk -> command.selection
        else -> null
    }

    @Suppress("CyclomaticComplexMethod")
    private fun apply(command: PlanningCommand) {
        when (command) {
            is PlanningCommand.TaskCreate -> create(command)

            is PlanningCommand.TaskEdit -> edit(command)

            is PlanningCommand.Prepare -> each { it.copy(preparation = command.preparation) }

            is PlanningCommand.Admission -> admit(command.admitted)

            is PlanningCommand.Assign -> assign(command.assignment)

            is PlanningCommand.Reparent -> reparent(command)

            is PlanningCommand.Rank -> rank(command)

            is PlanningCommand.Bulk -> bulk(command.fields)

            is PlanningCommand.ReleaseEdit -> releaseEdit(command)

            is PlanningCommand.ReleaseCreate -> releaseCreate(command)

            is ScheduleAction -> schedule(command)

            is PlanningCommand.ScheduleBatch -> command.actions.forEach(::schedule)

            is PlanningCommand.MilestoneChange -> milestone(command)

            is PlanningCommand.Settings -> defaults = command.value

            is PlanningCommand.Shift -> shift(command)

            is PlanningCommand.Start -> start(command.releaseId)

            is PlanningCommand.Close -> finish(
                command.releaseId,
                command.accepted,
                command.destination,
                command.overrides,
            )

            is PlanningCommand.Cancel -> finish(command.releaseId, null, command.destination, command.overrides)

            is PlanningCommand.Place -> place(command)

            is PlanningCommand.Restore -> restore(command)
        }
    }

    private fun each(change: (TaskState) -> TaskState) {
        for (id in selection) {
            val task = tasks.getValue(id)
            TaskRules.requireOpen(task.result)
            tasks[id] = change(task)
        }
    }

    private fun create(command: PlanningCommand.TaskCreate) {
        val creation = requirePresent(original.creation, 503, "CREATION_CONTEXT", "Контекст создания недоступен.")
        requireCondition(command.taskId !in tasks, 409, "CONFLICT", "Задача уже создана.")
        command.task.releaseId?.let { requireMutable(releases[it]) }
        val fields = command.task
        tasks[command.taskId] = TaskState(
            id = command.taskId,
            displayId = "${creation.key}-${creation.number}",
            revision = 0,
            parentId = fields.parentId,
            title = fields.title,
            type = fields.type,
            status = fields.status,
            attachmentIds = fields.attachmentIds,
            coverAttachmentId = fields.coverAttachmentId,
            coverCrop = fields.coverCrop,
            ownerId = fields.ownerId,
            legacyOwner = "",
            priority = fields.priority,
            rank = fields.rank,
            statusEnteredAt = creation.createdAt,
            createdAt = creation.createdAt,
            preparation = if (command.createInBoard) "ready" else "draft",
            result = "open",
            admitted = command.createInBoard,
            assignmentMode = if (fields.releaseId != null) "assigned" else "inherit",
            releaseId = fields.releaseId,
            plannedStart = null,
            plannedEnd = null,
            due = fields.due,
            tagIds = fields.tagIds,
            estimate = fields.estimate,
        )
        selection += command.taskId
    }

    private fun edit(command: PlanningCommand.TaskEdit) {
        var task = openTask(command.taskId)
        requireCondition(
            task.revision.toLong() == command.baseRevision,
            409,
            "CONFLICT",
            "Задача уже изменена. Обновите её перед сохранением.",
        )
        val fields = command.task
        if (fields.releaseId != task.releaseId) {
            fields.releaseId?.let { requireMutable(releases[it]) }
            task = task.copy(assignmentMode = if (fields.releaseId != null) "assigned" else "none", admitted = false)
        }
        tasks[task.id] = task.copy(
            attachmentIds = fields.attachmentIds,
            coverAttachmentId = fields.coverAttachmentId,
            coverCrop = fields.coverCrop,
            title = fields.title,
            status = fields.status,
            type = fields.type,
            priority = fields.priority,
            ownerId = fields.ownerId,
            due = fields.due,
            rank = fields.rank,
            parentId = fields.parentId,
            releaseId = fields.releaseId,
            tagIds = fields.tagIds,
            estimate = fields.estimate,
        )
        selection += task.id
    }

    private fun admit(admitted: Boolean) = each { task ->
        requireCondition(
            beforeById.getValue(task.id).effectiveReleaseId == null,
            409,
            "RELEASE_ADMISSION",
            "Допуск этой задачи определяется релизом.",
        )
        requireCondition(
            !admitted || task.preparation == "ready",
            409,
            "TASK_NOT_PREPARED",
            "Сначала подготовьте задачу.",
        )
        task.copy(admitted = admitted)
    }

    /** Overlapping inherited subtrees are normalized without overwriting a child's own exclusion or override. */
    private fun assign(assignment: Assignment) {
        if (assignment is Assignment.Assigned) requireMutable(releases[assignment.releaseId])
        each { task ->
            if (task.assignmentMode == "inherit" && task.parentId != null && task.parentId in selection) {
                task
            } else {
                task.copy(
                    assignmentMode = assignment.mode,
                    releaseId = (assignment as? Assignment.Assigned)?.releaseId,
                    admitted = false,
                )
            }
        }
    }

    private fun reparent(command: PlanningCommand.Reparent) {
        val task = openTask(command.taskId)
        requireCondition(
            command.parentId == null || command.parentId in tasks,
            422,
            "TASK_PARENT",
            "Родительская задача недоступна.",
        )
        tasks[task.id] = task.copy(parentId = command.parentId)
        selection += task.id
    }

    private fun rank(command: PlanningCommand.Rank) {
        for (change in command.ranks) {
            tasks[change.taskId] = openTask(change.taskId).copy(rank = change.rank)
            selection += change.taskId
        }
    }

    private fun bulk(fields: BulkFields) = each { task ->
        var changed = task
        (fields.ownerId as? Maybe.Given)?.let { changed = changed.copy(ownerId = it.value) }
        (fields.priority as? Maybe.Given)?.let { changed = changed.copy(priority = it.value) }
        (fields.plannedStart as? Maybe.Given)?.let { changed = changed.copy(plannedStart = it.value) }
        (fields.plannedEnd as? Maybe.Given)?.let { changed = changed.copy(plannedEnd = it.value) }
        (fields.due as? Maybe.Given)?.let { changed = changed.copy(due = it.value) }
        (fields.estimate as? Maybe.Given)?.let { changed = changed.copy(estimate = it.value) }
        fields.addTagIds?.let { added ->
            changed = changed.copy(tagIds = (changed.tagIds + added).distinct().sorted())
        }
        requireCondition(
            changed.tagIds.size <= TAG_LIMIT,
            422,
            "TASK_TAG_LIMIT",
            "У задачи может быть не более 30 тегов.",
        )
        changed
    }

    private fun releaseEdit(command: PlanningCommand.ReleaseEdit) {
        val release = requireMutable(releases[command.releaseId])
        val value = command.value
        releases[release.id] = release.copy(
            name = value.name,
            format = value.format,
            plannedStart = value.plannedStart,
            plannedEnd = value.plannedEnd,
            deadline = value.deadline,
            goal = if (value.goal is Maybe.Given) value.goal.value else release.goal,
        )
    }

    private fun releaseCreate(command: PlanningCommand.ReleaseCreate) {
        requireCondition(command.releaseId !in releases, 409, "RELEASE_EXISTS", "Релиз уже существует.")
        releases[command.releaseId] = newRelease(command.releaseId, command.projectId, command.value)
    }

    private fun schedule(action: ScheduleAction) {
        when (action) {
            is PlanningCommand.RemoveConstraint -> {
                requireCondition(
                    constraints.any { it.id == action.id },
                    404,
                    "CONSTRAINT_NOT_FOUND",
                    "Зависимость недоступна.",
                )
                constraints.removeAll { it.id == action.id }
            }

            is PlanningCommand.Constraint -> {
                val previous = constraints.firstOrNull { it.id == action.id }
                constraints.removeAll { it.id == action.id }
                val value = action.value
                constraints += TemporalConstraint(
                    action.id,
                    (previous?.revision ?: 0) + 1,
                    value.source,
                    value.target,
                    value.relation,
                    value.lagDays,
                )
            }

            is PlanningCommand.Schedule -> scheduleEntity(action)
        }
    }

    private fun scheduleEntity(action: PlanningCommand.Schedule) {
        val start = action.plannedStart
        val end = action.plannedEnd
        requireCondition(
            start == null || end == null || start <= end,
            422,
            "DATE_RANGE",
            "Начало не может быть позже окончания.",
        )
        val entity = action.entity
        when (entity.kind) {
            "task" -> {
                val task = requirePresent(tasks[entity.id], 404, "TASK_NOT_FOUND", "Задача недоступна.")
                TaskRules.requireOpen(task.result)
                val due = if (action.deadline is Maybe.Given) action.deadline.value else task.due
                tasks[task.id] = task.copy(plannedStart = start, plannedEnd = end, due = due)
            }

            "release" -> {
                val release = requireMutable(releases[entity.id])
                val deadline = if (action.deadline is Maybe.Given) action.deadline.value else release.deadline
                requireCondition(
                    ReleaseRules.valid(release.format, start, end),
                    422,
                    "RELEASE_DATES",
                    "Для спринта нужны обе даты.",
                )
                releases[release.id] = release.copy(plannedStart = start, plannedEnd = end, deadline = deadline)
            }

            else -> {
                val index = milestones.indexOfFirst { it.id == entity.id }
                requireCondition(index >= 0, 404, "MILESTONE_NOT_FOUND", "Веха недоступна.")
                val milestone = milestones[index]
                milestone.releaseId?.let { requireMutable(releases[it]) }
                requireCondition(start == end, 422, "MILESTONE_DATE", "У вехи одна дата.")
                milestones[index] = milestone.copy(date = start)
            }
        }
    }

    private fun milestone(command: PlanningCommand.MilestoneChange) {
        command.value.releaseId?.let { requireMutable(releases[it]) }
        val previous = milestones.firstOrNull { it.id == command.id }
        previous?.releaseId?.let { requireMutable(releases[it]) }
        milestones.removeAll { it.id == command.id }
        val value = command.value
        milestones += Milestone(command.id, value.title, value.date, previous?.revision ?: 0, value.releaseId)
        commandedMilestones += command.id
    }

    private fun shift(command: PlanningCommand.Shift) {
        requireMutable(releases[command.releaseId])
        for (row in before.filter { it.result == "open" && it.effectiveReleaseId == command.releaseId }) {
            val task = tasks.getValue(row.id)
            tasks[row.id] = task.copy(
                plannedStart = shifted(task.plannedStart, command.days),
                plannedEnd = shifted(task.plannedEnd, command.days),
            )
            selection += row.id
        }
    }

    private fun start(releaseId: String) {
        val release = requireMutable(releases[releaseId])
        requireCondition(
            release.lifecycle == "planned",
            409,
            "RELEASE_STATE",
            "Запустить можно только запланированный релиз.",
        )
        releases[release.id] = release.copy(lifecycle = "active")
        historyRows = before.filter { it.effectiveReleaseId == release.id }
        history = release.id to "started"
    }

    private fun finish(
        releaseId: String,
        acceptedSelection: Selection?,
        destination: Destination,
        overrides: Map<String, String?>?,
    ) {
        val release = requireMutable(releases[releaseId])
        requireCondition(
            acceptedSelection == null || release.lifecycle == "active",
            409,
            "RELEASE_STATE",
            "Закрыть можно только активный релиз.",
        )
        val members = before.filter { it.effectiveReleaseId == release.id }
        val memberIds = members.mapTo(HashSet(), PlanningRow::id)
        val selected = acceptedSelection?.let { PlanningRows.selected(it, before, releases.values) }.orEmpty()
        requireCondition(
            selected.all { it in memberIds },
            422,
            "ACCEPT_OUTSIDE_RELEASE",
            "Принять можно только задачи этого релиза.",
        )
        val accepted = PlanningRows.acceptable(selected, members)
        for (id in accepted) {
            val task = tasks.getValue(id)
            requireCondition(
                task.status == "ready_for_release",
                422,
                "RESULT_NOT_READY",
                "Принять можно только задачу, готовую к релизу.",
            )
            tasks[id] =
                task.copy(result = "accepted", assignmentMode = "assigned", releaseId = release.id, admitted = false)
        }
        val remainder = members.filter { tasks.getValue(it.id).result == "open" }
        val target = recipient(release, destination, remainder.isNotEmpty())
        val remainderIds = remainder.mapTo(HashSet(), PlanningRow::id)
        for ((id, to) in overrides.orEmpty()) {
            requireCondition(
                id in remainderIds,
                422,
                "OVERRIDE_NOT_REMAINDER",
                "Отдельное назначение допустимо только для незавершённого остатка.",
            )
            if (to != null) {
                requireCondition(to != release.id, 422, "SAME_RELEASE", "Выберите другой релиз.")
                requireMutable(releases[to])
            }
        }
        for (row in remainder) {
            val task = tasks.getValue(row.id)
            tasks[row.id] = when {
                overrides != null && task.id in overrides -> {
                    val to = overrides[task.id]
                    task.copy(assignmentMode = if (to != null) "assigned" else "none", releaseId = to, admitted = false)
                }

                task.assignmentMode == "inherit" && task.parentId != null && task.parentId in remainderIds ->
                    task.copy(admitted = false)

                else -> task.copy(
                    assignmentMode = if (target != null) "assigned" else "none",
                    releaseId = target,
                    admitted = false,
                )
            }
        }
        val finished = if (acceptedSelection != null) "closed" else "cancelled"
        releases[release.id] = releases.getValue(release.id).copy(lifecycle = finished)
        historyRows = members
        history = release.id to finished
        selection = members.mapTo(LinkedHashSet(), PlanningRow::id)
    }

    private fun recipient(
        release: Release,
        destination: Destination,
        hasRemainder: Boolean,
    ): String? = when (destination) {
        is Destination.ToRelease -> {
            requireCondition(
                destination.releaseId != release.id,
                422,
                "SAME_RELEASE",
                "Выберите другой релиз для остатка.",
            )
            requireMutable(releases[destination.releaseId]).id
        }

        is Destination.NewRelease -> {
            requireCondition(
                destination.id !in releases,
                409,
                "RELEASE_EXISTS",
                "Релиз с таким идентификатором уже существует.",
            )
            requireCondition(hasRemainder, 422, "NO_REMAINDER", "Для нового релиза нет незавершённого остатка.")
            releases[destination.id] = newRelease(destination.id, release.projectId, destination.value)
            destination.id
        }

        Destination.Backlog -> null
    }

    private fun result(command: PlanningCommand): PlanResult {
        val state = currentState()
        val after = PlanningRows.project(state)
        for (row in after) {
            val previous = beforeById[row.id]
            if (row.effectiveReleaseId != previous?.effectiveReleaseId && row.effectiveReleaseId != null) {
                requireMutable(releases[row.effectiveReleaseId])
            }
            if (previous?.result == "accepted") {
                requireCondition(
                    row.effectiveReleaseId == previous.effectiveReleaseId,
                    409,
                    "RESULT_PINNED",
                    "Принятый результат нельзя перенести.",
                )
            }
        }
        val conflicts = TemporalRules.validate(state) - TemporalRules.validate(original).toSet()
        val editedId = (command as? PlanningCommand.TaskEdit)?.taskId
        // Inherited membership and board admission are observable task changes too: each changed row gets a revision.
        val effects = after.filter { it.id == editedId || it != beforeById[it.id] }.map {
            Effect(it.id, beforeById[it.id], it.copy(revision = it.revision + 1))
        }
        val changedTasks = effects.map { tasks.getValue(it.id).let { task -> task.copy(revision = task.revision + 1) } }
        val touchedReleases = effects.flatMap {
            listOfNotNull(it.before?.effectiveReleaseId, it.after.effectiveReleaseId)
        }.toSet()
        val originalReleases = original.releases.associateBy(Release::id)
        val changedReleases = releases.values.filter { it.id in touchedReleases || it != originalReleases[it.id] }
            .map { it.copy(revision = it.revision + 1, scopeRevision = it.scopeRevision + 1) }
        val originalMilestones = original.milestones.associateBy(Milestone::id)
        val changedMilestones = milestones.filter { it.id in commandedMilestones || it != originalMilestones[it.id] }
            .map { it.copy(revision = (originalMilestones[it.id]?.revision ?: 0) + 1) }
        val originalConstraints = original.constraints.associateBy(TemporalConstraint::id)
        val changedConstraints = constraints.filter { it != originalConstraints[it.id] }
        val removed = original.constraints.map(TemporalConstraint::id).filter { id -> constraints.none { it.id == id } }
        // A settings command always changes the settings, as it did when compared as stored text.
        val changedDefaults = defaults.takeIf { command is PlanningCommand.Settings || it != original.defaults }
        val finalRows = after.associateBy(PlanningRow::id)
        val releaseHistory = history?.let { (releaseId, kind) ->
            ReleaseHistory(
                releaseId,
                kind,
                historyRows.map { previous ->
                    val task = finalRows.getValue(previous.id)
                    HistoryItem(previous, task, outcome(kind, task))
                },
            )
        }
        val creation = original.creation
        return PlanResult(
            taskContent = when (command) {
                is PlanningCommand.TaskEdit -> TaskContentChange(command.taskId, command.task)
                is PlanningCommand.TaskCreate -> TaskContentChange(command.taskId, command.task)
                else -> null
            },
            createdTask = if (command is PlanningCommand.TaskCreate && creation != null) {
                CreatedTask(command.taskId, creation.projectId, creation.number, creation.createdAt)
            } else {
                null
            },
            tasks = changedTasks,
            releases = changedReleases,
            effects = effects,
            selectedCount = selection.size,
            milestones = changedMilestones,
            constraints = changedConstraints,
            removedConstraints = removed,
            defaults = changedDefaults,
            details = PlanDetails.describe(
                changedReleases,
                changedMilestones,
                changedConstraints,
                removed,
                changedDefaults,
                effects,
            ) + PlanDetails.conflicts(conflicts, effects, releases),
            history = releaseHistory,
        )
    }

    /**
     * The moved block lands after [PlanningCommand.Place.afterId] among the container's root rows, in the order of the
     * ids; descendants that come along keep their own order under their parents.
     */
    private fun place(command: PlanningCommand.Place) {
        val target = if (command.containerId == BACKLOG) null else requireMutable(releases[command.containerId]).id
        val block = PlaceRules.block(command.ids, command.withChildren, before)
        for (id in block) {
            requireCondition(
                beforeById.getValue(id).result == "open",
                409,
                "RESULT_PINNED",
                "Принятый результат нельзя перенести.",
            )
        }
        val blockSet = block.toSet()
        // Each root of the block decides its container; a child that came along with its parent follows it.
        for (id in block) {
            val task = tasks.getValue(id)
            val moves = beforeById.getValue(id).effectiveReleaseId != target
            tasks[id] = if (task.parentId != null && task.parentId in blockSet) {
                task.copy(assignmentMode = "inherit", releaseId = null, admitted = task.admitted && !moves)
            } else {
                task.copy(
                    assignmentMode = if (target != null) "assigned" else "none",
                    releaseId = target,
                    admitted = task.admitted && !moves,
                )
            }
            selection += id
        }
        // What stays behind stays where it was: a descendant left in its container is pinned there.
        pinUnmoved(blockSet)
        val roots = block.filter { tasks.getValue(it).parentId !in blockSet }
        for ((id, rank) in PlaceRules.ranks(rootsOf(target, blockSet), roots, command.afterId)) {
            tasks[id] = tasks.getValue(id).copy(rank = rank)
            selection += id
        }
    }

    /** The root rows of a container as it is now, without the moved block, in planned order. */
    private fun rootsOf(target: String?, block: Set<String>): List<TaskState> {
        val rows = PlanningRows.project(currentState().tasks, releases)
        val inside = rows.filter { it.effectiveReleaseId == target && it.id !in block }
        val ids = inside.mapTo(HashSet(), PlanningRow::id)
        return inside.filter { it.parentId == null || it.parentId !in ids }
            .sortedWith(compareBy<PlanningRow> { it.rank }.thenBy { it.displayId.length }.thenBy { it.displayId })
            .map { tasks.getValue(it.id) }
    }

    private fun pinUnmoved(block: Set<String>) {
        val after = PlanningRows.project(currentState().tasks, releases)
        val left = after.filter { row ->
            row.id !in block && beforeById[row.id]?.let { it.effectiveReleaseId != row.effectiveReleaseId } == true
        }
        for (row in left) {
            val previous = beforeById.getValue(row.id)
            val task = tasks.getValue(row.id)
            tasks[row.id] = task.copy(
                assignmentMode = if (previous.effectiveReleaseId != null) "assigned" else "none",
                releaseId = previous.effectiveReleaseId,
            )
            selection += row.id
        }
    }

    private fun restore(command: PlanningCommand.Restore) {
        for (item in command.items) {
            val task = openTask(item.id)
            val target = if (item.containerId == BACKLOG) null else item.containerId
            target?.let { requireMutable(releases[it]) }
            tasks[item.id] = task.copy(
                assignmentMode = when {
                    item.inherit -> "inherit"
                    target != null -> "assigned"
                    else -> "none"
                },
                releaseId = if (item.inherit) null else target,
                rank = item.rank,
                admitted = item.admitted ?: task.admitted,
            )
            selection += item.id
        }
    }

    private fun currentState() = original.copy(
        tasks = tasks.values.toList(),
        releases = releases.values.toList(),
        milestones = milestones.toList(),
        constraints = constraints.toList(),
        defaults = defaults,
    )

    private fun openTask(id: String): TaskState {
        val task = requirePresent(tasks[id], 404, "TASK_NOT_FOUND", "Задача недоступна.")
        TaskRules.requireOpen(task.result)
        return task
    }

    companion object {
        private const val TAG_LIMIT = 30
        private const val BACKLOG = "backlog"

        fun plan(state: PlanningState, command: PlanningCommand): PlanResult = PlanChange(state).run(command)

        /** A release that is still open to changes: present, not archived, planned or active. */
        @OptIn(ExperimentalContracts::class)
        fun requireMutable(release: Release?): Release {
            contract { returns() implies (release != null) }
            requireCondition(
                release != null && release.archivedAt == null,
                422,
                "RELEASE_UNAVAILABLE",
                "Релиз недоступен.",
            )
            requireCondition(
                release.lifecycle == "planned" || release.lifecycle == "active",
                409,
                "RELEASE_FINISHED",
                "Релиз уже завершён.",
            )
            return release
        }

        private fun newRelease(id: String, projectId: String, value: ReleaseData) = Release(
            id = id,
            projectId = projectId,
            name = value.name,
            revision = 0,
            scopeRevision = 0.0,
            lifecycle = "planned",
            format = value.format,
            plannedStart = value.plannedStart,
            plannedEnd = value.plannedEnd,
            deadline = value.deadline,
            archivedAt = null,
            goal = (value.goal as? Maybe.Given)?.value,
        )

        private fun outcome(kind: String, task: PlanningRow) = when {
            kind == "started" -> "baseline"
            task.result == "accepted" -> "accepted"
            task.effectiveReleaseId != null -> "transferred"
            else -> "deferred"
        }

        private val DAY = Regex("^\\d{4}-\\d{2}-\\d{2}$")

        private fun shifted(value: String?, days: Int): String? {
            if (value == null) return null
            val day = try {
                LocalDate.parse(value).plusDays(days.toLong()).toString()
            } catch (@Suppress("SwallowedException") _: DateTimeParseException) {
                ""
            }
            requireCondition(DAY.matches(day), 422, "DATE_RANGE", "Дата вне допустимого диапазона.")
            return day
        }
    }
}

/** Release rules shared by commands and their contract. */
object ReleaseRules {
    /** A range never ends before it starts, and a timeboxed release (a sprint) has both dates. */
    fun valid(format: String, start: String?, end: String?) =
        (start == null || end == null || start <= end) && (format != "timeboxed" || (start != null && end != null))
}

/** The preview lines for people: changed releases, milestones, constraints, settings and date conflicts. */
object PlanDetails {
    /**
     * Date conflicts are warnings under the r4 policy: constraints the change breaks, and moved or edited tasks whose
     * due date falls after the end of their sprint.
     */
    fun conflicts(constraints: List<String>, effects: List<Effect>, releases: Map<String, Release>): List<Detail> =
        constraints.map { Detail("Конфликт дат", it) } + effects.mapNotNull { effect ->
            val row = effect.after
            val sprint = row.effectiveReleaseId?.let(releases::get)?.takeIf { it.format == "timeboxed" }
            val end = sprint?.plannedEnd.takeIf { row.result == "open" }
            val late = end != null && row.due != null && row.due > end
            val moved = effect.before?.let { it.due != row.due || it.effectiveReleaseId != row.effectiveReleaseId }
            if (!late || moved == false) return@mapNotNull null
            Detail(
                "Конфликт дат: ${row.displayId}",
                "Срок ${day(row.due)} позже конца спринта ${day(end)}. Сохраним, спринт не сдвигается.",
            )
        }

    private val LIFECYCLE = mapOf(
        "planned" to "Запланирован", "active" to "Начат", "closed" to "Завершён",
        "cancelled" to "Отменён",
    )

    /** Calendar dates in text read as 04.10.2000. */
    fun day(value: String?): String = value?.split('-')?.reversed()?.joinToString(".").orEmpty()

    @Suppress("LongParameterList")
    fun describe(
        releases: List<Release>,
        milestones: List<Milestone>,
        constraints: List<TemporalConstraint>,
        removed: List<String>,
        defaults: PlanningDefaults?,
        effects: List<Effect>,
    ): List<Detail> = buildList {
        for (release in releases) {
            val start = day(release.plannedStart).ifEmpty { "без начала" }
            val end = day(release.plannedEnd).ifEmpty { "без окончания" }
            val deadline = day(release.deadline).ifEmpty { "не задан" }
            add(Detail(release.name, "${LIFECYCLE[release.lifecycle]}. Сроки: $start – $end. Дедлайн: $deadline"))
        }
        for (milestone in milestones) add(Detail(milestone.title, "Веха: ${milestone.date ?: "без даты"}"))
        for (constraint in constraints) {
            val description =
                "${constraint.source.id} → ${constraint.target.id}: ${constraint.relation}, ${constraint.lagDays} дн."
            add(Detail("Зависимость", description))
        }
        for (id in removed) add(Detail("Удалить зависимость", id))
        if (defaults != null) {
            val kind = if (defaults.format == "timeboxed") "Спринт" else "Релиз"
            val zone = if (defaults.timezoneInherited == true) "часовой пояс как в пространстве" else defaults.timezone
            add(Detail("Настройки планирования", "$kind, ${defaults.days} дн., $zone"))
        }
        for (effect in effects) {
            val end = effect.after.plannedEnd
            val due = effect.after.due
            if (end != null && due != null && end > due) {
                add(
                    Detail(
                        "Конфликт дат: ${effect.after.displayId}",
                        "Плановое окончание ${day(end)} позже дедлайна ${day(due)}. " +
                            "Дедлайн не сдвигается автоматически.",
                    ),
                )
            }
        }
    }
}
