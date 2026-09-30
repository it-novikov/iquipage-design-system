package com.sprintique.workbench.api

import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.web.RequestValidationException
import com.sprintique.workbench.application.Field
import com.sprintique.workbench.application.Plan
import com.sprintique.workbench.application.Workbench
import com.sprintique.workbench.application.WorkbenchCursors
import com.sprintique.workbench.application.WorkbenchLayout
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
        val query = QueryParameters(request, setOf("horizon", "projects", "timezone", "undated"))
        val horizon = Horizon.fromWire(query.oneOf("horizon", Horizon.entries.map { it.wire }.toSet()) ?: "today")!!
        val timezone = query.string("timezone", MAX_ZONE)?.also {
            if (PlanHorizon.zoneOf(it) == null) throw RequestValidationException()
        }
        // The overview's week needs only the number of undated tasks, not their rows.
        val undatedRows = (query.oneOf("undated", setOf("list", "count")) ?: "list") == "list"
        Plan.horizon(tx, actor, horizon, projectsOf(query), timezone, parts(), undatedRows)
    }

    @GetMapping("/api/v1/workbench/preferences")
    fun preferences(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        QueryParameters(request, emptySet())
        Plan.preferences(tx, actor)
    }

    @PutMapping("/api/v1/workbench/preferences")
    @Accepts(PutWorkbenchPreferencesRequest::class)
    fun savePreferences(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        val input = contracts.parse<PutWorkbenchPreferencesRequest>(body)
        val present = { name: String -> body?.has(name) == true }
        Plan.savePreferences(
            tx,
            actor,
            input.baseRevision,
            timezone = if (present("timezone")) Field.Set(input.timezone) else Field.Keep,
            layout = if (present("layout")) Field.Set(input.layout?.let(::layoutOf)) else Field.Keep,
        )
    }

    private fun parts() = flags.workbenchParts()

    private fun layoutOf(layout: WorkbenchLayoutInput) = WorkbenchLayout(
        hiddenWidgets = layout.hiddenWidgets.map { it.wire }.distinct().sorted(),
        currentWork = layout.currentWork.wire,
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

/**
 * What the Workbench serves under the current switches. "Жду" is derived from participation (docs/adr W5), so it is
 * on only while personal state is: a waiting group that can never fill is reported off, not on and empty.
 */
internal fun FeatureFlags.workbenchParts() = WorkbenchParts(
    requests = isEnabled(Feature.WORKBENCH_REQUESTS),
    personal = isEnabled(Feature.WORKBENCH_PERSONAL_STATE),
    waiting = isEnabled(Feature.WORKBENCH_WAITING) && isEnabled(Feature.WORKBENCH_PERSONAL_STATE),
)
