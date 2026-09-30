package com.sprintique.workbench.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.IsoDateTime
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.Timezone
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.workbench.application.RankMove
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

// Request contracts of the Workbench, field for field the Zod schemas in contracts/workbench.ts.

@Schema(name = "PutParticipation")
data class PutParticipationRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val participating: Boolean,
)

enum class RankMoveWire(@get:JsonValue val wire: String, val move: RankMove) {
    UP("up", RankMove.UP),
    DOWN("down", RankMove.DOWN),
}

@Schema(name = "PutRank")
data class PutRankRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val move: RankMoveWire,
    /** Up and down move within the list the person sees: the Workbench project filter, null for every project. */
    @field:ResourceIds
    @field:Size(min = 1, max = FILTER_LIMIT)
    val projects: List<String>? = null,
)

@Schema(name = "PutCheckBack")
data class PutCheckBackRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:IsoDate
    val checkBackAt: String?,
)

@Schema(name = "PutSeen")
data class PutSeenRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val sequence: Long,
)

@Schema(name = "PutSnooze")
data class PutSnoozeRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:IsoDateTime(offset = true)
    val until: String?,
)

enum class RequestKind(@get:JsonValue val wire: String) {
    ANSWER("answer"),
    REVIEW("review"),
    DECISION("decision"),
    APPROVAL("approval"),
}

@Schema(name = "CreateAttentionRequest")
data class CreateAttentionRequestRequest(
    @field:Pattern(regexp = UUID)
    val id: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val recipientId: String,
    val kind: RequestKind,
    @field:IsoDate
    val neededBy: String? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val threadId: String? = null,
    @field:Pattern(regexp = UUID)
    val approvalId: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(max = NOTE_LIMIT)
    val note: String = "",
)

@Schema(name = "ChangeAttentionRequest")
data class ChangeAttentionRequestRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID)
    val recipientId: String,
    @field:IsoDate
    val neededBy: String?,
)

@Schema(name = "AttentionRequestRevision")
data class AttentionRequestRevisionRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

@Schema(name = "PutWorkbenchPreferences")
data class PutWorkbenchPreferencesRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Timezone
    val timezone: String,
)

private const val NOTE_LIMIT = 500
private const val FILTER_LIMIT = 100
