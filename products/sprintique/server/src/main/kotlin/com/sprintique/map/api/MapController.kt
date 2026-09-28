package com.sprintique.map.api

import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.contract.QueryParameters
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.map.application.MapTemplates
import com.sprintique.map.application.Maps
import com.sprintique.map.contract.PutMapRequest
import com.sprintique.map.contract.PutMapTemplateRequest
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Idea maps and map templates of a project. */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}")
class MapController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val maps: Maps,
    private val templates: MapTemplates,
) {
    @GetMapping("/maps")
    fun list(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val query = QueryParameters(request, setOf("cursor"))
        maps.list(tx, actor, projectId, query.id("cursor"))
    }

    @GetMapping("/maps/{id}")
    fun read(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> maps.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id)) }

    @GetMapping("/maps/{id}/history")
    fun history(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            RequestInputs.id(id)
            val query = QueryParameters(request, setOf("before"))
            val before = if (request.getParameter("before") == null) null else query.int("before", 1..Int.MAX_VALUE, 1)
            maps.history(tx, actor, projectId, id, before?.toLong())
        }

    @GetMapping("/maps/{id}/history/{revision}")
    fun version(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @PathVariable revision: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val number = revision.trim().toIntOrNull()?.takeIf { it > 0 } ?: throw RequestValidationException()
        maps.version(tx, actor, projectId, id, number.toLong())
    }

    @PutMapping("/maps/{id}")
    @Accepts(PutMapRequest::class)
    @Idempotent
    fun write(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<PutMapRequest>(body)
        maps.write(tx, actor, projectId, id, input, RequestInputs.idempotencyKey(request))
    }

    @GetMapping("/map-templates")
    fun templates(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        templates.list(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("/map-templates/{id}")
    @Accepts(PutMapTemplateRequest::class)
    @Idempotent
    fun writeTemplate(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<PutMapTemplateRequest>(body)
        templates.write(tx, actor, projectId, id, input, RequestInputs.idempotencyKey(request))
    }
}
