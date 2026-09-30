package com.sprintique.workspace.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.media.application.ImageTranscoder
import com.sprintique.media.domain.FileInspection
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.web.RequestValidationException
import com.sprintique.workspace.application.Membership
import com.sprintique.workspace.application.ProjectProfiles
import com.sprintique.workspace.application.Workspaces
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Project and workspace profiles, members, invitations, and a person's own profile and photo. */
@RestController
@Profile("api")
class ProfileController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
    private val images: ImageTranscoder,
) {
    @GetMapping("/api/v1/projects/{projectId}/profile")
    fun projectProfile(
        @PathVariable projectId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ProjectProfiles.project(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("/api/v1/projects/{projectId}/profile")
    @Accepts(PutProjectProfileRequest::class)
    @Idempotent
    fun changeProjectProfile(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val input = contracts.parse<PutProjectProfileRequest>(body)
            val change = ProjectProfiles.ProjectChange(input.baseRevision, input.name, input.avatarAssetId)
            ProjectProfiles.changeProject(tx, actor, projectId, change, RequestInputs.idempotencyKey(request), ledger)
        }

    @GetMapping("/api/v1/workspaces/{workspaceId}")
    fun workspace(@PathVariable workspaceId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Workspaces.profile(tx, actor, workspaceIdOf(workspaceId))
    }

    @PatchMapping("/api/v1/workspaces/{workspaceId}")
    @Accepts(PutWorkspaceProfileRequest::class)
    fun changeWorkspace(
        @PathVariable workspaceId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val id = workspaceIdOf(workspaceId)
            val input = contracts.parse<PutWorkspaceProfileRequest>(body)
            ProjectProfiles.changeWorkspace(
                tx,
                actor,
                id,
                ProjectProfiles.WorkspaceChange(input.baseRevision, input.name, input.timezone),
            )
        }

    @GetMapping("/api/v1/workspaces/{workspaceId}/projects")
    fun workspaceProjects(
        @PathVariable workspaceId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ProjectProfiles.workspaceProjects(tx, actor, workspaceIdOf(workspaceId))
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/members")
    fun workspaceMembers(
        @PathVariable workspaceId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        ProjectProfiles.workspaceMembers(tx, actor, workspaceIdOf(workspaceId))
    }

    @PatchMapping("/api/v1/workspaces/{workspaceId}/members/{id}")
    @Accepts(ChangeWorkspaceMemberRequest::class)
    fun changeWorkspaceMember(
        @PathVariable workspaceId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val workspace = workspaceIdOf(workspaceId)
        if (id.isEmpty() || id.length > MEMBER_ID_LIMIT) throw RequestValidationException()
        val input = contracts.parse<ChangeWorkspaceMemberRequest>(body)
        ProjectProfiles.changeWorkspaceMember(
            tx,
            actor,
            workspace,
            id,
            ProjectProfiles.WorkspaceMemberChange(input.baseRevision, input.role?.wire),
        )
    }

    @GetMapping("/api/v1/projects/{projectId}/members")
    fun members(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Membership.members(tx, actor, RequestInputs.id(projectId))
    }

    @PatchMapping("/api/v1/projects/{projectId}/members/{id}")
    @Accepts(ChangeMemberRequest::class)
    @Idempotent
    fun changeMember(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ChangeMemberRequest>(body)
        val change = Membership.MemberChange(input.baseRevision, input.role?.wire)
        Membership.changeMember(tx, actor, projectId, id, change, RequestInputs.idempotencyKey(request), ledger)
    }

    @GetMapping("/api/v1/projects/{projectId}/invitations")
    fun invitations(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Membership.invitations(tx, actor, RequestInputs.id(projectId))
    }

    @PostMapping("/api/v1/projects/{projectId}/invitations")
    @Accepts(CreateInvitationRequest::class)
    fun invite(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            val input = contracts.parse<CreateInvitationRequest>(body)
            Membership.invite(tx, actor, projectId, input.id, input.role.wire, input.expiresInSeconds)
        }

    @DeleteMapping("/api/v1/projects/{projectId}/invitations/{id}")
    fun revokeInvitation(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(
            request,
        ) { tx, actor -> Membership.revokeInvitation(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id)) }

    @PostMapping("/api/v1/invitations/accept")
    @Accepts(AcceptInvitationRequest::class)
    fun accept(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        Membership.acceptInvitation(tx, actor, contracts.parse<AcceptInvitationRequest>(body).token)
    }

    @GetMapping("/api/v1/profile")
    fun profile(request: HttpServletRequest) = requests.run(request) { tx, actor -> Membership.profile(tx, actor) }

    @PatchMapping("/api/v1/profile")
    @Accepts(ChangeProfileRequest::class)
    fun changeProfile(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<ChangeProfileRequest>(body)
        Membership.changeProfile(tx, actor, input.baseRevision, input.name)
    }

    /** The caller is authenticated before any image is decoded, and again for the write. */
    @PutMapping("/api/v1/profile/avatar", consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE, MediaType.ALL_VALUE])
    fun setAvatar(@RequestBody(required = false) body: ByteArray?, request: HttpServletRequest): Any {
        requests.run(
            request,
        ) { _, actor -> requireCondition(actor.isHuman, 403, "FORBIDDEN", "Фото профиля доступно человеку.") }
        requireCondition(body != null && body.isNotEmpty(), 400, "FILE_BODY", "Передайте изображение.")
        val image = try {
            images.avatar(body)
        } catch (problem: ProblemException) {
            // The code, size and detected format make the next refusal diagnosable; the image itself is never logged.
            log.info(
                "Profile photo refused: {} {} ({} bytes, {})",
                problem.status,
                problem.code,
                body.size,
                FileInspection.imageFormat(body),
            )
            throw problem
        }
        return requests.run(request) { tx, actor -> Membership.setAvatar(tx, actor, image) }
    }

    @DeleteMapping("/api/v1/profile/avatar")
    fun removeAvatar(
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor -> Membership.removeAvatar(tx, actor) }

    /** A URL that names the current revision never changes; any other request revalidates. */
    @GetMapping("/api/v1/people/{id}/avatar")
    fun avatar(
        @PathVariable id: String,
        @RequestParam("v", required = false) version: String?,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        requireCondition(PERSON_ID.matches(id), 404, "NOT_FOUND", "Фото недоступно.")
        val row = requests.run(request) { tx, _ -> Membership.avatar(tx, id) }
        val immutable = version != null && version == row["revision"].toString()
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("image/webp"))
            .header("Content-Security-Policy", "default-src 'none'; sandbox")
            .header("Cache-Control", if (immutable) "private, max-age=31536000, immutable" else "private, no-cache")
            .body(row["image"] as ByteArray)
    }

    private fun workspaceIdOf(
        value: String,
    ): String = value.also { if (!UUID_PATTERN.matches(it)) throw RequestValidationException() }

    private companion object {
        val log = LoggerFactory.getLogger(ProfileController::class.java)
        const val MEMBER_ID_LIMIT = 100
        val UUID_PATTERN = Regex(com.sprintique.contract.UUID)
        val PERSON_ID = Regex("^[A-Za-z0-9._:-]{1,200}$")
    }
}
