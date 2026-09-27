package com.sprintique.workspace.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.workspace.application.TaskSettings
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** The project's task templates. */
@RestController
@Profile("api")
class TaskSettingsController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/task-settings")
    fun read(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        TaskSettings.read(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("/api/v1/projects/{projectId}/task-settings")
    @Accepts(PutTaskSettingsRequest::class)
    fun write(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<PutTaskSettingsRequest>(body)
        val value = storedTemplates(body!!)
        TaskSettings.write(
            tx,
            actor,
            projectId,
            input.baseRevision,
            value,
            RequestInputs.idempotencyKey(request),
            ledger,
        )
    }
}
