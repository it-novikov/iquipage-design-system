package com.sprintique.task.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Capability
import com.sprintique.task.application.TaskLinkValue
import com.sprintique.task.application.TaskLinks
import com.sprintique.task.application.Tasks
import com.sprintique.task.contract.MoveTaskRequest
import com.sprintique.task.contract.PutTaskLinkRequest
import com.sprintique.task.contract.PutTaskRequest
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@Profile("api")
class TaskController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/tasks")
    fun list(
        @PathVariable projectId: String,
        @RequestParam(required = false) cursor: String?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ProjectAccess.authorize(tx, actor, RequestInputs.id(projectId), Capability.TASKS_READ)
        Tasks.list(tx, projectId, cursorOf(cursor))
    }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{id}")
    fun read(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ProjectAccess.authorize(tx, actor, RequestInputs.id(projectId), Capability.TASKS_READ)
        Tasks.read(tx, projectId, RequestInputs.id(id))
    }

    @PutMapping("/api/v1/projects/{projectId}/tasks/{id}")
    @Accepts(PutTaskRequest::class)
    fun put(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<PutTaskRequest>(body)
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_WRITE)
        ledger.idempotent(tx, actor, projectId, "task.put:$id", RequestInputs.idempotencyKey(request), input) {
            Tasks.put(tx, actor, projectId, id, input.baseRevision, input.task.toContent(), input.createInBoard)
        }
    }

    @PatchMapping("/api/v1/projects/{projectId}/tasks/{id}/position")
    @Accepts(MoveTaskRequest::class)
    fun move(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_WRITE)
        val input = contracts.parse<MoveTaskRequest>(body)
        ledger.idempotent(tx, actor, projectId, "task.position:$id", RequestInputs.idempotencyKey(request), input) {
            val content = Tasks.contentOf(Tasks.read(tx, projectId, id))
            Tasks.put(
                tx,
                actor,
                projectId,
                id,
                input.baseRevision,
                content.copy(status = input.status.wire, rank = input.rank),
            )
        }
    }

    @GetMapping("/api/v1/projects/{projectId}/task-links")
    fun links(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        TaskLinks.list(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("/api/v1/projects/{projectId}/task-links/{id}")
    @Accepts(PutTaskLinkRequest::class)
    fun putLink(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<PutTaskLinkRequest>(body)
        val link = input.value
        TaskLinks.put(
            tx,
            actor,
            projectId,
            id,
            input.baseRevision,
            TaskLinkValue(link.kind.wire, link.fromId, link.toId, link.archived),
            RequestInputs.idempotencyKey(request),
            ledger,
        )
    }

    private companion object {
        /** A non-negative task number; empty means the first page. */
        fun cursorOf(value: String?): Long {
            if (value.isNullOrBlank()) return 0
            return value.trim().toLongOrNull()?.takeIf { it >= 0 } ?: throw RequestValidationException()
        }
    }
}
