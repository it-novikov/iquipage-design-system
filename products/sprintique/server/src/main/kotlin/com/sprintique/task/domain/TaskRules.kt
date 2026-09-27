package com.sprintique.task.domain

import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent

/** Rules every writer of tasks shares: task editing, planning commands and their previews. */
object TaskRules {
    /** Root depth is zero. Writers and every planning projection share this limit. */
    const val MAX_DEPTH = 100

    fun requireOpen(result: String) =
        requireCondition(result == "open", 409, "RESULT_PINNED", "Принятый результат закреплён в истории.")

    /**
     * Depth of every task, checking that each parent exists, no chain is a cycle and no chain is deeper than
     * [MAX_DEPTH]. Iterative and memoized, so a moved subtree is checked whole without recursion.
     */
    fun validateHierarchy(parents: Map<String, String?>): Map<String, Int> {
        val depths = HashMap<String, Int>()
        for (start in parents.keys) {
            if (start in depths) continue
            val chain = ArrayList<String>()
            val visiting = HashSet<String>()
            var current: String? = start
            // Climb until a task of known depth or a root; the depth below the chain is that of its end.
            while (current != null && current !in depths) {
                requireCondition(visiting.add(current), 422, "TASK_CYCLE", "Связь создаёт цикл задач.")
                chain += current
                current = parents[current]?.let { parent ->
                    requirePresent(
                        parent.takeIf {
                            it in parents
                        },
                        422, "TASK_PARENT", "Родительская задача недоступна.",
                    )
                }
            }
            var depth = current?.let(depths::getValue) ?: -1
            for (id in chain.asReversed()) {
                depth++
                requireCondition(
                    depth <= MAX_DEPTH,
                    422,
                    "HIERARCHY_DEPTH",
                    "Иерархия глубже 100 уровней не поддерживается.",
                )
                depths[id] = depth
            }
        }
        return depths
    }
}
