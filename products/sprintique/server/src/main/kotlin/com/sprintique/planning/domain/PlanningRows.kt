package com.sprintique.planning.domain

import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.domain.TaskRules
import java.util.Locale

/** The one resolver of effective releases and board admission, shared by planning, the board, previews and history. */
object PlanningRows {
    fun project(tasks: Collection<TaskState>, releases: Map<String, Release>): List<PlanningRow> {
        TaskRules.validateHierarchy(tasks.associateTo(LinkedHashMap()) { it.id to it.parentId })
        val byId = tasks.associateBy(TaskState::id)
        val resolved = HashMap<String, Resolution>()
        val children = HashMap<String, Int>()
        for (task in tasks) task.parentId?.let { children.merge(it, 1, Int::plus) }
        for (task in tasks) resolve(task, byId, resolved)
        return tasks.map { task ->
            val effective = resolved.getValue(task.id)
            val release = effective.releaseId?.let {
                requirePresent(releases[it], 422, "TASK_RELEASE", "Релиз недоступен.")
            }
            val onBoard = task.preparation == "ready" && task.result == "open" &&
                (if (release != null) release.lifecycle == "active" else task.admitted)
            task.toRow(effective.releaseId, effective.sourceId, onBoard, children[task.id] ?: 0)
        }
    }

    fun project(state: PlanningState): List<PlanningRow> =
        project(state.tasks, state.releases.associateBy(Release::id))

    private data class Resolution(val releaseId: String?, val sourceId: String?)

    /** Climbs until a task decides its own release (or a root); every task on the way inherits the answer. */
    private fun resolve(task: TaskState, byId: Map<String, TaskState>, resolved: MutableMap<String, Resolution>) {
        val chain = ArrayList<TaskState>()
        val visiting = HashSet<String>()
        var current: TaskState? = task
        var value: Resolution? = null
        while (current != null && value == null) {
            requireCondition(visiting.add(current.id), 422, "TASK_CYCLE", "Связь создаёт цикл задач.")
            value = resolved[current.id]
            if (value == null) {
                chain += current
                value = decision(current)
                current = current.parentId?.let {
                    requirePresent(byId[it], 422, "TASK_PARENT", "Родительская задача недоступна.")
                }
            }
        }
        for (item in chain) resolved[item.id] = value ?: Resolution(null, null)
    }

    /** A task that does not inherit decides its release itself: its own, or none. */
    private fun decision(task: TaskState): Resolution? = when (task.assignmentMode) {
        "inherit" -> null
        "assigned" -> Resolution(task.releaseId, task.id)
        else -> Resolution(null, task.id)
    }

    /** The ids a selection names, in row order for filters and in the given order for explicit lists. */
    fun selected(
        selection: Selection,
        rows: List<PlanningRow>,
        releases: Collection<Release> = emptyList(),
    ): Set<String> =
        when (selection) {
            is Selection.Tasks -> {
                val available = rows.mapTo(HashSet(), PlanningRow::id)
                requireCondition(
                    selection.ids.all { it in available },
                    404,
                    "TASK_NOT_FOUND",
                    "Одна или несколько задач недоступны.",
                )
                LinkedHashSet(selection.ids)
            }

            is Selection.Matching -> matching(selection.filter, rows, releases)

            Selection.Project -> rows.mapTo(LinkedHashSet(), PlanningRow::id)

            Selection.Unassigned -> rows.filter {
                it.effectiveReleaseId == null
            }.mapTo(LinkedHashSet(), PlanningRow::id)

            is Selection.InRelease ->
                rows.filter { it.effectiveReleaseId == selection.releaseId }.mapTo(LinkedHashSet(), PlanningRow::id)
        }

    private fun matching(filter: SelectionFilter, rows: List<PlanningRow>, releases: Collection<Release>): Set<String> {
        val byId = rows.associateBy(PlanningRow::id)
        val roots = filter.roots?.toSet()
        if (roots != null) {
            requireCondition(roots.all { it in byId }, 404, "TASK_NOT_FOUND", "Выбранная задача недоступна.")
        }
        val query = filter.q.lowercase(Locale.ROOT)
        val matchingReleases = if (filter.matchReleaseNames && filter.q.isNotEmpty()) {
            releases.filter { query in it.name.lowercase(Locale.ROOT) }.mapTo(HashSet(), Release::id)
        } else {
            emptySet()
        }
        return rows.filter { row ->
            (roots == null || underRoot(row, roots, byId)) &&
                textMatches(filter, query, row, matchingReleases) &&
                stateMatches(filter, row) &&
                ownerMatches(filter.owner, row.ownerId) &&
                tagsMatch(filter, row.tagIds)
        }.mapTo(LinkedHashSet(), PlanningRow::id)
    }

    /** The text is in the title or key, or names the task's release when release names count. */
    private fun textMatches(filter: SelectionFilter, query: String, row: PlanningRow, releases: Set<String>) =
        filter.q.isEmpty() || query in "${row.title} ${row.displayId}".lowercase(Locale.ROOT) ||
            (row.effectiveReleaseId != null && row.effectiveReleaseId in releases)

    private fun stateMatches(filter: SelectionFilter, row: PlanningRow): Boolean {
        val candidate = row.preparation == "ready" && row.status == "ready_for_release" && row.result == "open"
        return (filter.preparation == "all" || row.preparation == filter.preparation) &&
            (filter.releaseId !is Maybe.Given || row.effectiveReleaseId == filter.releaseId.value) &&
            (!filter.candidates || candidate) &&
            (!filter.openOnly || row.result == "open")
    }

    private fun underRoot(row: PlanningRow, roots: Set<String>, byId: Map<String, PlanningRow>): Boolean {
        var current: PlanningRow? = row
        while (current != null) {
            if (current.id in roots) return true
            current = current.parentId?.let(byId::get)
        }
        return false
    }

    private fun ownerMatches(owner: String, ownerId: String?) = when (owner) {
        "" -> true
        "__none__" -> ownerId == null
        else -> ownerId == owner
    }

    private fun tagsMatch(filter: SelectionFilter, tagIds: List<String>) = filter.tagIds.isEmpty() ||
        if (filter.tagMode == "all") filter.tagIds.all(tagIds::contains) else filter.tagIds.any(tagIds::contains)
}
