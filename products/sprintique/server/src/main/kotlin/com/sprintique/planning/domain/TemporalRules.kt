package com.sprintique.planning.domain

import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Limits and date rules of a project's plan, checked on the whole state after every change. */
object TemporalRules {
    const val ITEM_LIMIT = 10_000
    const val RELEASE_LIMIT = 1_000

    fun requireWithinLimits(tasks: Int, releases: Int, milestones: Int, constraints: Int, dependencies: Int) =
        requireCondition(
            tasks <= ITEM_LIMIT && releases <= RELEASE_LIMIT && milestones <= ITEM_LIMIT &&
                constraints <= ITEM_LIMIT && dependencies <= ITEM_LIMIT,
            422,
            "PROJECT_LIMIT",
            "Лимит проекта: 10 000 задач, вех и связей, 1000 релизов.",
        )

    /** A change of parent or release goes through a planning preview, which shows its consequences first. */
    fun previewRequired(message: String) = ProblemException(
        409,
        "PREVIEW_REQUIRED",
        message,
        mapOf("kind" to "planning-preview", "contractVersion" to 2),
    )

    /**
     * Constraints together with task dependencies form no cycle: that alone is refused. A dependency points opposite
     * to its predecessor constraint, so both share one acyclic graph and neither API can close the other's cycle.
     * Under the r4 policy a constraint whose dates do not hold is a warning: the result lists each one for people.
     */
    fun validate(state: PlanningState): List<String> {
        val conflicts = ArrayList<String>()
        requireWithinLimits(
            state.tasks.size,
            state.releases.size,
            state.milestones.size,
            state.constraints.size,
            state.dependencies.size,
        )
        val spans = LinkedHashMap<String, Span>()
        for (task in state.tasks) spans["task:${task.id}"] = Span(task.plannedStart, task.plannedEnd)
        for (release in state.releases) spans["release:${release.id}"] = Span(release.plannedStart, release.plannedEnd)
        for (milestone in state.milestones) spans["milestone:${milestone.id}"] = Span(milestone.date, milestone.date)
        val graph = Graph(spans.keys)
        for (constraint in state.constraints) {
            val source = "${constraint.source.kind}:${constraint.source.id}"
            val target = "${constraint.target.kind}:${constraint.target.id}"
            val before = spans[source]
            val after = spans[target]
            requireCondition(
                before != null && after != null,
                422,
                "TEMPORAL_REFERENCE",
                "Связанная запись недоступна.",
            )
            graph.edge(source, target)
            val left = if (constraint.relation[0] == 'F') before.end else before.start
            val right = if (constraint.relation[1] == 'F') after.end else after.start
            if (left != null && right != null &&
                ChronoUnit.DAYS.between(LocalDate.parse(left), LocalDate.parse(right)) < constraint.lagDays
            ) {
                conflicts += "Даты противоречат зависимости ${constraint.source.id} → ${constraint.target.id} " +
                    "(${constraint.relation}). Сохраним как есть."
            }
        }
        for (link in state.dependencies) {
            val source = "task:${link.toId}"
            val target = "task:${link.fromId}"
            requireCondition(
                source in spans && target in spans,
                422,
                "TASK_REFERENCE",
                "Связанные задачи недоступны.",
            )
            graph.edge(source, target)
        }
        requireCondition(graph.isAcyclic(), 422, "TEMPORAL_CYCLE", "Зависимость создаёт цикл.")
        return conflicts
    }

    private data class Span(val start: String?, val end: String?)

    private class Graph(nodes: Collection<String>) {
        private val edges = HashMap<String, MutableList<String>>()
        private val indegree = nodes.associateWithTo(LinkedHashMap()) { 0 }

        fun edge(from: String, to: String) {
            edges.getOrPut(from, ::ArrayList) += to
            indegree[to] = requirePresent(indegree[to], 422, "TEMPORAL_REFERENCE", "Связанная запись недоступна.") + 1
        }

        /** Kahn's algorithm: every node is released exactly when the graph has no cycle. */
        fun isAcyclic(): Boolean {
            val remaining = HashMap(indegree)
            val queue = ArrayDeque(remaining.filterValues { it == 0 }.keys)
            var released = 0
            while (queue.isNotEmpty()) {
                val node = queue.removeFirst()
                released++
                for (next in edges[node].orEmpty()) {
                    val degree = remaining.getValue(next) - 1
                    remaining[next] = degree
                    if (degree == 0) queue.addLast(next)
                }
            }
            return released == remaining.size
        }
    }
}
