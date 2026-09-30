package com.sprintique.access.api

import com.sprintique.access.application.MemberAccess
import com.sprintique.access.application.Presets
import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.PermissionScope
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** An action that carries no options: the body is an empty object. */
@io.swagger.v3.oas.annotations.media.Schema(name = "AccessCommand")
class AccessCommandRequest

/**
 * Permissions and presets (docs/access/access-and-invitations.md, part I, section 8): the catalog, the workspace's
 * presets, a project's members and their access, the workspace's people and rules. People's sessions only.
 */
@RestController
@Profile("api")
@Suppress("TooManyFunctions")
class AccessController(private val requests: AuthenticatedRequests, private val contracts: Contracts) {
    @GetMapping("/api/v1/permissions/catalog")
    fun catalog(request: HttpServletRequest) = requests.run(request) { _, _ -> CATALOG }

    @GetMapping("/api/v1/workspaces/{workspaceId}/presets")
    fun presets(@PathVariable workspaceId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Presets.list(tx, actor, workspace(workspaceId))
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/presets")
    @Accepts(CreatePresetRequest::class)
    fun createPreset(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<CreatePresetRequest>(body)
        val draft = Presets.Draft(input.name, input.hint, input.permissions.mapTo(linkedSetOf()) { it.permission })
        Presets.create(tx, actor, workspace(workspaceId), input.id.lowercase(), draft)
    }

    @PutMapping("/api/v1/workspaces/{workspaceId}/presets/{id}")
    @Accepts(PutPresetRequest::class)
    fun putPreset(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<PutPresetRequest>(body)
        val draft = Presets.Draft(input.name, input.hint, input.permissions.mapTo(linkedSetOf()) { it.permission })
        Presets.update(tx, actor, workspace(workspaceId), uuid(id), input.baseRevision, draft)
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/presets/{id}/reset")
    @Accepts(ResetPresetRequest::class)
    fun resetPreset(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<ResetPresetRequest>(body)
        Presets.reset(tx, actor, workspace(workspaceId), uuid(id), input.baseRevision)
    }

    @DeleteMapping("/api/v1/workspaces/{workspaceId}/presets/{id}")
    fun archivePreset(@PathVariable workspaceId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> Presets.archive(tx, actor, workspace(workspaceId), uuid(id)) }

    @GetMapping("/api/v1/workspaces/{workspaceId}/presets/{id}/usage")
    fun presetUsage(@PathVariable workspaceId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> Presets.usage(tx, actor, workspace(workspaceId), uuid(id)) }

    @GetMapping("/api/v1/workspaces/{workspaceId}/access")
    fun workspaceAccess(@PathVariable workspaceId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> WorkspaceAccess.settings(tx, actor, workspace(workspaceId)) }

    @PutMapping("/api/v1/workspaces/{workspaceId}/access")
    @Accepts(PutWorkspaceAccessRequest::class)
    fun putWorkspaceAccess(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<PutWorkspaceAccessRequest>(body)
        val change = WorkspaceAccess.SettingsChange(
            input.baseRevision,
            input.projectsCreatedBy.wire,
            input.defaultMemberPresetId?.lowercase(),
            input.defaultGuestPresetId?.lowercase(),
        )
        WorkspaceAccess.changeSettings(tx, actor, workspace(workspaceId), change)
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/members")
    fun workspaceMembers(@PathVariable workspaceId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> WorkspaceAccess.members(tx, actor, workspace(workspaceId)) }

    @PatchMapping("/api/v1/workspaces/{workspaceId}/members/{id}")
    @Accepts(ChangeWorkspaceMemberRequest::class)
    fun changeWorkspaceMember(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<ChangeWorkspaceMemberRequest>(body)
        val change = WorkspaceAccess.MemberChange(input.baseRevision, input.role?.role, input.alsoFromProjects)
        WorkspaceAccess.change(tx, actor, workspace(workspaceId), RequestInputs.id(id), change)
    }

    @PutMapping("/api/v1/workspaces/{workspaceId}/members/{id}/access")
    @Accepts(ChangeWorkspaceMemberAccessRequest::class)
    fun changeWorkspaceMemberAccess(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<ChangeWorkspaceMemberAccessRequest>(body)
        val change = WorkspaceAccess.AccessChange(
            input.baseRevision,
            input.granted.mapTo(linkedSetOf()) { it.permission },
            input.revoked.mapTo(linkedSetOf()) { it.permission },
        )
        WorkspaceAccess.changeAccess(tx, actor, workspace(workspaceId), RequestInputs.id(id), change)
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/owner/transfer")
    @Accepts(TransferOwnershipRequest::class)
    fun transferOwnership(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<TransferOwnershipRequest>(body)
        WorkspaceAccess.transferOwnership(tx, actor, workspace(workspaceId), input.toPrincipalId)
    }

    @GetMapping("/api/v1/projects/{projectId}/directory")
    fun directory(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> MemberAccess.directory(tx, actor, RequestInputs.id(projectId)) }

    @PostMapping("/api/v1/projects/{projectId}/members")
    @Accepts(AddMemberRequest::class)
    fun addMember(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<AddMemberRequest>(body)
        MemberAccess.add(tx, actor, projectId, input.principalId, input.presetId?.lowercase())
    }

    @PutMapping("/api/v1/projects/{projectId}/members/{id}/access")
    @Accepts(ChangeMemberAccessRequest::class)
    fun changeMemberAccess(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ChangeMemberAccessRequest>(body)
        val change = MemberAccess.AccessChange(
            input.baseRevision,
            input.presetId.lowercase(),
            input.granted.mapTo(linkedSetOf()) { it.permission },
            input.revoked.mapTo(linkedSetOf()) { it.permission },
        )
        MemberAccess.change(tx, actor, projectId, id, change)
    }

    @GetMapping("/api/v1/projects/{projectId}/members/{id}/effective")
    fun effective(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            MemberAccess.effective(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
        }

    @PostMapping("/api/v1/projects/{projectId}/members/{id}/handover")
    @Accepts(HandoverAccessRequest::class)
    fun handover(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<HandoverAccessRequest>(body)
        MemberAccess.handover(tx, actor, projectId, id, input.baseRevision, input.presetId.lowercase())
    }

    @GetMapping("/api/v1/projects/{projectId}/access")
    fun projectAccess(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> MemberAccess.settings(tx, actor, RequestInputs.id(projectId)) }

    @PutMapping("/api/v1/projects/{projectId}/access")
    @Accepts(PutProjectAccessRequest::class)
    fun putProjectAccess(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<PutProjectAccessRequest>(body)
        val change = MemberAccess.SettingsChange(
            input.baseRevision,
            input.defaultMemberPresetId?.lowercase(),
            input.defaultGuestPresetId?.lowercase(),
        )
        MemberAccess.changeSettings(tx, actor, projectId, change)
    }

    @GetMapping("/api/v1/projects/{projectId}/access/matrix")
    fun matrix(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> MemberAccess.matrix(tx, actor, RequestInputs.id(projectId)) }

    /** Takes an empty object: entering carries no options. */
    @PostMapping("/api/v1/projects/{projectId}/join-as-admin")
    @Accepts(AccessCommandRequest::class)
    fun joinAsAdmin(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        if (body == null || !body.isObject || !body.isEmpty) throw RequestValidationException()
        MemberAccess.joinAsAdmin(tx, actor, projectId)
    }

    private fun workspace(value: String): String =
        value.lowercase().also { if (!UUID_PATTERN.matches(it)) throw RequestValidationException() }

    private fun uuid(value: String): String = workspace(value)

    private companion object {
        val UUID_PATTERN = Regex(com.sprintique.contract.UUID)

        /** The catalog as the pages show it: groups in order, dependencies, and what service accounts may hold. */
        val CATALOG: Map<String, Any?> = linkedMapOf(
            "project" to groups(Permission.PROJECT),
            "workspace" to groups(Permission.WORKSPACE),
            "presets" to SystemPreset.entries.associate { it.key to it.defaults.map(Permission::wire) },
            "neverService" to Permissions.NEVER_SERVICE.filter { it.scope == PermissionScope.PROJECT }.map(
                Permission::wire,
            ),
            "guestForbidden" to Permissions.GUEST_FORBIDDEN.map(Permission::wire),
        )

        private fun groups(permissions: List<Permission>) = permissions.groupBy(Permission::group).map { entry ->
            val (group, items) = entry
            linkedMapOf(
                "group" to group,
                "permissions" to items.map { permission ->
                    linkedMapOf(
                        "id" to permission.wire,
                        "title" to permission.title,
                        "description" to permission.description,
                        "includes" to permission.includes.map(Permission::wire),
                        "service" to permission.service.name.lowercase(),
                    )
                },
            )
        }
    }
}
