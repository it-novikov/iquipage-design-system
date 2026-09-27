package com.sprintique.discussion.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.discussion.application.Discussions
import com.sprintique.discussion.application.NewThread
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Capability
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Discussions on tasks. The use cases own the write fence and the retry ledger; routes only read input. */
@RestController
@Profile("api")
class DiscussionController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/tasks/{id}/threads")
    fun page(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) limit: String?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.authorize(tx, actor, projectId, Capability.THREADS_READ)
        if (cursor != null && cursor.length > CURSOR_LIMIT) throw RequestValidationException()
        Discussions.page(tx, actor, projectId, id, cursor, limitOf(limit))
    }

    @GetMapping("/api/v1/projects/{projectId}/threads/{id}")
    fun read(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.authorize(tx, actor, projectId, Capability.THREADS_READ)
        Discussions.read(tx, projectId, id)
    }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{id}/threads")
    @Accepts(CreateThreadRequest::class)
    fun create(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<CreateThreadRequest>(body)
        val thread = NewThread(input.id, input.messageId, input.body, input.requiresResolution)
        Discussions.create(tx, actor, projectId, id, thread, RequestInputs.idempotencyKey(request), ledger)
    }

    @PostMapping("/api/v1/projects/{projectId}/threads/{id}/messages")
    @Accepts(AppendMessageRequest::class)
    fun append(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<AppendMessageRequest>(body)
        val message = Discussions.NewMessage(input.id, input.body, input.baseRevision)
        Discussions.append(tx, actor, projectId, id, message, RequestInputs.idempotencyKey(request), ledger)
    }

    @PatchMapping("/api/v1/projects/{projectId}/threads/{id}/kind")
    @Accepts(ChangeThreadKindRequest::class)
    fun changeKind(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ChangeThreadKindRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        Discussions.changeKind(tx, actor, projectId, id, input.requiresResolution, input.baseRevision, key, ledger)
    }

    /** The caller's own view state: it needs read access and no retry ledger (moving forward twice is moving once). */
    @PostMapping("/api/v1/projects/{projectId}/threads/{id}/read")
    @Accepts(MarkThreadReadRequest::class)
    fun markRead(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.authorize(tx, actor, projectId, Capability.THREADS_READ)
        val input = contracts.parse<MarkThreadReadRequest>(body)
        Discussions.markRead(tx, actor, projectId, id, input.seenActivityAt)
    }

    @PatchMapping("/api/v1/projects/{projectId}/threads/{id}/resolution")
    @Accepts(ResolveThreadRequest::class)
    fun resolve(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ResolveThreadRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        Discussions.resolve(tx, actor, projectId, id, input.resolved, input.baseRevision, key, ledger)
    }

    private companion object {
        const val CURSOR_LIMIT = 2048
        const val DEFAULT_LIMIT = 20
        const val MAX_LIMIT = 50

        fun limitOf(value: String?): Int {
            if (value == null) return DEFAULT_LIMIT
            return value.trim().toIntOrNull()?.takeIf { it in 1..MAX_LIMIT } ?: throw RequestValidationException()
        }
    }
}
