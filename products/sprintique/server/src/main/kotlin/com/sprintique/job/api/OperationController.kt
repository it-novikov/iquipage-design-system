package com.sprintique.job.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.UUID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.job.application.Operations
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Background work of a project, for its administrators. */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}/operations")
class OperationController(private val requests: AuthenticatedRequests, private val ledger: CommandLedger) {
    @GetMapping
    fun overview(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Operations.overview(tx, actor, RequestInputs.id(projectId))
    }

    /** Takes an empty object: the retry itself carries no options. */
    @PostMapping("/jobs/{id}/retry")
    fun retry(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        if (!UUID_PATTERN.matches(id)) throw RequestValidationException()
        if (body == null || !body.isObject || !body.isEmpty) throw RequestValidationException()
        Operations.retry(tx, actor, projectId, id, RequestInputs.idempotencyKey(request), ledger)
    }

    private companion object {
        val UUID_PATTERN = Regex(UUID)
    }
}
