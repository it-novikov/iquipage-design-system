package com.sprintique.planning.domain

/** Read-only dependencies from the complete, authorized project snapshot, before board filtering or paging. */
object TaskBlockers {
    private const val SUMMARY_LIMIT = 3
    data class Blocker(val id: String, val displayId: String, val title: String)

    data class Summary(val effectiveBlocked: Boolean, val blockingTaskCount: Int, val blockers: List<Blocker>)

    fun project(state: PlanningState): Map<String, Summary> {
        val tasks = state.tasks.associateBy(TaskState::id)
        val unfinished = state.dependencies.mapNotNull { link ->
            val source = tasks[link.fromId] ?: return@mapNotNull null
            val target = tasks[link.toId] ?: return@mapNotNull null
            if (!unfinished(source) || !unfinished(target)) return@mapNotNull null
            source.id to target
        }.groupBy({ it.first }, { it.second })
        return unfinished.mapValues { (_, candidates) ->
            val blockers = candidates.distinctBy(TaskState::id).sortedWith(
                compareBy(TaskState::displayId, TaskState::id),
            )
            Summary(true, blockers.size, blockers.take(SUMMARY_LIMIT).map { Blocker(it.id, it.displayId, it.title) })
        }
    }

    val clear = Summary(false, 0, emptyList())

    private fun unfinished(task: TaskState) = task.result == "open" && task.status != "ready_for_release"
}
