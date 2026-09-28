package com.sprintique.discussion.api

import com.sprintique.contract.IsoDateTime
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

private const val BODY_LIMIT = 20_000

@Schema(name = "CreateThread")
data class CreateThreadRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val id: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val messageId: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = BODY_LIMIT)
    val body: String,
    val requiresResolution: Boolean,
)

@Schema(name = "AppendMessage")
data class AppendMessageRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val id: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = BODY_LIMIT)
    val body: String,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

@Schema(name = "ResolveThread")
data class ResolveThreadRequest(
    val resolved: Boolean,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

@Schema(name = "ChangeThreadKind")
data class ChangeThreadKindRequest(
    val requiresResolution: Boolean,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

@Schema(name = "MarkThreadRead")
data class MarkThreadReadRequest(
    @field:IsoDateTime(offset = true)
    val seenActivityAt: String,
)
