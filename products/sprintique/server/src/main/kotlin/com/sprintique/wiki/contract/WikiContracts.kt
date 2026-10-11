package com.sprintique.wiki.contract

import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

@Schema(name = "WikiPageInput")
data class WikiPageInputRequest(
    @field:Size(min = 1, max = 200)
    @field:JsonDeserialize(using = TrimmedString::class)
    val title: String,
    @field:Size(max = 100000) val body: String,
    @field:Pattern(regexp = RESOURCE_ID) val parentId: String?,
    val archived: Boolean,
)

@Schema(name = "PutWikiPage")
data class PutWikiPageRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Valid val value: WikiPageInputRequest,
)

@Schema(name = "RestoreWikiVersion")
data class RestoreWikiVersionRequest(
    @field:Min(1) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Min(1) @field:Max(MAX_SAFE_INTEGER) val version: Long,
)

@Schema(name = "PutWikiTaskLink")
data class PutWikiTaskLinkRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    val archived: Boolean,
)
