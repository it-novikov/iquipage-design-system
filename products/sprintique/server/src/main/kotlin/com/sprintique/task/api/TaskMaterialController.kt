package com.sprintique.task.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.task.application.TaskMaterials
import com.sprintique.task.contract.PutTaskMaterialRequest
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@Profile("api")
class TaskMaterialController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/tasks/{task}/materials")
    fun list(@PathVariable projectId: String, @PathVariable task: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            TaskMaterials.list(tx, actor, RequestInputs.id(projectId), RequestInputs.id(task))
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{task}/materials/{id}")
    fun read(
        @PathVariable projectId: String,
        @PathVariable task: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        TaskMaterials.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(task), RequestInputs.id(id))
    }

    @PutMapping("/api/v1/projects/{projectId}/tasks/{task}/materials/{id}")
    @Accepts(PutTaskMaterialRequest::class)
    @Idempotent
    fun put(
        @PathVariable projectId: String,
        @PathVariable task: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(task)
        RequestInputs.id(id)
        val input = contracts.parse<PutTaskMaterialRequest>(body)
        TaskMaterials.put(
            tx, actor, projectId, task, id, input.baseRevision, input.value.toDomain(),
            RequestInputs.idempotencyKey(request), ledger,
        )
    }
}
