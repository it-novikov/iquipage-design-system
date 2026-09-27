package com.sprintique.planning.api

import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.planning.application.PlanningView
import com.sprintique.planning.application.ViewIntents
import com.sprintique.planning.contract.ViewIntent
import com.sprintique.planning.contract.ViewOptionsQuery
import com.sprintique.planning.contract.ViewQuery
import com.sprintique.planning.contract.ViewReleaseQuery
import com.sprintique.planning.contract.ViewRowsQuery
import com.sprintique.planning.contract.ViewSelectQuery
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** The planning screen's projection. Queries are bounded POSTs with structured filters; they never change data. */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}/planning/view")
class PlanningViewController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val view: PlanningView,
    private val intents: ViewIntents,
) {
    @PostMapping("/groups")
    @Accepts(ViewQuery::class)
    fun groups(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            view.groups(tx, actor, projectId, contracts.parse<ViewQuery>(body))
        }

    @PostMapping("/rows")
    @Accepts(ViewRowsQuery::class)
    fun rows(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            view.rows(tx, actor, projectId, contracts.parse<ViewRowsQuery>(body))
        }

    @PostMapping("/timeline")
    @Accepts(ViewQuery::class)
    fun timeline(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            view.timeline(tx, actor, projectId, contracts.parse<ViewQuery>(body))
        }

    @PostMapping("/selection")
    @Accepts(ViewSelectQuery::class)
    fun selection(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            view.select(tx, actor, projectId, contracts.parse<ViewSelectQuery>(body))
        }

    @PostMapping("/options")
    @Accepts(ViewOptionsQuery::class)
    fun options(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            view.options(tx, actor, projectId, contracts.parse<ViewOptionsQuery>(body))
        }

    @PostMapping("/release")
    @Accepts(ViewReleaseQuery::class)
    fun release(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val query = contracts.parse<ViewReleaseQuery>(body)
            view.describeRelease(tx, actor, projectId, query.groupId, query.cursor)
        }

    @GetMapping("/settings")
    fun settings(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        view.settings(tx, actor, RequestInputs.id(projectId))
    }

    @PostMapping("/preview")
    @Accepts(ViewIntent::class)
    fun preview(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            intents.previewIntent(tx, actor, projectId, contracts.parse<ViewIntent>(body))
        }
}
