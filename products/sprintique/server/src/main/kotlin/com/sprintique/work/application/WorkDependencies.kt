package com.sprintique.work.application

import com.sprintique.problem.requireCondition
import tools.jackson.databind.JsonNode

/** Bounded directed graph; unknown predecessors and cycles are rejected before the plan is saved. */
internal object WorkDependencies {
    fun validate(steps: List<WorkStep>) {
        validate(steps.associate { it.id to it.dependsOn })
    }

    fun validate(steps: JsonNode) {
        validate(
            steps.values().associate { step ->
                step.path("id").asString() to step.path("dependsOn").values().map { it.asString() }
            },
        )
    }

    private fun validate(graph: Map<String, List<String>>) {
        val pending = graph.keys.toMutableSet()
        val done = mutableSetOf<String>()
        requireCondition(
            graph.all { (id, dependencies) -> dependencies.all { it in graph && it != id } },
            422, "WORK_DEPENDENCY", "Зависимости должны указывать на другие шаги этого плана.",
        )
        while (pending.isNotEmpty()) {
            val ready = pending.filter { graph.getValue(it).all(done::contains) }
            requireCondition(ready.isNotEmpty(), 422, "WORK_DEPENDENCY", "В зависимостях шагов найден цикл.")
            done.addAll(ready)
            pending.removeAll(ready.toSet())
        }
    }

    fun requirePredecessors(steps: JsonNode, step: JsonNode, state: String) {
        if (state !in setOf("doing", "done")) return
        val ready = step.path("dependsOn").values().all { dependency ->
            steps.values().any { it.path("id") == dependency && it.path("state").asString() == "done" }
        }
        requireCondition(ready, 409, "WORK_DEPENDENCY_PENDING", "Сначала завершите предшествующие шаги.")
    }
}
