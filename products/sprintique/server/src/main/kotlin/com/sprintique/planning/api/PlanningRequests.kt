package com.sprintique.planning.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.planning.contract.ReleaseValueContract
import com.sprintique.planning.contract.TemporalValueContract
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

@Schema(name = "ReleaseWrite")
data class ReleaseWriteRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: ReleaseValueContract,
)

/** Applies a preview: its id and the one-use token that came with it. */
@Schema(name = "CommitPlan")
data class CommitPlanRequest(
    @field:Pattern(regexp = UUID)
    val planId: String,
    @field:Pattern(regexp = "^[A-Za-z0-9_-]{43}$")
    val token: String,
)

enum class Decision(@get:JsonValue val wire: String) { APPROVED("approved"), REJECTED("rejected") }

@Schema(name = "ApprovalDecision")
data class ApprovalDecisionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val status: Decision,
)

@Schema(name = "MilestoneWriteValue")
data class MilestoneWriteValue(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 240)
    val title: String,
    @field:IsoDate
    val date: String?,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String? = null,
)

@Schema(name = "MilestoneWrite")
data class MilestoneWriteRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: MilestoneWriteValue,
)

@Schema(name = "ConstraintWrite")
data class ConstraintWriteRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: TemporalValueContract,
)
