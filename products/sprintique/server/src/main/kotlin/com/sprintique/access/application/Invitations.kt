package com.sprintique.access.application

import com.sprintique.access.domain.InvitationContent
import com.sprintique.access.domain.InvitationLetter
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** A letter to send once the invitation is committed: the token exists only here and in the letter. */
data class PendingLetter(val invitationId: String, val email: EmailAddress, val content: InvitationContent)

/** The outcome of an invitation command: the response and the letters it still has to send. */
data class InvitationBatch(val invitations: List<Map<String, Any?>>, val letters: List<PendingLetter>)

/**
 * Invitations to a workspace and its projects, by letter or by link (docs/access/access-and-invitations.md, section 5).
 *
 * * A letter goes to one address; a link is accepted by one person. The token is 256 random bits, only its SHA-256
 *   is stored; a letter lives seven days, a link one hour to seven days. «Отправить снова» makes a new invitation with
 *   a new token and marks the old one replaced.
 * * An invitation gives no more than its author holds: the workspace role, and in each project a preset within the
 *   author's permissions there (anything, for someone who oversees the workspace's projects). Someone who may invite
 *   only to a project invites guests of the workspace, to that project only.
 * * Limits: 20 addresses at once, 50 letters a day per person, 200 a day and 500 pending per workspace, 5 letters a
 *   day to one address from the whole platform, a new letter for the same invitation at most every five minutes and
 *   five times. Answers never depend on whether an address has an account or is already a member.
 * * Accepting needs a session whose person has the invited address verified (by a code, Google or Apple); a link
 *   needs any session. The author must still be allowed to invite; the invitee joins the workspace (never lower than
 *   they are) and each project not joined yet.
 */
@Suppress("TooManyFunctions", "LargeClass")
object Invitations {
    const val PER_SEND = 20
    private const val PER_PERSON_DAY = 50
    private const val PER_WORKSPACE_DAY = 200
    private const val PENDING = 500
    private const val PER_ADDRESS_DAY = 5
    private const val RESENDS = 5
    private val RESEND_PAUSE: Duration = Duration.ofMinutes(5)
    val LETTER_LIFETIME: Duration = Duration.ofDays(7)

    data class Request(
        val workspaceRole: WorkspaceRole,
        val presetId: String?,
        val projectIds: List<String>,
        val fromProjectId: String?,
    )

