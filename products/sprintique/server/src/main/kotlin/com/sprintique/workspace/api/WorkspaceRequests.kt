package com.sprintique.workspace.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.Timezone
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

@Schema(name = "CreateWorkspace")
data class CreateWorkspaceRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Timezone
    val timezone: String = "UTC",
)

@Schema(name = "CreateProject")
data class CreateProjectRequest(
    @field:Pattern(regexp = UUID)
    val workspaceId: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Size(min = 2, max = 48)
    @field:Pattern(regexp = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
    val slug: String,
    @field:Pattern(regexp = "^[A-Z][A-Z0-9]{1,9}$")
    val key: String,
    @field:Timezone
    val timezone: String? = null,
)

@Schema(name = "PutProjectProfile")
data class PutProjectProfileRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
)

@Schema(name = "PutWorkspaceProfile")
data class PutWorkspaceProfileRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Timezone
    val timezone: String,
)

enum class WorkspaceRole(@get:JsonValue val wire: String) { MEMBER("member"), ADMIN("admin") }

enum class MemberRole(@get:JsonValue val wire: String) { READER("reader"), EDITOR("editor"), ADMIN("admin") }

@Schema(name = "ChangeWorkspaceMember")
data class ChangeWorkspaceMemberRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val role: WorkspaceRole?,
)

@Schema(name = "ChangeMember")
data class ChangeMemberRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val role: MemberRole?,
)

@Schema(name = "CreateInvitation")
data class CreateInvitationRequest(
    @field:Pattern(regexp = UUID)
    val id: String,
    val role: MemberRole,
    @field:Min(60) @field:Max(604_800)
    val expiresInSeconds: Long = 86_400,
)

@Schema(name = "AcceptInvitation")
data class AcceptInvitationRequest(
    @field:Pattern(regexp = "^invite_[A-Za-z0-9_-]{43}$")
    val token: String,
)

@Schema(name = "ChangeProfile")
data class ChangeProfileRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
)
