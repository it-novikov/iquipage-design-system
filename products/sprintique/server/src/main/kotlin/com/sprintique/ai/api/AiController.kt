package com.sprintique.ai.api

import com.sprintique.ai.application.AgentProfiles
import com.sprintique.ai.application.AiConnections
import com.sprintique.ai.application.CheckGate
import com.sprintique.ai.application.ModelPort
import com.sprintique.ai.application.TaskAgents
import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ProviderFailure
import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * AI connections of workspaces, agents of service accounts and agent runs on tasks (docs/decisions/0005-ai-agents.md).
 * Everything here is for people with their own session; the use cases check the permissions.
 */
@RestController
@Profile("api")
class AiController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val connections: AiConnections,
    private val profiles: AgentProfiles,
    private val agents: TaskAgents,
    private val models: ModelPort,
    private val flags: FeatureFlags,
    private val checks: CheckGate,
) {
    @GetMapping("/api/v1/workspaces/{workspaceId}/ai-connections")
    fun list(@PathVariable workspaceId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        connections.list(tx, actor, workspace(workspaceId))
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/ai-connections")
    @Accepts(CreateAiConnectionRequest::class)
    fun create(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateAiConnectionRequest>(body)
            connections.create(
                tx,
                actor,
                workspace(workspaceId),
                AiConnections.NewConnection(
                    input.name,
                    input.provider.provider,
                    input.baseUrl,
                    input.apiKey,
                    input.defaultModel,
                ),
            )
        }

    @PutMapping("/api/v1/workspaces/{workspaceId}/ai-connections/{id}")
    @Accepts(UpdateAiConnectionRequest::class)
    fun update(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<UpdateAiConnectionRequest>(body)
        connections.update(
            tx,
            actor,
            workspace(workspaceId),
            uuid(id),
            AiConnections.ConnectionChange(
                input.baseRevision,
                input.name,
                input.baseUrl,
                input.apiKey,
                input.defaultModel,
            ),
        )
    }

    @DeleteMapping("/api/v1/workspaces/{workspaceId}/ai-connections/{id}")
    fun delete(@PathVariable workspaceId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> connections.delete(tx, actor, workspace(workspaceId), uuid(id)) }

    /**
     * «Проверить»: one minimal real call to the provider. The key is opened in one transaction, the call is made
     * outside any (paced by CheckGate), and its outcome is recorded in another.
     */
    @PostMapping("/api/v1/workspaces/{workspaceId}/ai-connections/{id}/check")
    @Accepts(AiCommandRequest::class)
    fun check(@PathVariable workspaceId: String, @PathVariable id: String, request: HttpServletRequest): Any {
        val workspace = workspace(workspaceId)
        val connection = uuid(id)
        val target = requests.run(request) { tx, actor -> connections.checkTarget(tx, actor, workspace, connection) }
        var failure: ProviderFailure? = null
        val found = checks.check(workspace, connection) {
            try {
                models.check(target.endpoint, target.defaultModel)
            } catch (error: ProviderException) {
                failure = error.failure
                emptyList()
            }
        }
        return requests.run(request) { tx, actor ->
            connections.recordCheck(tx, actor, workspace, connection, target, failure, found)
        }
    }

    @GetMapping("/api/v1/service-accounts/{id}/agent")
    fun agent(@PathVariable id: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        profiles.read(tx, actor, RequestInputs.id(id))
    }

    @PutMapping("/api/v1/service-accounts/{id}/agent")
    @Accepts(AgentSettingsRequest::class)
    fun saveAgent(
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<AgentSettingsRequest>(body)
            profiles.save(
                tx,
                actor,
                RequestInputs.id(id),
                AgentProfiles.Settings(
                    input.baseRevision, input.enabled, input.connectionId?.lowercase(), input.model, input.instructions,
                    input.onAssignment, input.maxSteps, input.maxOutputTokens, input.runsPerHour,
                    input.maxRunTokens,
                ),
            )
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{taskId}/agents")
    fun taskAgents(@PathVariable projectId: String, @PathVariable taskId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            agents.overview(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId))
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/agent-runs")
    @Accepts(StartTaskAgentRunRequest::class)
    fun start(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<StartTaskAgentRunRequest>(body)
        agents.start(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId), input.accountId)
    }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/agent-runs/{runId}/stop")
    @Accepts(AiCommandRequest::class)
    fun stop(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @PathVariable runId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        agents.cancel(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId), uuid(runId))
    }

    private fun workspace(id: String): String {
        flags.require(Feature.AI_AGENTS)
        return uuid(id)
    }

    private companion object {
        val UUID_PATTERN = Regex(com.sprintique.contract.UUID)

        fun uuid(value: String): String = value.lowercase().also {
            if (!UUID_PATTERN.matches(it)) throw RequestValidationException()
        }
    }
}
