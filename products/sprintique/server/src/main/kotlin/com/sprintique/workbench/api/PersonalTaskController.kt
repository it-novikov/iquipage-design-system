package com.sprintique.workbench.api

import com.sprintique.command.CommandLedger
import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.contract.UUID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.web.RequestValidationException
import com.sprintique.workbench.application.AttentionRequests
import com.sprintique.workbench.application.NewAttentionRequest
import com.sprintique.workbench.application.PersonalState
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.time.Instant

/**
 * A person's relation to one task of a project (docs/adr W1–W3, W5): the private fields, "Жду" and the directed
 * requests. The canonical key is `(projectId, taskId)`; every command checks access, the task and its own revision
 * again on the server, whatever the Workbench row suggested.
 */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}")
@Suppress("TooManyFunctions")
class PersonalTaskController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
    private val flags: FeatureFlags,
) {
    /** The caller's own state of the task and the requests on it, for the drawer. */
    @GetMapping("/tasks/{taskId}/personal")
    fun read(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_READ_INTERNAL)
        ids(projectId, taskId)
        val state = PersonalState.read(tx, actor, projectId, taskId)
        LinkedHashMap(state).apply {
            val shared = flags.isEnabled(Feature.WORKBENCH_REQUESTS)
            put("requests", if (shared) AttentionRequests.forTask(tx, actor, projectId, taskId) else null)
            put(
                "features",
                linkedMapOf(
                    "participation" to flags.isEnabled(Feature.WORKBENCH_PERSONAL_STATE),
                    "requests" to flags.isEnabled(Feature.WORKBENCH_REQUESTS),
                    "waiting" to flags.isEnabled(Feature.WORKBENCH_WAITING),
                ),
            )
        }
    }

    /** "Участвую": the person tracks the task and keeps it on their Workbench (docs/adr W5). */
    @PutMapping("/tasks/{taskId}/personal/participation")
    @Accepts(PutParticipationRequest::class)
    @Idempotent
    fun participation(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_PERSONAL_STATE)
        ids(projectId, taskId)
        val input = contracts.parse<PutParticipationRequest>(body)
        PersonalState.participation(tx, actor, projectId, taskId, input.baseRevision, input.participating, key(request))
    }

    @PutMapping("/tasks/{taskId}/personal/rank")
    @Accepts(PutRankRequest::class)
    @Idempotent
    fun rank(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_PERSONAL_STATE)
        ids(projectId, taskId)
        val input = contracts.parse<PutRankRequest>(body)
        val scope = input.projects?.distinct()?.sorted()
        PersonalState.rank(tx, actor, projectId, taskId, input.baseRevision, input.move.move, scope, key(request))
    }

    /** The private date to check delegated work ("Жду"); null clears it. */
    @PutMapping("/tasks/{taskId}/personal/check-back")
    @Accepts(PutCheckBackRequest::class)
    @Idempotent
    fun checkBack(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_WAITING)
        ids(projectId, taskId)
        val input = contracts.parse<PutCheckBackRequest>(body)
        PersonalState.checkBack(tx, actor, projectId, taskId, input.baseRevision, input.checkBackAt, key(request))
    }

    @PutMapping("/tasks/{taskId}/personal/seen")
    @Accepts(PutSeenRequest::class)
    @Idempotent
    fun seen(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ids(projectId, taskId)
        val input = contracts.parse<PutSeenRequest>(body)
        PersonalState.seen(tx, actor, projectId, taskId, input.baseRevision, input.sequence, key(request))
    }

    @PutMapping("/tasks/{taskId}/personal/snooze")
    @Accepts(PutSnoozeRequest::class)
    @Idempotent
    fun snooze(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_PERSONAL_STATE)
        flags.require(Feature.WORKBENCH_REQUESTS)
        ids(projectId, taskId)
        val input = contracts.parse<PutSnoozeRequest>(body)
        val until = input.until?.let(Instant::parse)
        PersonalState.snooze(tx, actor, projectId, taskId, input.baseRevision, until, key(request))
    }

    @PostMapping("/tasks/{taskId}/requests")
    @Accepts(CreateAttentionRequestRequest::class)
    @Idempotent
    fun createRequest(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_REQUESTS)
        ids(projectId, taskId)
        val input = contracts.parse<CreateAttentionRequestRequest>(body)
        val created = NewAttentionRequest(
            id = input.id.lowercase(),
            recipientId = input.recipientId,
            kind = input.kind.wire,
            neededBy = input.neededBy,
            threadId = input.threadId,
            approvalId = input.approvalId?.lowercase(),
            note = input.note,
        )
        AttentionRequests.create(tx, actor, projectId, taskId, created, key(request), ledger)
    }

    @PatchMapping("/requests/{id}")
    @Accepts(ChangeAttentionRequestRequest::class)
    @Idempotent
    fun changeRequest(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_REQUESTS)
        requestIds(projectId, id)
        val input = contracts.parse<ChangeAttentionRequestRequest>(body)
        AttentionRequests.change(
            tx,
            actor,
            projectId,
            id.lowercase(),
            input.baseRevision,
            input.recipientId,
            input.neededBy,
            key(request),
            ledger,
        )
    }

    @PostMapping("/requests/{id}/resolve")
    @Accepts(AttentionRequestRevisionRequest::class)
    @Idempotent
    fun resolveRequest(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_REQUESTS)
        requestIds(projectId, id)
        val input = contracts.parse<AttentionRequestRevisionRequest>(body)
        AttentionRequests.resolve(tx, actor, projectId, id.lowercase(), input.baseRevision, key(request), ledger)
    }

    /** Undo of "Отметить решённым" from the toast. */
    @PostMapping("/requests/{id}/reopen")
    @Accepts(AttentionRequestRevisionRequest::class)
    @Idempotent
    fun reopenRequest(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_REQUESTS)
        requestIds(projectId, id)
        val input = contracts.parse<AttentionRequestRevisionRequest>(body)
        AttentionRequests.reopen(tx, actor, projectId, id.lowercase(), input.baseRevision, key(request), ledger)
    }

    @PostMapping("/requests/{id}/cancel")
    @Accepts(AttentionRequestRevisionRequest::class)
    @Idempotent
    fun cancelRequest(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        flags.require(Feature.WORKBENCH_REQUESTS)
        requestIds(projectId, id)
        val input = contracts.parse<AttentionRequestRevisionRequest>(body)
        AttentionRequests.cancel(tx, actor, projectId, id.lowercase(), input.baseRevision, key(request), ledger)
    }

    private fun ids(projectId: String, taskId: String) {
        RequestInputs.id(projectId)
        RequestInputs.id(taskId)
    }

    private fun requestIds(projectId: String, id: String) {
        RequestInputs.id(projectId)
        if (!REQUEST_ID.matches(id)) throw RequestValidationException()
    }

    private fun key(request: HttpServletRequest) = RequestInputs.idempotencyKey(request)

    private companion object {
        val REQUEST_ID = Regex(UUID)
    }
}
