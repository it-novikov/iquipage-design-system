package com.sprintique.work.application

import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.UUID
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/** Bounded data contracts shared by REST and the corresponding MCP tools. */
data class WorkCriterion(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 1000) val text: String,
    val done: Boolean = false,
)
data class WorkStep(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 240) val title: String,
    @field:Size(max = 4000) val what: String = "",
    @field:Size(max = 4000) val how: String = "",
    @field:Size(max = 4000) val why: String = "",
    @field:Pattern(regexp = "todo|doing|done|blocked|dropped") val state: String = "todo",
    @field:Valid @field:Size(max = 30) val criteria: List<WorkCriterion> = emptyList(),
    @field:Size(max = 50) val dependsOn: List<
        @Pattern(regexp = RESOURCE_ID)
        String,
        > = emptyList(),
    @field:Size(max = 4000) val result: String = "",
    @field:Size(max = 20) val evidence: List<
        @Size(max = 1000)
        String,
        > = emptyList(),
)
data class WorkOption(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 240) val label: String,
    @field:Size(max = 2000) val description: String = "",
    val recommended: Boolean = false,
)

@Schema(name = "SaveWorkPlan")
data class SaveWorkPlanRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Size(min = 1, max = 4000) val goal: String,
    @field:Size(max = 8000) val scope: String = "",
    @field:Pattern(regexp = "low|standard|high") val risk: String = "standard",
    @field:Valid @field:Size(max = 50) val criteria: List<WorkCriterion> = emptyList(),
    @field:Valid @field:Size(max = 50) val steps: List<WorkStep> = emptyList(),
    @field:Size(max = 50) val context: List<
        @Size(max = 2000)
        String,
        > = emptyList(),
    @field:Size(max = 30) val extraSections: List<
        @Size(max = 8000)
        String,
        > = emptyList(),
)

@Schema(name = "WorkCheckpoint")
data class WorkCheckpointRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = UUID) val leaseToken: String,
    @field:Size(min = 1, max = 4000) val summary: String,
    @field:Size(min = 1, max = 4000) val nextStep: String,
    @field:Pattern(regexp = RESOURCE_ID) val sessionId: String? = null,
)

@Schema(name = "WorkLease")
data class WorkLeaseRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = "claim|release") val action: String,
    @field:Pattern(regexp = UUID) val leaseToken: String? = null,
    @field:Min(30) @field:Max(900) val seconds: Int = 300,
)

@Schema(name = "CreateWorkStep")
data class CreateWorkStepRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = UUID) val leaseToken: String,
    @field:Valid val step: WorkStep,
)

@Schema(name = "ChangeWorkStep")
data class ChangeWorkStepRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = UUID) val leaseToken: String? = null,
    @field:Pattern(regexp = "todo|doing|done|blocked|dropped") val state: String,
    @field:Size(max = 4000) val result: String = "",
    @field:Size(max = 20) val evidence: List<
        @Size(max = 1000)
        String,
        > = emptyList(),
    @field:Valid @field:Size(max = 30) val criteria: List<WorkCriterion> = emptyList(),
    @field:Pattern(regexp = "approved|rejected") val approval: String? = null,
)

@Schema(name = "CreateWorkQuestion")
data class CreateWorkQuestionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = UUID) val leaseToken: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 240) val title: String,
    @field:Size(max = 4000) val context: String = "",
    @field:Valid @field:Size(max = 8) val options: List<WorkOption> = emptyList(),
    @field:Pattern(regexp = RESOURCE_ID) val threadId: String? = null,
)

@Schema(name = "AnswerWorkQuestion")
data class AnswerWorkQuestionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Size(min = 1, max = 4000) val answer: String,
    @field:Pattern(regexp = RESOURCE_ID) val selectedOptionId: String? = null,
    @field:Size(max = 4000) val decision: String = "",
)

@Schema(name = "WorkDecision")
data class WorkDecisionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 4000) val text: String,
    @field:Pattern(regexp = RESOURCE_ID) val questionId: String? = null,
)

@Schema(name = "StartWorkSession")
data class StartWorkSessionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID) val agentId: String,
    @field:Pattern(regexp = "external|provider_api") val mode: String,
    @field:Size(min = 1, max = 1000) val goal: String,
    @field:Pattern(regexp = RESOURCE_ID) val threadId: String? = null,
)

@Schema(name = "ChangeWorkSession")
data class ChangeWorkSessionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = "running|waiting|completed|failed|cancelled") val state: String,
    @field:Size(max = 4000) val summary: String = "",
)

@Schema(name = "WorkHandoff")
data class WorkHandoffRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = UUID) val leaseToken: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val sessionId: String,
    @field:Pattern(regexp = RESOURCE_ID) val targetAgentId: String? = null,
    @field:Size(min = 1, max = 4000) val summary: String,
    @field:Size(min = 1, max = 4000) val nextStep: String,
    @field:Pattern(regexp = "manual|limit|timeout|error") val reason: String,
)

@Schema(name = "CreateWorkRequest")
data class CreateWorkRequestRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Pattern(regexp = RESOURCE_ID) val agentId: String,
    @field:Pattern(regexp = RESOURCE_ID) val threadId: String,
    @field:Pattern(regexp = RESOURCE_ID) val messageId: String,
)

@Schema(name = "PutWorkCard")
data class PutWorkCardRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Size(min = 1, max = 100000) val card: String,
)

@Schema(name = "CreateWorkSkill")
data class CreateWorkSkillRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Size(min = 1, max = 100) val name: String,
    @field:Size(min = 1, max = 100) val version: String,
    @field:Size(min = 1, max = 16000) val content: String,
    @field:Size(max = 20) val requiredTools: List<
        @Size(max = 100)
        String,
        > = emptyList(),
)

@Schema(name = "AssignWorkSkills")
data class AssignWorkSkillsRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Size(max = 20) val skillIds: List<
        @Pattern(regexp = RESOURCE_ID)
        String,
        >,
)