    /** Letters to up to twenty addresses. */
    fun invite(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        emails: List<EmailAddress>,
        request: Request,
        origin: String,
    ): InvitationBatch {
        val scope = authorize(tx, actor, workspaceId, request)
        val addresses = emails.distinctBy(EmailAddress::value)
        requireCondition(addresses.size in 1..PER_SEND, 422, "INVITATION_BATCH", "За один раз — до двадцати адресов.")
        requireDailyRoom(tx, actor, workspaceId, addresses.size)
        val invitations = mutableListOf<Map<String, Any?>>()
        val letters = mutableListOf<PendingLetter>()
        for (address in addresses.sortedBy(EmailAddress::value)) {
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "invitation-address:${address.value}")
            // An earlier pending letter to the same address in this workspace is replaced by the new one.
            val earlier = tx.row(
                """
                UPDATE auth.invitations SET replaced_at = clock_timestamp()
                WHERE id = (SELECT id FROM auth.invitations WHERE workspace_id = $1::uuid AND email = $2 AND kind = 'email'
                  AND accepted_at IS NULL AND revoked_at IS NULL AND replaced_at IS NULL ORDER BY created_at DESC LIMIT 1)
                RETURNING id, resend_count AS "resendCount"
                """.trimIndent(),
                workspaceId,
                address.value,
            )
            val token = "invite_" + Tokens.random()
            val id = insert(
                tx, actor, scope, "email", address.value, token, LETTER_LIFETIME,
                earlier?.string("id"), earlier?.int("resendCount") ?: 0,
            )
            val underLimit = addressRoom(tx, address.value)
            if (underLimit) {
                letters += PendingLetter(id, address, content(scope, address.value, token, origin, LETTER_LIFETIME))
            } else {
                markFailed(tx, id, ADDRESS_LIMIT)
            }
            WorkspaceAccess.audit(tx, actor, workspaceId, "invitation.created", id, 1, mapOf("kind" to "email"))
            invitations += one(tx, id)
        }
        return InvitationBatch(invitations, letters)
    }

    /** A link without a letter, accepted by one person; the token is shown once. */
    fun link(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        request: Request,
        lifetime: Duration,
    ): Map<String, Any?> {
        val scope = authorize(tx, actor, workspaceId, request)
        requirePendingRoom(tx, workspaceId)
        val token = "invite_" + Tokens.random()
        val id = insert(tx, actor, scope, "link", null, token, lifetime, null, 0)
        WorkspaceAccess.audit(tx, actor, workspaceId, "invitation.created", id, 1, mapOf("kind" to "link"))
        return LinkedHashMap(one(tx, id)).apply { put("token", token) }
    }

    /** What an invitation was made with, checked and with the names it shows before sign-in. */
    private data class Scope(
        val workspaceId: String,
        val workspaceName: String,
        val zone: ZoneId,
        val request: Request,
        val presetName: String?,
        val presetHint: String?,
        val projectNames: List<String>,
        val inviterName: String,
    )

    @Suppress("LongMethod", "CyclomaticComplexMethod")
    private fun authorize(tx: Transaction, actor: Actor, workspaceId: String, request: Request): Scope {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Приглашает человек.")
        val fromProject = request.fromProjectId
        val workspace = if (fromProject == null) {
            WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_INVITE)
        } else {
            MemberAccess.manage(tx, actor, fromProject, Capability.MEMBERS_INVITE)
            WorkspaceAccess.require(tx, actor, workspaceId)
        }
        requireCondition(
            request.workspaceRole != WorkspaceRole.OWNER,
            422,
            "OWNER_PROTECTED",
            "Владельцем становятся только передачей владения.",
        )
        requireCondition(
            request.workspaceRole != WorkspaceRole.ADMIN || workspace.permissions.containsAll(Permission.WORKSPACE),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "Пригласить администратора может тот, у кого есть все права пространства.",
        )
        val projectIds = request.projectIds.distinct()
        requireCondition(
            request.workspaceRole != WorkspaceRole.GUEST || projectIds.isNotEmpty(),
            422,
            "GUEST_NEEDS_PROJECT",
            "Гостя приглашают хотя бы в один проект.",
        )
        requireCondition(
            (request.presetId == null) == projectIds.isEmpty(),
            422,
            "INVITATION_PRESET",
            "Выберите пресет для проектов.",
        )
        val preset = request.presetId?.let {
            if (request.workspaceRole == WorkspaceRole.GUEST) {
                Presets.requireGuestUsable(tx, workspaceId, it)
            } else {
                Presets.requireUsable(tx, workspaceId, it)
            }
        }
        val names = projectIds.map { projectId ->
            // Projects are named by those who see them: members, or those who oversee the workspace.
            val project = tx.row(
                "SELECT name FROM app.projects WHERE id = $1 AND workspace_id = $2::uuid",
                projectId,
                workspaceId,
            )
            requirePresent(project, 404, "NOT_FOUND", "Проект недоступен.")
            val allowed = grantable(tx, actor, projectId, workspace)
            val beyond = preset!!.permissions.filterNot { it in allowed }
            requireCondition(
                beyond.isEmpty(),
                403,
                "PERMISSION_EXCEEDS_ACTOR",
                "Пресет шире ваших прав в проекте «${project.string("name")}»: ${beyond.joinToString {
                    "«${it.title}»"
                }}.",
            )
            project.string("name")
        }
        val info = tx.row(
            """
            SELECT w.name, w.timezone, coalesce(p.profile_name, p.name) AS inviter FROM app.workspaces w, auth.principals p
            WHERE w.id = $1::uuid AND p.id = $2
            """.trimIndent(),
            workspaceId,
            actor.id,
        )!!
        return Scope(
            workspaceId,
            info.string("name").take(NAME_LIMIT),
            runCatching { ZoneId.of(info.string("timezone")) }.getOrDefault(ZoneId.of("UTC")),
            request.copy(projectIds = projectIds),
            preset?.name,
            preset?.hint,
            names,
            info.string("inviter").take(NAME_LIMIT),
        )
    }

    /** What an inviter may give in a project: their own permissions there, everything for someone who oversees it. */
    private fun grantable(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        workspace: WorkspaceMembership,
    ): Set<Permission> {
        if (workspace.has(Permission.PROJECTS_OVERSEE)) return Permission.PROJECT.toSet()
        return ProjectAccess.membership(tx, actor, projectId)?.permissions.orEmpty()
    }

    @Suppress("LongParameterList")
    private fun insert(
        tx: Transaction,
        actor: Actor,
        scope: Scope,
        kind: String,
        email: String?,
        token: String,
        lifetime: Duration,
        resentFrom: String?,
        resendCount: Int,
    ): String {
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO auth.invitations(id, workspace_id, kind, email, token_hash, workspace_role, project_preset_id, project_ids,
              from_project_id, inviter_id, workspace_name, project_names, preset_name, preset_hint, inviter_name, expires_at,
              delivery, resent_from, resend_count)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8::text[], $9, $10, $11, $12::text[], $13, $14, $15,
              clock_timestamp() + make_interval(secs => $16), $17, $18::uuid, $19)
            """.trimIndent(),
            id,
            scope.workspaceId,
            kind,
            email,
            Tokens.sha256Hex(token),
            scope.request.workspaceRole.wire,
            scope.request.presetId,
            scope.request.projectIds, scope.request.fromProjectId, actor.id, scope.workspaceName, scope.projectNames,
            scope.presetName, scope.presetHint, scope.inviterName, lifetime.seconds,
            if (kind ==
                "email"
            ) {
                "pending"
            } else {
                "link"
            },
            resentFrom, resendCount,
        )
        return id
    }

    private fun content(
        scope: Scope,
        email: String,
        token: String,
        origin: String,
        lifetime: Duration,
    ) = InvitationContent(
        inviterName = scope.inviterName,
        workspaceName = scope.workspaceName,
        workspaceRole = scope.request.workspaceRole,
        projectNames = scope.projectNames,
        presetName = scope.presetName,
        presetHint = scope.presetHint,
        expiresAt = Instant.now().plus(lifetime),
        zone = scope.zone,
        email = email,
        link = "$origin/#invite/$token",
    )

    private fun requireDailyRoom(tx: Transaction, actor: Actor, workspaceId: String, letters: Int) {
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "invitations:$workspaceId")
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "invitations-by:${actor.id}")
        val counts = tx.row(
            """
            SELECT (SELECT count(*)::int FROM auth.invitations WHERE inviter_id = $1 AND kind = 'email'
                      AND created_at > clock_timestamp() - interval '1 day') AS person,
                   (SELECT count(*)::int FROM auth.invitations WHERE workspace_id = $2::uuid AND kind = 'email'
                      AND created_at > clock_timestamp() - interval '1 day') AS workspace
            """.trimIndent(),
            actor.id,
            workspaceId,
        )!!
        requireCondition(
            counts.int("person") + letters <= PER_PERSON_DAY,
            429,
            "INVITATION_LIMIT",
            "Сегодня вы уже отправили много приглашений: до 50 писем в сутки. Повторите завтра или создайте ссылку.",
        )
        requireCondition(
            counts.int("workspace") + letters <= PER_WORKSPACE_DAY,
            429,
            "INVITATION_LIMIT",
            "Пространство отправило сегодня 200 приглашений — это предел на сутки. Повторите завтра.",
        )
        requirePendingRoom(tx, workspaceId, letters)
    }

    private fun requirePendingRoom(tx: Transaction, workspaceId: String, adding: Int = 1) {
        val pending = tx.row(
            """
            SELECT count(*)::int AS n FROM auth.invitations WHERE workspace_id = $1::uuid AND accepted_at IS NULL
              AND revoked_at IS NULL AND replaced_at IS NULL AND expires_at > clock_timestamp()
            """.trimIndent(),
            workspaceId,
        )!!.int("n")
        requireCondition(
            pending + adding <= PENDING,
            429,
            "INVITATION_LIMIT",
            "Ожидают ответа 500 приглашений — это предел. Отмените ненужные.",
        )
    }

    /** Letters to one address from every workspace in a day, this one included. */
    private fun addressRoom(tx: Transaction, email: String): Boolean = tx.row(
        """
        SELECT count(*)::int AS n FROM auth.invitations WHERE email = $1 AND kind = 'email' AND delivery IN ('pending','sent')
          AND created_at > clock_timestamp() - interval '1 day'
        """.trimIndent(),
        email,
    )!!.int("n") <= PER_ADDRESS_DAY

    private fun markFailed(tx: Transaction, id: String, reason: String) {
        tx.update(
            """
            UPDATE auth.invitations SET delivery = 'failed', delivery_error = $2 WHERE id = $1::uuid AND delivery = 'pending'
            """.trimIndent(),
            id,
            reason,
        )
    }

    /** After the letters were handed to the relay (or not): honest states, no guess about delivery beyond it. */
    fun recordDelivery(tx: Transaction, id: String, sent: Boolean) {
        if (sent) {
            tx.update(
                """
                UPDATE auth.invitations SET delivery = 'sent', delivered_at = clock_timestamp() WHERE id = $1::uuid AND delivery = 'pending'
                """.trimIndent(),
                id,
            )
        } else {
            markFailed(tx, id, RELAY_FAILED)
        }
    }

    fun list(tx: Transaction, actor: Actor, workspaceId: String): List<Map<String, Any?>> {
        WorkspaceAccess.require(tx, actor, workspaceId, Permission.WORKSPACE_INVITE)
        return tx.rows(
            "$SELECT_VIEW WHERE i.workspace_id = $1::uuid ORDER BY i.created_at DESC LIMIT 200",
            workspaceId,
        ).map(::view)
    }

    fun listForProject(tx: Transaction, actor: Actor, projectId: String): List<Map<String, Any?>> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.MEMBERS_INVITE)
        return tx.rows(
            "$SELECT_VIEW WHERE $1 = ANY(i.project_ids) ORDER BY i.created_at DESC LIMIT 200",
            projectId,
        ).map(::view)
    }

    /**
     * A new letter with a new token for the same invitation; the old one is replaced and says so when opened.
     * «Повторить» after a failed letter is the same command without the five-minute pause.
     */
    fun resend(tx: Transaction, actor: Actor, id: String, origin: String): InvitationBatch {
        val current = requirePresent(stored(tx, id), 404, "NOT_FOUND", "Приглашение недоступно.")
        val workspaceId = current.string("workspace_id")
        val request = Request(
            WorkspaceRole.fromWire(current.string("workspace_role"))!!,
            current.stringOrNull("project_preset_id"),
            current.strings("project_ids"),
            current.stringOrNull("from_project_id"),
        )
        val scope = authorize(tx, actor, workspaceId, request)
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "invitation:$id")
        val locked = stored(tx, id, lock = true)!!
        requireCondition(
            locked.string("kind") == "email",
            422,
            "INVITATION_LINK",
            "Ссылку без письма не отправляют повторно: создайте новую.",
        )
        requireCondition(
            locked["accepted_at"] == null && locked["revoked_at"] == null && locked["replaced_at"] == null,
            409,
            "INVITATION_CLOSED",
            "Приглашение уже принято, отменено или заменено.",
        )
        requireCondition(
            locked.int("resend_count") < RESENDS,
            429,
            "INVITATION_RESEND_LIMIT",
            "Приглашение отправляли уже пять раз.",
        )
        val failed = locked.string("delivery") == "failed"
        requireCondition(
            failed || locked.instant("created_at").plus(RESEND_PAUSE).isBefore(Instant.now()),
            429,
            "INVITATION_RESEND_WAIT",
            "Отправить снова можно не чаще раза в пять минут.",
        )
        requireDailyRoom(tx, actor, workspaceId, 1)
        val email = EmailAddress.parse(locked.string("email"))!!
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "invitation-address:${email.value}")
        tx.update("UPDATE auth.invitations SET replaced_at = clock_timestamp() WHERE id = $1::uuid", id)
        val token = "invite_" + Tokens.random()
        val next = insert(
            tx, actor, scope, "email", email.value, token, LETTER_LIFETIME, id,
            locked.int("resend_count") + 1,
        )
        val letters = if (addressRoom(tx, email.value)) {
            listOf(PendingLetter(next, email, content(scope, email.value, token, origin, LETTER_LIFETIME)))
        } else {
            markFailed(tx, next, ADDRESS_LIMIT)
            emptyList()
        }
        WorkspaceAccess.audit(tx, actor, workspaceId, "invitation.resent", next, 1, mapOf("replaces" to id))
        return InvitationBatch(listOf(one(tx, next)), letters)
    }

    /** People who manage people, the author, or someone who may invite to the project it was made from. */
    fun revoke(tx: Transaction, actor: Actor, id: String): Map<String, Any?> {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Приглашение отменяет человек.")
        val current = requirePresent(stored(tx, id), 404, "NOT_FOUND", "Приглашение недоступно.")
        val workspaceId = current.string("workspace_id")
        val workspace = WorkspaceAccess.require(tx, actor, workspaceId)
        val fromProject = current.stringOrNull("from_project_id")
        val allowed = workspace.has(Permission.WORKSPACE_PEOPLE) ||
            (current.string("inviter_id") == actor.id && workspace.has(Permission.WORKSPACE_INVITE)) ||
            (
                fromProject != null &&
                    ProjectAccess.membership(tx, actor, fromProject)?.has(Permission.MEMBERS_INVITE) == true
                )
        requireCondition(
            allowed,
            403,
            "FORBIDDEN",
            "Отменить приглашение может администратор пространства или его автор.",
        )
        val revoked = tx.row(
            """
            UPDATE auth.invitations SET revoked_at = clock_timestamp(), revoked_by = $2
            WHERE id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL AND replaced_at IS NULL RETURNING id
            """.trimIndent(),
            id,
            actor.id,
        )
        requireCondition(revoked != null, 409, "INVITATION_CLOSED", "Приглашение уже принято, отменено или заменено.")
        WorkspaceAccess.audit(tx, actor, workspaceId, "invitation.revoked", id, 1)
        return one(tx, id)
    }

    /** Anyone holding the token learns what it invites to; an unknown token and a malformed one answer alike. */
    fun inspect(tx: Transaction, token: String): Map<String, Any?> {
        val row = requirePresent(
            tx.row("$SELECT_VIEW WHERE i.token_hash = $1", Tokens.sha256Hex(token)),
            404,
            "INVITATION_INVALID",
            "Приглашение не найдено. Проверьте ссылку или попросите новую.",
        )
        val view = view(row)
        return linkedMapOf(
            "state" to view["state"],
            "kind" to view["kind"],
            "email" to row.stringOrNull("email")?.let(InvitationLetter::mask),
            "workspaceName" to row.string("workspaceName"),
            "workspaceRole" to row.string("workspaceRole"),
            "projectNames" to row.strings("projectNames"),
            "presetName" to row["presetName"],
            "presetHint" to row["presetHint"],
            "inviterName" to row.string("inviterName"),
            "expiresAt" to row["expiresAt"],
        )
    }

    /** Accepts an invitation for the person of the session; accepting it again is harmless. */
    @Suppress("LongMethod", "CyclomaticComplexMethod")
    fun accept(tx: Transaction, actor: Actor, token: String): Map<String, Any?> {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Приглашение предназначено для человека.")
        ProjectAccess.requireActiveCredential(tx, actor)
        val hash = Tokens.sha256Hex(token)
        val found = requirePresent(
            tx.row("SELECT id, workspace_id FROM auth.invitations WHERE token_hash = $1", hash),
            404,
            "INVITATION_INVALID",
            "Приглашение не найдено. Проверьте ссылку или попросите новую.",
        )
        val workspaceId = found.string("workspace_id")
        // One acceptance at a time per workspace; project locks follow in a fixed order.
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "workspace-members:$workspaceId")
        val invitation = stored(tx, found.string("id"), lock = true)!!
        val acceptedBy = invitation.stringOrNull("accepted_by")
        requireCondition(
            acceptedBy == null || acceptedBy == actor.id,
            409,
            "INVITATION_USED",
            "Приглашение уже принято другим человеком.",
        )
        if (acceptedBy == null) {
            requireCondition(invitation["revoked_at"] == null, 410, "INVITATION_REVOKED", "Приглашение отменено.")
            requireCondition(
                invitation["replaced_at"] == null,
                410,
                "INVITATION_REPLACED",
                "Это приглашение заменено новым письмом.",
            )
            requireCondition(invitation.boolean("valid"), 410, "INVITATION_EXPIRED", "Срок приглашения истёк.")
            invitation.stringOrNull("email")?.let { email -> requireVerifiedAddress(tx, actor, email) }
        }
        val role = WorkspaceRole.fromWire(invitation.string("workspace_role"))!!
        val inviter = invitation.string("inviter_id")
        val inviterWorkspace = inviterMembership(tx, workspaceId, inviter)
        val fromProject = invitation.stringOrNull("from_project_id")
        if (acceptedBy == null) {
            val stillAllowed = inviterWorkspace != null && when {
                fromProject != null -> inviterPermissions(tx, fromProject, inviter).contains(Permission.MEMBERS_INVITE)
                role == WorkspaceRole.ADMIN -> inviterWorkspace.permissions.containsAll(Permission.WORKSPACE)
                else -> inviterWorkspace.has(Permission.WORKSPACE_INVITE)
            }
            requireCondition(stillAllowed, 403, "INVITATION_REVOKED", "Автор приглашения больше не может приглашать.")
            joinWorkspace(tx, workspaceId, actor.id, role, inviter)
        }
        val joined = mutableListOf<Map<String, Any?>>()
        val skipped = mutableListOf<String>()
        val presetId = invitation.stringOrNull("project_preset_id")
        for ((index, projectId) in invitation.strings("project_ids").withIndex().sortedBy { it.value }) {
            val name = invitation.strings("project_names").getOrElse(index) { projectId }
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
            val existing = tx.row(
                "SELECT 1 AS found FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
                projectId,
                actor.id,
            )
            val member = existing != null || (acceptedBy == null && join(tx, actor, invitation, projectId, presetId))
            if (!member) {
                if (acceptedBy == null) skipped += name
                continue
            }
            tx.row("SELECT slug FROM app.projects WHERE id = $1", projectId)?.let {
                joined += linkedMapOf("id" to projectId, "slug" to it.string("slug"), "name" to name)
            }
        }
        if (acceptedBy == null) {
            tx.update(
                "UPDATE auth.invitations SET accepted_at = clock_timestamp(), accepted_by = $2 WHERE id = $1::uuid",
                invitation.string("id"),
                actor.id,
            )
            WorkspaceAccess.audit(
                tx, actor, workspaceId, "invitation.accepted", invitation.string("id"), 1,
                mapOf("projects" to joined.size, "skipped" to skipped.size),
            )
        }
        return linkedMapOf(
            "workspaceId" to workspaceId,
            "projects" to joined,
            "skippedProjects" to skipped,
            "projectId" to joined.firstOrNull()?.get("id"),
            "slug" to joined.firstOrNull()?.get("slug"),
        )
    }

    /**
     * Adds the invitee to one project with the invitation's preset, while the preset is live and within what the
     * author may give there now; false when it is not (the project is then reported as skipped).
     */
    private fun join(tx: Transaction, actor: Actor, invitation: Row, projectId: String, presetId: String?): Boolean {
        val workspaceId = invitation.string("workspace_id")
        val inviter = invitation.string("inviter_id")
        val preset = usablePreset(tx, workspaceId, presetId) ?: return false
        val author = inviterMembership(tx, workspaceId, inviter) ?: return false
        val allowed = if (author.has(Permission.PROJECTS_OVERSEE)) {
            Permission.PROJECT.toSet()
        } else {
            inviterPermissions(tx, projectId, inviter)
        }
        if (!allowed.containsAll(preset.permissions) || !hasRoom(tx, projectId)) return false
        MemberAccess.insertMember(tx, projectId, workspaceId, actor.id, preset.id, inviter)
        MemberAccess.recordAccessEvent(
            tx,
            actor,
            projectId,
            "member.joined",
            actor.id,
            mapOf("invitation" to invitation.string("id"), "preset" to preset.name),
        )
        return true
    }

    /** The invited address must be one the person verified: their contact address or a way in that vouches for it. */
    private fun requireVerifiedAddress(tx: Transaction, actor: Actor, email: String) {
        val verified = tx.row(
            """
            SELECT 1 AS found WHERE EXISTS(SELECT 1 FROM auth.principals WHERE id = $1 AND lower(email) = $2)
              OR EXISTS(SELECT 1 FROM auth.identities WHERE principal_id = $1 AND lower(email) = $2)
            """.trimIndent(),
            actor.id,
            email,
        )
        if (verified == null) {
            throw ProblemException(
                403,
                "INVITATION_EMAIL_MISMATCH",
                "Это приглашение для другого адреса: ${InvitationLetter.mask(email)}. Войдите с адресом из письма.",
                mapOf("invitedEmail" to InvitationLetter.mask(email)),
            )
        }
    }

    /** Joins the workspace, or raises the role to the invited one; never lowers it and never touches the owner. */
    private fun joinWorkspace(
        tx: Transaction,
        workspaceId: String,
        principalId: String,
        role: WorkspaceRole,
        inviter: String,
    ) {
        val current = tx.row(
            "SELECT role FROM app.workspace_members WHERE workspace_id = $1::uuid AND principal_id = $2",
            workspaceId,
            principalId,
        )
        if (current == null) {
            tx.update(
                """
                INSERT INTO app.workspace_members(workspace_id, principal_id, role, invited_by) VALUES ($1::uuid, $2, $3, $4)
                """.trimIndent(),
                workspaceId, principalId, role.wire, inviter,
            )
            return
        }
        val rank = listOf(WorkspaceRole.GUEST, WorkspaceRole.MEMBER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
        val now = WorkspaceRole.fromWire(current.string("role"))!!
        if (rank.indexOf(role) > rank.indexOf(now)) {
            tx.update(
                """
                UPDATE app.workspace_members SET role = $3, revision = revision + 1 WHERE workspace_id = $1::uuid AND principal_id = $2
                """.trimIndent(),
                workspaceId, principalId, role.wire,
            )
            tx.update(
                "UPDATE app.project_members SET granted = granted WHERE workspace_id = $1::uuid AND principal_id = $2",
                workspaceId,
                principalId,
            )
        }
    }

    private fun usablePreset(tx: Transaction, workspaceId: String, presetId: String?): Preset? =
        presetId?.let { Presets.find(tx, workspaceId, it) }?.takeIf { it.human && !it.archived }

    private fun hasRoom(tx: Transaction, projectId: String): Boolean =
        tx.row("SELECT count(*)::int AS n FROM app.project_members WHERE project_id = $1", projectId)!!.int("n") <
            MEMBER_LIMIT

    private fun inviterMembership(tx: Transaction, workspaceId: String, inviter: String): WorkspaceMembership? {
        val row = tx.row(
            """
            SELECT m.role, m.permissions FROM app.workspace_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.workspace_id = $1::uuid AND m.principal_id = $2 AND p.disabled_at IS NULL
            """.trimIndent(),
            workspaceId,
            inviter,
        ) ?: return null
        return WorkspaceMembership(
            workspaceId,
            WorkspaceRole.fromWire(row.string("role"))!!,
            ProjectAccess.permissionsOf(row),
            false,
        )
    }

    private fun inviterPermissions(tx: Transaction, projectId: String, inviter: String): Set<Permission> = tx.row(
        """
        SELECT m.permissions FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
        WHERE m.project_id = $1 AND m.principal_id = $2 AND p.disabled_at IS NULL
        """.trimIndent(),
        projectId,
        inviter,
    )?.let { ProjectAccess.permissionsOf(it) }.orEmpty().let(Permissions::sorted)

    private fun stored(tx: Transaction, id: String, lock: Boolean = false): Row? = tx.row(
        """
        SELECT *, expires_at > clock_timestamp() AS valid FROM auth.invitations WHERE id = $1::uuid ${if (lock) "FOR UPDATE" else ""}
        """.trimIndent(),
        id,
    )

    private fun one(tx: Transaction, id: String): Map<String, Any?> =
        view(tx.row("$SELECT_VIEW WHERE i.id = $1::uuid", id)!!)

    private fun view(row: Row): Map<String, Any?> {
        val state = when {
            row["acceptedAt"] != null -> "accepted"
            row["revokedAt"] != null -> "revoked"
            row["replacedAt"] != null -> "replaced"
            !row.boolean("valid") -> "expired"
            else -> "pending"
        }
        return LinkedHashMap<String, Any?>(row.without("valid", "createdAtRaw")).apply {
            put("state", state)
            val created = row.instant("createdAt")
            put(
                "resendableAt",
                if (row.string("kind") == "email" && state in setOf("pending", "expired")) {
                    if (row.string("delivery") == "failed") created else created.plus(RESEND_PAUSE)
                } else {
                    null
                },
            )
        }
    }

    private const val NAME_LIMIT = 100
    private const val MEMBER_LIMIT = 500
    private const val ADDRESS_LIMIT =
        "Слишком много писем на этот адрес за сутки. Отправьте завтра или создайте ссылку."
    private const val RELAY_FAILED = "Письмо не ушло: почтовый сервер не ответил."

    private val SELECT_VIEW = """
        SELECT i.id, i.kind, i.email, i.workspace_role AS "workspaceRole", i.project_preset_id AS "presetId",
               i.preset_name AS "presetName", i.preset_hint AS "presetHint", i.project_ids AS "projectIds",
               i.project_names AS "projectNames", i.from_project_id AS "fromProjectId", i.workspace_name AS "workspaceName",
               i.inviter_name AS "inviterName", i.inviter_id AS "inviterId", i.created_at AS "createdAt", i.expires_at AS "expiresAt",
               i.delivery, i.delivered_at AS "deliveredAt", i.delivery_error AS "deliveryError", i.resend_count AS "resendCount",
               i.replaced_at AS "replacedAt", i.revoked_at AS "revokedAt", coalesce(r.profile_name, r.name) AS "revokedByName",
               i.accepted_at AS "acceptedAt", coalesce(a.profile_name, a.name) AS "acceptedByName",
               i.expires_at > clock_timestamp() AS valid
        FROM auth.invitations i LEFT JOIN auth.principals r ON r.id = i.revoked_by LEFT JOIN auth.principals a ON a.id = i.accepted_by
    """.trimIndent()
}
