package com.sprintique.planning.application

import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.planning.application.ViewText.BACKLOG
import com.sprintique.planning.application.ViewText.finished
import com.sprintique.planning.application.ViewText.isDone
import com.sprintique.planning.application.ViewText.memberNames
import com.sprintique.planning.application.ViewText.ownerLabel
import com.sprintique.planning.contract.ViewMoveRequest
import com.sprintique.planning.domain.PlaceRules
import com.sprintique.planning.domain.PlanChange
import com.sprintique.planning.domain.PlanDetails
import com.sprintique.planning.domain.PlanningCommand
import com.sprintique.planning.domain.PlanningDefaults
import com.sprintique.planning.domain.PlanningRow
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.planning.domain.Release
import com.sprintique.planning.domain.RestoreItem
import com.sprintique.planning.domain.TaskState
import com.sprintique.problem.requireCondition
import com.sprintique.task.domain.TaskEstimate
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * The planning screen of round 4: one page of containers (the running sprint, the next sprints, open releases, the
 * backlog), each a tree of epics and tasks with sums, and the move of tasks between them with an undo.
 */
@Component
@Profile("api")
class PlanningContainers(
    private val json: JsonMapper,
    private val ledger: CommandLedger,
    private val support: ViewSupport,
) {
    fun containers(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val defaults = c.state.defaults ?: PlanningDefaults("flexible", DEFAULT_DAYS, null, null)
        val open = openContainers(c.state.releases)
        val scope = Scope(c.rows, defaults, open, memberNames(c.state))
        return linkedMapOf(
            "protocol" to PROTOCOL,
            "projectId" to projectId,
            "revision" to c.revision.toString(),
            "today" to today(tx, projectId),
            "estimate" to linkedMapOf(
                "format" to defaults.estimateFormat,
                "hoursPerDay" to defaults.hoursPerDay,
                "hoursPerWeek" to defaults.hoursPerWeek,
            ),
            "capabilities" to linkedMapOf(
                "plan" to c.write,
                "manageReleases" to c.releases,
                "completeSprint" to c.releases,
            ),
            "completed" to linkedMapOf(
                "count" to c.state.releases.count { it.archivedAt == null && finished(it) },
            ),
            "containers" to open.map { container(it, scope) },
        )
    }

    /** Moves tasks or undoes a move, at once and atomically; people only, agents propose a `place` intent. */
    fun move(tx: Transaction, actor: Actor, projectId: String, request: ViewMoveRequest, key: String): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        requireCondition(
            actor.isHuman,
            403,
            "HUMAN_REQUIRED",
            "Перенос применяет человек. Агент предлагает его через предпросмотр.",
        )
        return ledger.idempotent(tx, actor, projectId, "planning.move", key, request) {
            val c = support.context(tx, actor, projectId)
            requireCondition(c.write, 403, "READ_ONLY", "Изменение недоступно.")
            val restore = request.restore
            val command = if (restore != null) {
                requireCondition(
                    restore.expectedRevision == c.revision.toString(),
                    409,
                    "UNDO_STALE",
                    "План уже изменился после переноса. Отменить его нельзя.",
                )
                PlanningCommand.Restore(
                    restore.items.map { RestoreItem(it.id, it.containerId, it.inherit, it.rank, it.admitted) },
                )
            } else {
                request.expectedRevision?.let {
                    requireCondition(
                        it == c.revision.toString(),
                        409,
                        "PROJECTION_STALE",
                        "План изменился. Обновите представление.",
                    )
                }
                PlanningCommand.Place(
                    request.ids!!.distinct(),
                    request.containerId!!,
                    request.afterId,
                    request.withChildren,
                )
            }
            val result = PlanChange.plan(c.state, command)
            val operationId = UUID.randomUUID().toString()
            PlanApplication.apply(tx, actor, projectId, operationId, result, json)
            val revision = tx.row("SELECT planning_revision AS revision FROM app.projects WHERE id = $1", projectId)!!
                .long("revision")
            val state = PlanningStates.load(tx, projectId)
            val rows = PlanningRows.project(state)
            val defaults = state.defaults ?: c.state.defaults!!
            val scope = Scope(rows, defaults, openContainers(state.releases), memberNames(state))
            val touched = LinkedHashSet<String>()
            for (effect in result.effects) {
                touched += effect.before?.effectiveReleaseId ?: BACKLOG
                touched += effect.after.effectiveReleaseId ?: BACKLOG
            }
            val moved = when (command) {
                is PlanningCommand.Place -> PlaceRules.block(command.ids, command.withChildren, c.rows)
                else -> result.effects.map { it.id }
            }
            val before = c.state.tasks.associateBy(TaskState::id)
            val beforeRows = c.rows.associateBy(PlanningRow::id)
            linkedMapOf(
                "status" to "committed",
                "operationId" to operationId,
                "revision" to revision.toString(),
                "moved" to moved,
                "containers" to touched.map { id ->
                    linkedMapOf(
                        "id" to id,
                        "summary" to summary(scope.members(id), id, scope),
                    )
                },
                "undo" to linkedMapOf(
                    "kind" to "restore",
                    "expectedRevision" to revision.toString(),
                    "items" to result.tasks.map { task ->
                        val previous = before.getValue(task.id)
                        linkedMapOf(
                            "id" to task.id,
                            "containerId" to when (previous.assignmentMode) {
                                "assigned" -> previous.releaseId ?: BACKLOG
                                "inherit" -> beforeRows[task.id]?.effectiveReleaseId ?: BACKLOG
                                else -> BACKLOG
                            },
                            "inherit" to (previous.assignmentMode == "inherit"),
                            "rank" to previous.rank,
                            "admitted" to previous.admitted,
                        )
                    },
                ),
                "warnings" to
                    if (command is PlanningCommand.Place) warnings(moved, rows, state.releases) else emptyList(),
            )
        }
    }

    /** What a moved task should know about its new place: a due date after the sprint, no due date in a release. */
    private fun warnings(ids: List<String>, rows: List<PlanningRow>, releases: List<Release>): List<Map<String, Any?>> {
        val byId = rows.associateBy(PlanningRow::id)
        val byRelease = releases.associateBy(Release::id)
        return ids.mapNotNull { id ->
            val row = byId[id] ?: return@mapNotNull null
            val release = row.effectiveReleaseId?.let(byRelease::get) ?: return@mapNotNull null
            val end = release.plannedEnd
            when {
                isDone(row) || row.result != "open" -> null

                release.format == "timeboxed" && end != null && row.due != null && row.due > end -> linkedMapOf(
                    "taskId" to id,
                    "code" to "AFTER_SPRINT_END",
                    "message" to "Срок ${PlanDetails.day(row.due)} позже конца спринта ${PlanDetails.day(end)}.",
                )

                release.format != "timeboxed" && row.due == null && row.type != "epic" && row.childCount == 0 ->
                    linkedMapOf(
                        "taskId" to id,
                        "code" to "NO_DUE",
                        "message" to if (release.deadline != null) {
                            "У задачи нет срока, а релиз к ${PlanDetails.day(release.deadline)}."
                        } else {
                            "У задачи нет срока."
                        },
                    )

                else -> null
            }
        }
    }

    /** Everything a container is described against: all rows, the estimate settings and the open containers. */
    private class Scope(
        val rows: List<PlanningRow>,
        val defaults: PlanningDefaults,
        val open: List<Release?>,
        val names: Map<String, String>,
    ) {
        val byId = rows.associateBy(PlanningRow::id)
        val children: Map<String, List<PlanningRow>> = rows.filter { it.parentId != null }.groupBy { it.parentId!! }
        private val byContainer = rows.groupBy { it.effectiveReleaseId ?: BACKLOG }
        val openIds = open.mapTo(HashSet()) { it?.id ?: BACKLOG }
        val containerNames = open.associate { (it?.id ?: BACKLOG) to (it?.name ?: "Бэклог") }

        fun members(containerId: String) = byContainer[containerId].orEmpty()

        fun isEpic(row: PlanningRow) = row.type == "epic" || (children[row.id]?.isNotEmpty() == true)

        fun mismatch(row: PlanningRow) = row.estimate?.mismatches(defaults.estimateFormat) == true

        fun hours(row: PlanningRow) =
            row.estimate?.hours(defaults.hoursPerDay.toDouble(), defaults.hoursPerWeek.toDouble())

        /** Leaf descendants of an epic (tasks and subtasks, never epics), wherever they are. */
        fun leaves(epic: PlanningRow): List<PlanningRow> {
            val result = ArrayList<PlanningRow>()
            val stack = ArrayDeque(children[epic.id].orEmpty())
            val seen = HashSet<String>()
            while (stack.isNotEmpty()) {
                val row = stack.removeLast()
                if (!seen.add(row.id)) continue
                if (isEpic(row)) children[row.id].orEmpty().forEach(stack::addLast) else result += row
            }
            return result
        }
    }

    private fun container(release: Release?, scope: Scope): Map<String, Any?> {
        val id = release?.id ?: BACKLOG
        val kind = when {
            release == null -> "backlog"
            release.format == "timeboxed" -> "sprint"
            else -> "release"
        }
        val members = scope.members(id)
        return linkedMapOf(
            "id" to id,
            "kind" to kind,
            "state" to when (release?.lifecycle) {
                null -> "backlog"
                "active" -> "active"
                else -> "planned"
            },
            "name" to (release?.name ?: "Бэклог"),
            "goal" to release?.goal,
            "start" to release?.plannedStart,
            "end" to release?.plannedEnd,
            "deadline" to release?.deadline,
            "revision" to release?.revision,
            "summary" to summary(members, id, scope),
            "rows" to tree(members, release, kind, scope),
        )
    }

    private fun summary(members: List<PlanningRow>, id: String, scope: Scope): Map<String, Any?> {
        val release = scope.open.firstOrNull { (it?.id ?: BACKLOG) == id }
        val leaves = members.filter { !scope.isEpic(it) }
        val counted = leaves.filter { !scope.mismatch(it) }
        val open = counted.filter { !isDone(it) }
        return linkedMapOf(
            "total" to leaves.size,
            "done" to leaves.count(::isDone),
            "open" to leaves.count { !isDone(it) },
            "estimateHours" to sum(counted.mapNotNull(scope::hours)),
            "remainingHours" to sum(open.mapNotNull(scope::hours)),
            "estimatePoints" to sum(counted.mapNotNull { it.estimate?.points() }),
            "remainingPoints" to sum(open.mapNotNull { it.estimate?.points() }),
            "noDue" to leaves.count { noDue(it, release) },
        )
    }

    /** Depth first, siblings by rank; a child whose parent sits elsewhere is a root row with the parent as a crumb. */
    private fun tree(
        members: List<PlanningRow>,
        release: Release?,
        kind: String,
        scope: Scope,
    ): List<Map<String, Any?>> {
        val ids = members.mapTo(HashSet(), PlanningRow::id)
        val order = compareBy<PlanningRow> { it.rank }
            .then { a, b -> ViewOrder.natural(a.displayId, b.displayId) }
            .then { a, b -> ViewOrder.text(a.id, b.id) }
        val nested = members.filter { it.parentId != null && it.parentId in ids }.groupBy { it.parentId!! }
        val roots = members.filter { it.parentId == null || it.parentId !in ids }.sortedWith(order)
        val result = ArrayList<Map<String, Any?>>()
        val stack = ArrayDeque(roots.reversed().map { it to 0 })
        val seen = HashSet<String>()
        while (stack.isNotEmpty()) {
            val (row, depth) = stack.removeLast()
            if (!seen.add(row.id)) continue
            result += row(row, depth, release, kind, ids, scope)
            nested[row.id].orEmpty().sortedWith(order).reversed().forEach { stack.addLast(it to depth + 1) }
        }
        return result
    }

    @Suppress("LongParameterList")
    private fun row(
        row: PlanningRow,
        depth: Int,
        release: Release?,
        kind: String,
        here: Set<String>,
        scope: Scope,
    ): Map<String, Any?> {
        val epic = scope.isEpic(row)
        val end = release?.plannedEnd
        return linkedMapOf(
            "id" to row.id,
            "key" to row.displayId,
            "title" to row.title,
            "kind" to if (epic) "epic" else "task",
            "type" to row.type,
            "parentId" to row.parentId,
            "depth" to depth,
            "status" to row.status,
            "done" to isDone(row),
            "priority" to row.priority,
            "ownerId" to row.ownerId,
            "ownerLabel" to ownerLabel(row, scope.names),
            "due" to row.due,
            "estimate" to row.estimate?.let { linkedMapOf("value" to it.value, "unit" to it.unit) },
            "estimateHours" to scope.hours(row),
            "estimatePoints" to row.estimate?.points(),
            "estimateMismatch" to scope.mismatch(row),
            "rank" to row.rank,
            "revision" to row.revision,
            "crumb" to row.parentId?.takeIf { it !in here }?.let { scope.byId[it]?.title },
            "afterSprintEnd" to
                (kind == "sprint" && !isDone(row) && end != null && row.due != null && row.due > end),
            "noDue" to (!epic && noDue(row, release)),
            "rollup" to if (epic) rollup(row, release?.id ?: BACKLOG, scope) else null,
        )
    }

    private fun noDue(row: PlanningRow, release: Release?) =
        release != null && release.format != "timeboxed" && row.due == null && !isDone(row)

    private fun rollup(epic: PlanningRow, containerId: String, scope: Scope): Map<String, Any?> {
        val leaves = scope.leaves(epic)
        val here = leaves.filter { (it.effectiveReleaseId ?: BACKLOG) == containerId }
        val counted = here.filter { !scope.mismatch(it) }
        val elsewhere = leaves.filter { (it.effectiveReleaseId ?: BACKLOG) != containerId }
            .groupBy { it.effectiveReleaseId ?: BACKLOG }
            .filterKeys { it in scope.openIds }
        return linkedMapOf(
            "here" to linkedMapOf(
                "total" to here.size,
                "done" to here.count(::isDone),
                "estimateHours" to sum(counted.mapNotNull(scope::hours)),
                "estimatePoints" to sum(counted.mapNotNull { it.estimate?.points() }),
            ),
            "elsewhere" to scope.open.map { it?.id ?: BACKLOG }.filter { it in elsewhere }.map { id ->
                linkedMapOf(
                    "containerId" to id,
                    "name" to scope.containerNames[id],
                    "count" to elsewhere.getValue(id).size,
                )
            },
        )
    }

    private fun sum(values: List<Double>) = TaskEstimate.rounded(values.sum())

    private fun today(tx: Transaction, projectId: String): String = tx.row(
        """
        SELECT to_char((clock_timestamp() AT TIME ZONE coalesce(auth.project_timezone($1), 'UTC'))::date, 'YYYY-MM-DD') AS today
        """.trimIndent(),
        projectId,
    )!!.string("today")

    private companion object {
        const val PROTOCOL = "sprintique.planning-containers/1"
        const val DEFAULT_DAYS = 14

        /**
         * Running sprints, the next sprints by start, open releases by deadline then name, the backlog last (null).
         */
        fun openContainers(releases: List<Release>): List<Release?> {
            val open = releases.filter { it.archivedAt == null && !finished(it) }
            val byName = Comparator<Release> { a, b -> ViewOrder.text(a.name, b.name) }
            val sprints = open.filter { it.format == "timeboxed" }
            val active = sprints.filter { it.lifecycle == "active" }
                .sortedWith(compareBy<Release> { it.plannedStart ?: "9999" }.then(byName))
            val planned = sprints.filter { it.lifecycle != "active" }
                .sortedWith(compareBy<Release> { it.plannedStart ?: "9999" }.then(byName))
            val others = open.filter { it.format != "timeboxed" }
                .sortedWith(compareBy<Release> { it.deadline ?: "9999" }.then(byName))
            return active + planned + others + listOf(null)
        }
    }
}
