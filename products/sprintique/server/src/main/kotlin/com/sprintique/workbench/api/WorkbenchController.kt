package com.sprintique.workbench.api

import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.web.RequestValidationException
import com.sprintique.workbench.application.Plan
import com.sprintique.workbench.application.Workbench
import com.sprintique.workbench.application.WorkbenchCursors
import com.sprintique.workbench.application.WorkbenchParts
import com.sprintique.workbench.domain.Horizon
import com.sprintique.workbench.domain.PlanHorizon
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * The person's Workbench (docs/adr W4–W6): one snapshot of "Сейчас", the next page of one section, the read-only
 * plan and the chosen time zone. Every answer is personal, so none is cached (the default `no-store` stays).
 */
@RestController
@Profile("api")
class WorkbenchController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val flags: FeatureFlags,
    private val cursors: WorkbenchCursors,
) {
    @GetMapping("/api/v1/workbench")
    fun envelope(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        val query = QueryParameters(request, setOf("mode", "projects", "limit"))
        query.oneOf("mode", setOf("now"))
        val limit = query.int("limit", 1..Workbench.MAXIMUM_LIMIT, Workbench.DEFAULT_LIMIT)
        Workbench.envelope(tx, actor, projectsOf(query), limit, parts(), cursors)
    }

    @GetMapping("/api/v1/workbench/list")
    fun list(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        val query = QueryParameters(request, setOf("section", "projects", "cursor", "limit"))
        val section = query.oneOf("section", Workbench.SECTIONS.toSet()) ?: throw RequestValidationException()
        val limit = query.int("limit", 1..Workbench.MAXIMUM_LIMIT, Workbench.DEFAULT_LIMIT)
        val cursor = query.string("cursor", QueryParameters.CURSOR_LIMIT)
        Workbench.list(tx, actor, section, projectsOf(query), cursor, limit, parts(), cursors)
    }

    @GetMapping("/api/v1/workbench/plan")
    fun plan(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        flags.require(Feature.WORKBENCH_PLAN_HORIZON)
        val query = QueryParameters(request, setOf("horizon", "projects", "timezone"))
        val horizon = Horizon.fromWire(query.oneOf("horizon", Horizon.entries.map { it.wire }.toSet()) ?: "today")!!
        val timezone = query.string("timezone", MAX_ZONE)?.also {
            if (PlanHorizon.zoneOf(it) == null) throw RequestValidationException()
        }
        Plan.horizon(tx, actor, horizon, projectsOf(query), timezone, parts())
    }

    @GetMapping("/api/v1/workbench/preferences")
    fun preferences(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_PLAN_HORIZON)
        QueryParameters(request, emptySet())
        Plan.preferences(tx, actor)
    }

    @PutMapping("/api/v1/workbench/preferences")
    @Accepts(PutWorkbenchPreferencesRequest::class)
    fun savePreferences(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_PLAN_HORIZON)
        val input = contracts.parse<PutWorkbenchPreferencesRequest>(body)
        Plan.savePreferences(tx, actor, input.baseRevision, input.timezone)
    }

    private fun parts() = WorkbenchParts(
        requests = flags.isEnabled(Feature.WORKBENCH_REQUESTS),
        personal = flags.isEnabled(Feature.WORKBENCH_PERSONAL_STATE),
        waiting = flags.isEnabled(Feature.WORKBENCH_WAITING),
    )

    private companion object {
        const val MAX_ZONE = 100
        const val MAX_FILTER = 100
        private val ID = Regex(RESOURCE_ID)

        /**
         * `projects=a,b`: the filter of the output, not navigation. Absent means every accessible project; an id the
         * caller cannot see simply yields nothing, exactly like an id that does not exist.
         */
        fun projectsOf(query: QueryParameters): List<String>? {
            val raw = query.string("projects", MAX_FILTER * (RESOURCE_LENGTH + 1)) ?: return null
            val ids = raw.split(',').map(String::trim)
            if (ids.isEmpty() || ids.size > MAX_FILTER ||
                ids.any { !ID.matches(it) }
            ) {
                throw RequestValidationException()
            }
            return ids.distinct().sorted()
        }

        const val RESOURCE_LENGTH = 100
    }
}
