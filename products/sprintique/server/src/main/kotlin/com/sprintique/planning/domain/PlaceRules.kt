package com.sprintique.planning.domain

import com.sprintique.problem.requireCondition

/** Which tasks a move carries and where they land among the root rows of the target container. */
object PlaceRules {
    const val STEP = 1024.0
    private const val MINIMUM_GAP = 1e-6

    /**
     * The moved block in order: each named task, then (with [withChildren]) its descendants that sit in its own
     * container, depth first by rank. Descendants in other containers stay where they are.
     */
    fun block(ids: List<String>, withChildren: Boolean, rows: List<PlanningRow>): List<String> {
        val byId = rows.associateBy(PlanningRow::id)
        requireCondition(ids.all { it in byId }, 404, "TASK_NOT_FOUND", "Одна или несколько задач недоступны.")
        val children = rows.filter { it.parentId != null }.groupBy { it.parentId!! }
        val result = LinkedHashSet<String>()
        for (id in ids) {
            if (!result.add(id) || !withChildren) continue
            val source = byId.getValue(id).effectiveReleaseId
            val stack = ArrayDeque(ordered(children[id].orEmpty()).reversed())
            while (stack.isNotEmpty()) {
                val child = stack.removeLast()
                if (child.effectiveReleaseId != source || !result.add(child.id)) continue
                ordered(children[child.id].orEmpty()).reversed().forEach(stack::addLast)
            }
        }
        return result.toList()
    }

    /**
     * New ranks of the block's roots right after [afterId] among [roots] (null: first). Usually only the block gets
     * ranks between its neighbours; when the gap is exhausted the whole container is renumbered in the new order.
     */
    fun ranks(roots: List<TaskState>, block: List<String>, afterId: String?): List<Pair<String, Double>> {
        val at = if (afterId == null) 0 else roots.indexOfFirst { it.id == afterId } + 1
        requireCondition(
            at > 0 || afterId == null,
            422,
            "PLACE_SCOPE",
            "Вставить можно только после ряда верхнего уровня этого контейнера.",
        )
        val previous = roots.getOrNull(at - 1)?.rank
        val next = roots.getOrNull(at)?.rank
        val count = block.size
        val ranks = (1..count).map { index ->
            when {
                previous == null && next == null -> index * STEP
                previous == null -> next!! - (count - index + 1) * STEP
                next == null -> previous + index * STEP
                else -> previous + (next - previous) * index / (count + 1)
            }
        }
        val fits = ranks.indices.all { i ->
            val low = if (i == 0) previous else ranks[i - 1]
            val high = if (i == ranks.lastIndex) next else ranks[i + 1]
            (low == null || ranks[i] - low > MINIMUM_GAP) && (high == null || high - ranks[i] > MINIMUM_GAP)
        }
        if (fits) return block.zip(ranks)
        val ordered = roots.take(at).map(TaskState::id) + block + roots.drop(at).map(TaskState::id)
        return ordered.mapIndexed { index, id -> id to (index + 1) * STEP }
    }

    private fun ordered(rows: List<PlanningRow>) =
        rows.sortedWith(compareBy<PlanningRow> { it.rank }.thenBy { it.displayId.length }.thenBy { it.displayId })
}
