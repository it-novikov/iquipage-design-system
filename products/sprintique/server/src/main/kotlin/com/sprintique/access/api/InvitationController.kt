package com.sprintique.access.api

import com.sprintique.access.application.InvitationMail
import com.sprintique.access.application.Invitations
import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.database.Database
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Capability
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.problem.ProblemException
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.time.Duration

/**
 * Invitations by letter and by link (docs/access/access-and-invitations.md, section 5). Letters leave only after the
 * invitation is committed; the answer then says for each address whether the relay accepted it.
 */
@RestController
@Profile("api")
class InvitationController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val database: Database,
    private val mail: InvitationMail,
) {
    @GetMapping("/api/v1/workspaces/{workspaceId}/invitations")
    fun list(@PathVariable workspaceId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> Invitations.list(tx, actor, workspace(workspaceId)) }

    @PostMapping("/api/v1/workspaces/{workspaceId}/invitations")
    @Accepts(CreateInvitationsRequest::class)
    fun invite(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ): Map<String, Any?> {
        mail.requireAvailable()
        val batch = requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateInvitationsRequest>(body)
            val invitation = Invitations.Request(
                input.workspaceRole.role,
                input.presetId?.lowercase(),
                input.projectIds,
                null,
            )
            Invitations.invite(tx, actor, workspace(workspaceId), emails(input.emails), invitation, mail.origin)
        }
        return mapOf("invitations" to mail.deliver(batch))
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/invitation-links")
    @Accepts(CreateInvitationLinkRequest::class)
    fun link(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<CreateInvitationLinkRequest>(body)
        val invitation = Invitations.Request(
            input.workspaceRole.role,
            input.presetId?.lowercase(),
            input.projectIds,
            null,
        )
        Invitations.link(tx, actor, workspace(workspaceId), invitation, Duration.ofSeconds(input.expiresInSeconds))
    }

    @GetMapping("/api/v1/projects/{projectId}/invitations")
    fun projectList(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> Invitations.listForProject(tx, actor, RequestInputs.id(projectId)) }

    @PostMapping("/api/v1/projects/{projectId}/invitations")
    @Accepts(CreateProjectInvitationsRequest::class)
    fun inviteToProject(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ): Map<String, Any?> {
        mail.requireAvailable()
        val batch = requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val input = contracts.parse<CreateProjectInvitationsRequest>(body)
            val (workspaceId, invitation) = projectRequest(tx, actor, projectId, input.presetId)
            Invitations.invite(tx, actor, workspaceId, emails(input.emails), invitation, mail.origin)
        }
        return mapOf("invitations" to mail.deliver(batch))
    }

    @PostMapping("/api/v1/projects/{projectId}/invitation-links")
    @Accepts(CreateProjectInvitationLinkRequest::class)
    fun projectLink(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<CreateProjectInvitationLinkRequest>(body)
        val (workspaceId, invitation) = projectRequest(tx, actor, projectId, input.presetId)
        Invitations.link(tx, actor, workspaceId, invitation, Duration.ofSeconds(input.expiresInSeconds))
    }

    /** Takes an empty object: a new letter carries nothing new. */
    @PostMapping("/api/v1/invitations/{id}/resend")
    @Accepts(AccessCommandRequest::class)
    fun resend(
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ): Map<String, Any?> {
        mail.requireAvailable()
        if (body == null || !body.isObject || !body.isEmpty) throw RequestValidationException()
        val batch = requests.run(request) { tx, actor -> Invitations.resend(tx, actor, invitation(id), mail.origin) }
        return mapOf("invitations" to mail.deliver(batch))
    }

    @DeleteMapping("/api/v1/invitations/{id}")
    fun revoke(@PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> Invitations.revoke(tx, actor, invitation(id)) }

    /** Anonymous: whoever holds the link sees what it invites to before signing in. */
    @PostMapping("/api/v1/invitations/inspect")
    @Accepts(InvitationTokenRequest::class)
    fun inspect(@RequestBody(required = false) body: JsonNode?): Map<String, Any?> {
        val input = contracts.parse<InvitationTokenRequest>(body)
        return database.transaction { tx -> Invitations.inspect(tx, input.token) }
    }

    @PostMapping("/api/v1/invitations/accept")
    @Accepts(InvitationTokenRequest::class)
    fun accept(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            Invitations.accept(tx, actor, contracts.parse<InvitationTokenRequest>(body).token)
        }

    /**
     * From a project: someone who may invite to the workspace invites members to this project; someone who may only
     * invite to the project invites guests of the workspace, to this project only. The preset defaults to the
     * project's preset for new members (or guests).
     */
    private fun projectRequest(
        tx: com.sprintique.database.Transaction,
        actor: com.sprintique.identity.domain.Actor,
        projectId: String,
        presetId: String?,
    ): Pair<String, Invitations.Request> {
        val membership = ProjectAccess.authorize(tx, actor, projectId, Capability.MEMBERS_INVITE)
        val workspace = WorkspaceAccess.require(tx, actor, membership.workspaceId)
        val guest = !workspace.has(Permission.WORKSPACE_INVITE)
        val preset = presetId?.lowercase()
            ?: com.sprintique.access.application.MemberAccess.defaultPreset(tx, projectId, guest).id
        val request = if (guest) {
            Invitations.Request(WorkspaceRole.GUEST, preset, listOf(projectId), projectId)
        } else {
            Invitations.Request(WorkspaceRole.MEMBER, preset, listOf(projectId), null)
        }
        return membership.workspaceId to request
    }

    private fun emails(values: List<String>): List<EmailAddress> = values.map { value ->
        EmailAddress.parse(value)
            ?: throw ProblemException(422, "EMAIL_INVALID", "Проверьте адрес: ${value.trim().take(EMAIL_SHOWN)}.")
    }

    private fun workspace(value: String): String =
        value.lowercase().also { if (!UUID_PATTERN.matches(it)) throw RequestValidationException() }

    private fun invitation(value: String): String = workspace(value)

    private companion object {
        const val EMAIL_SHOWN = 80
        val UUID_PATTERN = Regex(com.sprintique.contract.UUID)
    }
}
