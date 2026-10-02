package com.sprintique.configuration

import com.sprintique.problem.ProblemException
import org.springframework.stereotype.Component

/** A product feature that is rolled out behind a switch (docs/adr W6). */
enum class Feature(val wire: String) {
    WORKBENCH_READ_INTERNAL("workbench_read_internal"),
    WORKBENCH_PERSONAL_STATE("workbench_personal_state"),
    WORKBENCH_REQUESTS("workbench_requests"),
    WORKBENCH_WAITING("workbench_waiting"),
    WORKBENCH_PLAN_HORIZON("workbench_plan_horizon"),
    WORKBENCH_MVP("workbench_mvp"),

    /** AI connections of workspaces and agents of service accounts (docs/decisions/0005-ai-agents.md). */
    AI_AGENTS("ai_agents"),
}

/**
 * Which features this process serves. A disabled feature's routes answer 404 as if they did not exist, and the
 * session tells the interface which ones are on. Unknown names stop the process at start: a typo must not silently
 * leave a feature off.
 */
@Component
class FeatureFlags(properties: SprintiqueProperties) {
    val enabled: Set<Feature> = parse(properties.features, properties.isProduction)

    fun isEnabled(feature: Feature): Boolean = feature in enabled

    fun require(feature: Feature) {
        if (feature !in enabled) throw ProblemException(404, "NOT_FOUND", "Раздел недоступен.")
    }

    companion object {
        fun parse(value: String, production: Boolean): Set<Feature> {
            val names = value.split(',').map(String::trim).filter(String::isNotEmpty)
            return when {
                names.isEmpty() -> if (production) emptySet() else Feature.entries.toSet()

                names == listOf("all") -> Feature.entries.toSet()

                names == listOf("none") -> emptySet()

                else -> names.map { name ->
                    requireNotNull(Feature.entries.firstOrNull { it.wire == name }) {
                        "SPRINTIQUE_FEATURES names an unknown feature: $name"
                    }
                }.toSet()
            }
        }
    }
}
