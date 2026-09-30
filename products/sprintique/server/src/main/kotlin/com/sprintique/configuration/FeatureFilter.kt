package com.sprintique.configuration

import com.sprintique.web.FilterOrder
import com.sprintique.web.ProblemWriter
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * A switched-off feature does not exist (docs/adr W6): its API routes and its pages answer 404 before authentication,
 * so an anonymous caller cannot tell an off feature from an unknown path. The controllers check again.
 */
@Component
@Profile("api")
@Order(FilterOrder.FEATURES)
class FeatureFilter(private val flags: FeatureFlags) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val needed = required(request.requestURI)
        if (needed != null && !needed(flags)) {
            return ProblemWriter.write(request, response, 404, "NOT_FOUND", "Раздел недоступен.")
        }
        chain.doFilter(request, response)
    }

    companion object {
        private const val TASK = "^/api/v1/projects/[^/]+/tasks/[^/]+"
        private val ROUTES: List<Pair<Regex, (FeatureFlags) -> Boolean>> = listOf(
            Regex("^/workbench(/.*)?$") to { f -> f.isEnabled(Feature.WORKBENCH_READ_INTERNAL) },
            Regex("^/api/v1/workbench/plan$") to { f ->
                f.isEnabled(Feature.WORKBENCH_READ_INTERNAL) && f.isEnabled(Feature.WORKBENCH_PLAN_HORIZON)
            },
            // The overview's layout and the plan's time zone: part of the Workbench itself, not of the plan.
            Regex("^/api/v1/workbench/preferences$") to { f -> f.isEnabled(Feature.WORKBENCH_READ_INTERNAL) },
            Regex("^/api/v1/workbench(/list)?$") to { f -> f.isEnabled(Feature.WORKBENCH_READ_INTERNAL) },
            Regex("$TASK/personal$") to { f -> f.isEnabled(Feature.WORKBENCH_READ_INTERNAL) },
            // "Seen" moves the watermark that requests and waiting count their news from as well.
            // ("Жду" is derived from participation, so waiting alone adds nothing.)
            Regex("$TASK/personal/seen$") to { f ->
                f.isEnabled(Feature.WORKBENCH_PERSONAL_STATE) || f.isEnabled(Feature.WORKBENCH_REQUESTS)
            },
            Regex("$TASK/personal/snooze$") to { f ->
                f.isEnabled(Feature.WORKBENCH_PERSONAL_STATE) && f.isEnabled(Feature.WORKBENCH_REQUESTS)
            },
            Regex("$TASK/personal/(participation|rank)$") to { f -> f.isEnabled(Feature.WORKBENCH_PERSONAL_STATE) },
            // "Жду" is derived from participation: its check-back needs both switches.
            Regex("$TASK/personal/check-back$") to { f ->
                f.isEnabled(Feature.WORKBENCH_WAITING) && f.isEnabled(Feature.WORKBENCH_PERSONAL_STATE)
            },
            Regex("$TASK/requests$") to { f -> f.isEnabled(Feature.WORKBENCH_REQUESTS) },
            Regex("^/api/v1/projects/[^/]+/requests/[^/]+(/(resolve|reopen|cancel))?$") to { f ->
                f.isEnabled(Feature.WORKBENCH_REQUESTS)
            },
        )

        /** The switch a path needs, or null for a path that belongs to no switched feature. */
        fun required(path: String): ((FeatureFlags) -> Boolean)? = ROUTES.firstOrNull { it.first.matches(path) }?.second
    }
}
