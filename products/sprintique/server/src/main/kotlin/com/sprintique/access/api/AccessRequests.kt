package com.sprintique.access.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.contract.UniqueItems
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/** The fourteen project permissions by their names on the wire. */
enum class ProjectPermissionName(@get:JsonValue val wire: String) {
    TASKS_READ("tasks.read"),
    TASKS_WRITE("tasks.write"),
    THREADS_WRITE("threads.write"),
    RELEASES_MANAGE("releases.manage"),
    MAPS_READ("maps.read"),
    MAPS_WRITE("maps.write"),
    FINANCE_READ("finance.read"),
    FINANCE_WRITE("finance.write"),
    APPROVALS_DECIDE("approvals.decide"),
    AGENTS_MANAGE("agents.manage"),
    MEMBERS_INVITE("members.invite"),
    MEMBERS_MANAGE("members.manage"),
    PROJECT_SETTINGS("project.settings"),
    PROJECT_ACCESS("project.access"),
    ;

    val permission: Permission get() = Permission.fromWire(wire)!!
}

/** The five workspace permissions by their names on the wire. */
enum class WorkspacePermissionName(@get:JsonValue val wire: String) {
    WORKSPACE_INVITE("workspace.invite"),
    WORKSPACE_PEOPLE("workspace.people"),
    PROJECTS_CREATE("projects.create"),
    PROJECTS_OVERSEE("projects.oversee"),
    WORKSPACE_SETTINGS("workspace.settings"),
    ;

    val permission: Permission get() = Permission.fromWire(wire)!!
}

/** A role someone can be given or invited with; the owner changes only by transfer. */
enum class AssignableWorkspaceRole(@get:JsonValue val wire: String) {
    ADMIN("admin"),
    MEMBER("member"),
    GUEST("guest"),
    ;

    val role: WorkspaceRole get() = WorkspaceRole.fromWire(wire)!!
}

enum class ProjectsCreatedBy(@get:JsonValue val wire: String) { ADMINS("admins"), MEMBERS("members") }

@Schema(name = "CreatePreset")
data class CreatePresetRequest(
    @field:Pattern(regexp = UUID)
    val id: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 40)
    val name: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(max = 140)
    val hint: String = "",
    @field:Size(max = 14)
    @field:UniqueItems
    val permissions: List<ProjectPermissionName>,
)

@Schema(name = "PutPreset")
data class PutPresetRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 40)
    val name: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(max = 140)
    val hint: String = "",
    @field:Size(max = 14)
    @field:UniqueItems
    val permissions: List<ProjectPermissionName>,
)

@Schema(name = "ResetPreset")
data class ResetPresetRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

@Schema(name = "ChangeMemberAccess")
data class ChangeMemberAccessRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Pattern(regexp = UUID)
    val presetId: String,
    @field:Size(max = 14)
    @field:UniqueItems
    val granted: List<ProjectPermissionName> = emptyList(),
    @field:Size(max = 14)
    @field:UniqueItems
    val revoked: List<ProjectPermissionName> = emptyList(),
)

@Schema(name = "AddMember")
data class AddMemberRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val principalId: String,
    @field:Pattern(regexp = UUID)
    val presetId: String? = null,
)

@Schema(name = "HandoverAccess")
data class HandoverAccessRequest(
    @field:Pattern(regexp = UUID)
    val presetId: String,
)

@Schema(name = "PutProjectAccess")
data class PutProjectAccessRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Pattern(regexp = UUID)
    val defaultMemberPresetId: String?,
    @field:Pattern(regexp = UUID)
    val defaultGuestPresetId: String?,
)

@Schema(name = "ChangeWorkspaceMember")
data class ChangeWorkspaceMemberRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val role: AssignableWorkspaceRole?,
    val alsoFromProjects: Boolean = false,
)

@Schema(name = "ChangeWorkspaceMemberAccess")
data class ChangeWorkspaceMemberAccessRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Size(max = 5)
    @field:UniqueItems
    val granted: List<WorkspacePermissionName> = emptyList(),
    @field:Size(max = 5)
    @field:UniqueItems
    val revoked: List<WorkspacePermissionName> = emptyList(),
)

@Schema(name = "TransferOwnership")
data class TransferOwnershipRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val toPrincipalId: String,
)

@Schema(name = "PutWorkspaceAccess")
data class PutWorkspaceAccessRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val projectsCreatedBy: ProjectsCreatedBy,
    @field:Pattern(regexp = UUID)
    val defaultMemberPresetId: String?,
    @field:Pattern(regexp = UUID)
    val defaultGuestPresetId: String?,
)

@Schema(name = "CreateInvitations")
data class CreateInvitationsRequest(
    @field:Size(min = 1, max = 20)
    val emails: List<
        @Size(min = 3, max = 320)
        String,
        >,
    val workspaceRole: AssignableWorkspaceRole,
    @field:Pattern(regexp = UUID)
    val presetId: String? = null,
    @field:Size(max = 100)
    @field:UniqueItems
    @field:ResourceIds
    val projectIds: List<String> = emptyList(),
)

@Schema(name = "CreateProjectInvitations")
data class CreateProjectInvitationsRequest(
    @field:Size(min = 1, max = 20)
    val emails: List<
        @Size(min = 3, max = 320)
        String,
        >,
    @field:Pattern(regexp = UUID)
    val presetId: String? = null,
)

@Schema(name = "CreateInvitationLink")
data class CreateInvitationLinkRequest(
    val workspaceRole: AssignableWorkspaceRole,
    @field:Pattern(regexp = UUID)
    val presetId: String? = null,
    @field:Size(max = 100)
    @field:UniqueItems
    @field:ResourceIds
    val projectIds: List<String> = emptyList(),
    @field:Min(3_600) @field:Max(604_800)
    val expiresInSeconds: Long = 604_800,
)

@Schema(name = "CreateProjectInvitationLink")
data class CreateProjectInvitationLinkRequest(
    @field:Pattern(regexp = UUID)
    val presetId: String? = null,
    @field:Min(3_600) @field:Max(604_800)
    val expiresInSeconds: Long = 604_800,
)

@Schema(name = "InvitationToken")
data class InvitationTokenRequest(
    @field:Pattern(regexp = "^invite_[A-Za-z0-9_-]{43}$")
    val token: String,
)
