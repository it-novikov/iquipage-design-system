package com.sprintique.agent.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.planning.api.CommitPlanRequest
import com.sprintique.planning.contract.PlanningCommandContract
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

@Schema(name = "StartAgentRun")
data class StartAgentRunRequest(
    @field:Pattern(regexp = UUID) val id: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 1000)
    val goal: String,
    @field:Min(1) @field:Max(20) val maxProposals: Int = 5,
    @field:Min(60) @field:Max(3600) val expiresInSeconds: Int = 600,
    @field:Pattern(regexp = UUID) val parentRunId: String? = null,
)

@Schema(name = "AgentRunProposal")
data class AgentRunProposalRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Valid val command: PlanningCommandContract,
)

@Schema(name = "AgentRunCommit")
data class AgentRunCommitRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Valid val plan: CommitPlanRequest,
)

enum class RunState(@get:JsonValue val wire: String) {
    COMPLETED("completed"),
    FAILED("failed"),
    CANCELLED("cancelled"),
}

enum class RunError(@get:JsonValue val wire: String) {
    AGENT_FAILED("AGENT_FAILED"),
    CONTEXT_CHANGED("CONTEXT_CHANGED"),
    PROVIDER_UNAVAILABLE("PROVIDER_UNAVAILABLE"),
}

@Schema(name = "FinishAgentRun")
data class FinishAgentRunRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    val state: RunState,
    val errorCode: RunError? = null,
)

@Schema(name = "AgentContextQuery")
data class AgentContextQueryRequest(
    @field:Size(max = 20) @field:ResourceIds val taskIds: List<String> = emptyList(),
    @field:Pattern(regexp = RESOURCE_ID) val mapId: String? = null,
    @field:Size(max = 100) @field:ResourceIds val objectIds: List<String>? = null,
)
