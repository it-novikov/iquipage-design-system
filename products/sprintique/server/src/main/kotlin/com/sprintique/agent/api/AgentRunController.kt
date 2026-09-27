package com.sprintique.agent.api

import com.sprintique.agent.application.AgentRuns
import com.sprintique.agent.application.NewRun
import com.sprintique.agent.application.RunEnd
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.UUID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
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

/** Agent runs of a project and the bounded context an agent may read. */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}")
class AgentRunController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val runs: AgentRuns,
) {
    @GetMapping("/agent-runs")
    fun list(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val cursor = QueryParameters(request, setOf("cursor")).string("cursor", UUID_LENGTH)?.let(::uuid)
        runs.list(tx, actor, projectId, cursor)
    }

    @PostMapping("/agent-runs")
    @Accepts(StartAgentRunRequest::class)
    fun start(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val input = contracts.parse<StartAgentRunRequest>(body)
            val run = NewRun(input.id, input.goal, input.maxProposals, input.expiresInSeconds, input.parentRunId)
            runs.start(tx, actor, projectId, run, RequestInputs.idempotencyKey(request))
        }

    @GetMapping("/agent-runs/{id}")
    fun read(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> runs.read(tx, actor, RequestInputs.id(projectId), runId(id)) }

    @PostMapping("/agent-runs/{id}/proposals")
    @Accepts(AgentRunProposalRequest::class)
    fun propose(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val run = runId(id)
        val input = contracts.parse<AgentRunProposalRequest>(body)
        runs.propose(tx, actor, projectId, run, input.baseRevision, input.command)
    }

    @PostMapping("/agent-runs/{id}/commit")
    @Accepts(AgentRunCommitRequest::class)
    fun commit(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val run = runId(id)
        val input = contracts.parse<AgentRunCommitRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        runs.commit(tx, actor, projectId, run, input.baseRevision, input.plan.planId, input.plan.token, key)
    }

    @PostMapping("/agent-runs/{id}/finish")
    @Accepts(FinishAgentRunRequest::class)
    fun finish(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val run = runId(id)
        val input = contracts.parse<FinishAgentRunRequest>(body)
        val end = RunEnd(input.baseRevision, input.state.wire, input.errorCode?.wire)
        runs.finish(tx, actor, projectId, run, end, RequestInputs.idempotencyKey(request))
    }

    @PostMapping("/agent-context")
    @Accepts(AgentContextQueryRequest::class)
    fun context(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val input = contracts.parse<AgentContextQueryRequest>(body)
            runs.context(tx, actor, projectId, input.taskIds, input.mapId, input.objectIds)
        }

    private companion object {
        const val UUID_LENGTH = 36
        val UUID_PATTERN = Regex(UUID)

        fun uuid(value: String): String = value.also {
            if (!UUID_PATTERN.matches(it)) throw RequestValidationException()
        }

        fun runId(value: String): String = uuid(RequestInputs.id(value))
    }
}
