package com.sprintique.workspace.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.AccessEvents
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ProjectMembership
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import com.sprintique.workbench.application.AttentionRequests

/** Who belongs to a project and how people change it: members, invitations, a person's own profile and photo. */
object Membership {
    private const val MEMBER_LIMIT = 500
    private const val DAILY_INVITATIONS = 100

    /**
     * The same project lock as canonical writes, so a revocation cannot race a later committed effect: a membership
     * advisory lock, the project row, then the live credential and the administrator right again.
     */
    fun manageProject(tx: Transaction, actor: Actor, projectId: String): ProjectMembership {
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        ProjectAccess.requireActiveCredential(tx, actor)
        return ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
    }

    /** Task owners are current human members of the project, so every assignee can see and act on the task. */
    fun requireAssignable(tx: Transaction, projectId: String, ownerId: String?) {
        if (ownerId == null) return
        val member = tx.row(
            """
            SELECT 1 AS found FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND m.principal_id = $2 AND p.kind = 'human' AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
            ownerId,
        )
        requireCondition(member != null, 422, "TASK_OWNER", "Исполнителем может быть только участник проекта.")
    }

    /**
     * Last activity is the member's newest audit event in this project. A service account names its owner, whether
     * it is suspended and what it was granted explicitly (finance); its rights are capped by its owner's.
     */
    fun members(tx: Transaction, actor: Actor, projectId: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.kind, m.role, m.revision, m.joined_at AS "joinedAt",
                   (SELECT a.created_at FROM app.audit_events a WHERE a.project_id = m.project_id AND a.actor_id = p.id
                    ORDER BY a.created_at DESC LIMIT 1) AS "lastActiveAt",
                   (SELECT v.revision FROM app.person_avatars v WHERE v.principal_id = p.id) AS "avatarRevision",
                   s.owner_id AS "ownerId",
                   (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = s.owner_id) AS "ownerName",
                   CASE WHEN s.principal_id IS NULL THEN NULL
                        ELSE NOT auth.service_account_active(s.principal_id) END AS suspended,
                   CASE WHEN s.principal_id IS NULL THEN NULL ELSE coalesce((SELECT g.granted
                     FROM auth.service_account_grants g WHERE g.project_id = m.project_id AND g.principal_id = p.id),
                     '{}') END AS granted
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            LEFT JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE m.project_id = $1 ORDER BY name, p.id LIMIT 501
            """.trimIndent(),
            projectId,
        )
    }

    data class MemberChange(val baseRevision: Long, val role: String?)

    fun changeMember(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        input: MemberChange,
        key: String,
        ledger: CommandLedger,
    ): Any {
        manageProject(tx, actor, projectId)
        return ledger.idempotent(tx, actor, projectId, "member.change:$id", key, input) {
            requireCondition(
                id != actor.id || input.role != null,
                422,
                "SELF_REMOVAL",
                "Удаление своего доступа выполняет другой администратор.",
            )
            val member = tx.row(
                """
                SELECT m.role, m.revision, p.kind FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
                WHERE m.project_id = $1 AND m.principal_id = $2
                """.trimIndent(),
                projectId, id,
            )
            requireCondition(member != null, 404, "NOT_FOUND", "Участник недоступен.")
            requireCondition(
                member.string("kind") != "agent",
                422,
                "AGENT_GRANT_REQUIRED",
                "Доступ агента изменяется через его разрешение.",
            )
            // A service account is a reader or an editor, never an administrator.
            requireCondition(
                member.string("kind") != "service" || input.role != "admin",
                422,
                "SERVICE_ACCOUNT_ROLE",
                "Сервисный аккаунт может быть только наблюдателем или редактором.",
            )
            // Nor above its owner: an editor only while its owner writes in this project.
            if (member.string("kind") == "service" && input.role == "editor") {
                val owner = tx.row(
                    """
                    SELECT o.role FROM auth.service_accounts s
                    JOIN app.project_members o ON o.project_id = $1 AND o.principal_id = s.owner_id
                    WHERE s.principal_id = $2
                    """.trimIndent(),
                    projectId, id,
                )
                requireCondition(
                    owner?.string("role") in setOf("editor", "admin"),
                    422,
                    "ROLE_ABOVE_OWNER",
                    "Сервисный аккаунт не может получить больше прав, чем у его владельца.",
                )
            }
            requireCondition(
                member.long("revision") == input.baseRevision,
                409,
                "CONFLICT",
                "Права участника уже изменены.",
            )
            if (member.string("role") == "admin" && input.role != "admin") {
                val admins = tx.row(
                    """
                    SELECT count(*)::int AS n FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
                    WHERE m.project_id = $1 AND m.role = 'admin' AND p.kind = 'human' AND p.disabled_at IS NULL
                    """.trimIndent(),
                    projectId,
                )!!.int("n")
                requireCondition(admins > 1, 409, "LAST_ADMIN", "Сначала назначьте другого администратора.")
            }
            val revision = member.long("revision") + 1
            // Recorded while the actor is still a member, including self-removal. One transaction.
            AuditTrail.record(tx, actor, projectId, "member.updated", id, revision)
            if (input.role == null) {
                tx.update("DELETE FROM app.project_members WHERE project_id = $1 AND principal_id = $2", projectId, id)
            } else {
                tx.update(
                    """
                    UPDATE app.project_members SET role = $3, revision = revision + 1 WHERE project_id = $1 AND principal_id = $2
                    """.trimIndent(),
                    projectId, id, input.role,
                )
            }
            if (member.string("kind") == "service") {
                AccessEvents.record(
                    tx,
                    id,
                    if (input.role == null) "project.revoked" else "project.granted",
                    if (input.role == null) projectId else "$projectId:${input.role}",
                    actorId = actor.id,
                )
            }
            if (input.role == null || input.role == "reader") {
                // A recipient who can no longer act leaves their open requests orphaned, never silently gone.
                AttentionRequests.orphanRecipient(tx, actor, projectId, id)
                tx.update(
                    """
                    UPDATE auth.credentials SET revoked_at = clock_timestamp()
                    WHERE project_id = $1 AND kind = 'agent' AND initiator_id = $2 AND revoked_at IS NULL
                    """.trimIndent(),
                    projectId, id,
                )
            }
            linkedMapOf("id" to id, "role" to input.role, "revision" to revision)
        }
    }

    fun invitations(tx: Transaction, actor: Actor, projectId: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
        return tx.rows(
            """
            SELECT i.id, i.role, i.created_at AS "createdAt", i.expires_at AS "expiresAt", i.revoked_at AS "revokedAt",
                   i.accepted_at AS "acceptedAt", coalesce(inviter.profile_name, inviter.name) AS "inviterName",
                   coalesce(accepter.profile_name, accepter.name) AS "acceptedByName"
            FROM auth.project_invitations i LEFT JOIN auth.principals inviter ON inviter.id = i.inviter_id
            LEFT JOIN auth.principals accepter ON accepter.id = i.accepted_by
            WHERE i.project_id = $1 ORDER BY i.created_at DESC LIMIT 100
            """.trimIndent(),
            projectId,
        )
    }

    /** The token is an intentional once-only secret: neither the ledger nor the audit stores its value. */
    fun invite(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        role: String,
        expiresInSeconds: Long,
    ): Map<String, Any?> {
        manageProject(tx, actor, projectId)
        val today = tx.row(
            """
            SELECT count(*)::int AS n FROM auth.project_invitations
            WHERE project_id = $1 AND created_at > clock_timestamp() - interval '1 day'
            """.trimIndent(),
            projectId,
        )!!.int("n")
        requireCondition(today < DAILY_INVITATIONS, 429, "INVITATION_LIMIT", "Лимит приглашений на сегодня исчерпан.")
        val token = "invite_" + Tokens.random()
        val row = tx.row(
            """
            INSERT INTO auth.project_invitations(id, project_id, token_hash, role, inviter_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, clock_timestamp() + make_interval(secs => $6)) RETURNING id, role, expires_at AS "expiresAt"
            """.trimIndent(),
            id, projectId, Tokens.sha256Hex(token), role, actor.id, expiresInSeconds,
        )!!
        AuditTrail.record(tx, actor, projectId, "invitation.created", id, 1)
        return LinkedHashMap<String, Any?>(row).apply { put("token", token) }
    }

    fun revokeInvitation(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Boolean> {
        manageProject(tx, actor, projectId)
        val revoked = tx.row(
            """
            UPDATE auth.project_invitations SET revoked_at = coalesce(revoked_at, clock_timestamp())
            WHERE project_id = $1 AND id = $2 AND accepted_at IS NULL RETURNING id
            """.trimIndent(),
            projectId, id,
        )
        requireCondition(revoked != null, 404, "NOT_FOUND", "Приглашение недоступно.")
        AuditTrail.record(tx, actor, projectId, "invitation.revoked", id, 1)
        return mapOf("revoked" to true)
    }

    fun acceptInvitation(tx: Transaction, actor: Actor, token: String): Map<String, Any> {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", "Приглашение предназначено для человека.")
        ProjectAccess.requireInteractive(actor)
        val hash = Tokens.sha256Hex(token)
        // Resolve the scope without exposing project data, then share the management lock order.
        val scope = tx.row("SELECT project_id FROM auth.project_invitations WHERE token_hash = $1", hash)
        requireCondition(scope != null, 404, "INVITATION_INVALID", "Приглашение недоступно.")
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:${scope.string("project_id")}")
        val invitation = requirePresent(
            tx.row(
                """
                SELECT *, expires_at > clock_timestamp() AS valid FROM auth.project_invitations WHERE token_hash = $1 FOR UPDATE
                """.trimIndent(),
                hash,
            ),
            404,
            "INVITATION_INVALID",
            "Приглашение недоступно.",
        )
        requireCondition(
            invitation["revoked_at"] == null && invitation.boolean("valid"),
            410,
            "INVITATION_EXPIRED",
            "Приглашение отменено или устарело.",
        )
        val acceptedBy = invitation.stringOrNull("accepted_by")
        requireCondition(
            acceptedBy == null || acceptedBy == actor.id,
            409,
            "INVITATION_USED",
            "Приглашение уже использовано.",
        )
        ProjectAccess.requireActiveCredential(tx, actor)
        val projectId = invitation.string("project_id")
        // The inviter must still be an active administrator. Identities are never inferred from e-mail.
        val inviter = tx.row(
            """
            SELECT 1 AS active FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND m.principal_id = $2 AND m.role = 'admin' AND p.disabled_at IS NULL FOR UPDATE OF m
            """.trimIndent(),
            projectId, invitation.string("inviter_id"),
        )
        requireCondition(inviter != null, 403, "INVITATION_REVOKED", "Автор приглашения больше не управляет проектом.")
        if (acceptedBy == null) {
            val count = tx.row(
                "SELECT count(*)::int AS n FROM app.project_members WHERE project_id = $1",
                projectId,
            )!!.int("n")
            requireCondition(count < MEMBER_LIMIT, 422, "MEMBER_LIMIT", "В проекте достигнут лимит участников.")
            tx.update(
                """
                INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
                """.trimIndent(),
                projectId, actor.id, invitation.string("role"),
            )
        }
        val project = tx.row(
            "SELECT id, workspace_id AS \"workspaceId\", slug FROM app.projects WHERE id = $1 FOR UPDATE",
            projectId,
        )
        requireCondition(project != null, 403, "INVITATION_REVOKED", "Доступ к проекту отозван.")
        if (acceptedBy == null) {
            tx.update(
                """
                INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING
                """.trimIndent(),
                project.string("workspaceId"), actor.id,
            )
            tx.update(
                "UPDATE auth.project_invitations SET accepted_at = clock_timestamp(), accepted_by = $2 WHERE id = $1",
                invitation.string("id"), actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "member.joined", actor.id, 1)
        }
        return linkedMapOf("projectId" to projectId, "slug" to project.string("slug"))
    }

    /** The person's profile with their own preferences, which follow them to every device. */
    fun profile(tx: Transaction, actor: Actor): Map<String, Any?>? {
        val row = tx.row(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.email, p.revision, a.revision AS "avatarRevision",
                   coalesce(r.confirm_release_scope, true) AS "confirmReleaseScope"
            FROM auth.principals p LEFT JOIN app.person_avatars a ON a.principal_id = p.id
            LEFT JOIN app.person_preferences r ON r.principal_id = p.id WHERE p.id = $1
            """.trimIndent(),
            actor.id,
        ) ?: return null
        val preferences = mapOf("confirmReleaseScope" to row["confirmReleaseScope"])
        return row.filterKeys { it != "confirmReleaseScope" } + ("preferences" to preferences)
    }

    /** Sets the person's preferences as a whole: a repeated request leaves the same state, the last one wins. */
    fun changePreferences(tx: Transaction, actor: Actor, confirmReleaseScope: Boolean): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        val row = tx.row(
            """
            INSERT INTO app.person_preferences(principal_id, confirm_release_scope) VALUES ($1, $2)
            ON CONFLICT (principal_id) DO UPDATE SET confirm_release_scope = EXCLUDED.confirm_release_scope,
                updated_at = clock_timestamp()
            RETURNING confirm_release_scope AS "confirmReleaseScope"
            """.trimIndent(),
            actor.id, confirmReleaseScope,
        )!!
        return mapOf("confirmReleaseScope" to row["confirmReleaseScope"])
    }

    fun changeProfile(tx: Transaction, actor: Actor, baseRevision: Long, name: String): Row {
        requireHuman(tx, actor, "Профиль доступен человеку.")
        val result = tx.row(
            """
            UPDATE auth.principals SET profile_name = $2, revision = revision + 1 WHERE id = $1 AND revision = $3 RETURNING id, profile_name AS name, revision
            """.trimIndent(),
            actor.id, name, baseRevision,
        )
        return requirePresent(result, 409, "CONFLICT", "Профиль уже изменён.")
    }

    /** The person's settings for one project: which release the board shows (null: the running one). */
    fun projectPreferences(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val row = tx.row(
            "SELECT board_release FROM app.person_project_preferences WHERE principal_id = $1 AND project_id = $2",
            actor.id, projectId,
        )
        return mapOf("boardRelease" to row?.stringOrNull("board_release"))
    }

    /** Sets them as a whole; the last write wins. */
    fun changeProjectPreferences(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        boardRelease: String?,
    ): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        requireCondition(
            boardRelease == null || boardRelease == "backlog" ||
                tx.row("SELECT 1 FROM app.releases WHERE project_id = $1 AND id = $2", projectId, boardRelease) != null,
            422,
            "RELEASE_UNAVAILABLE",
            "Релиз недоступен.",
        )
        tx.update(
            """
            INSERT INTO app.person_project_preferences(principal_id, project_id, board_release) VALUES ($1, $2, $3)
            ON CONFLICT (principal_id, project_id) DO UPDATE SET board_release = EXCLUDED.board_release,
                updated_at = clock_timestamp()
            """.trimIndent(),
            actor.id, projectId, boardRelease,
        )
        return mapOf("boardRelease" to boardRelease)
    }

    /** Replaces the person's photo with an already re-encoded image; the revision becomes the cache key. */
    fun setAvatar(tx: Transaction, actor: Actor, image: ByteArray): Row {
        requireHuman(tx, actor, "Фото профиля доступно человеку.")
        return tx.row(
            """
            INSERT INTO app.person_avatars(principal_id, image) VALUES ($1, $2)
            ON CONFLICT (principal_id) DO UPDATE SET image = EXCLUDED.image, revision = app.person_avatars.revision + 1,
                updated_at = clock_timestamp()
            RETURNING revision AS "avatarRevision"
            """.trimIndent(),
            actor.id, image,
        )!!
    }

    fun removeAvatar(tx: Transaction, actor: Actor): Map<String, Any?> {
        requireHuman(tx, actor, "Фото профиля доступно человеку.")
        tx.update("DELETE FROM app.person_avatars WHERE principal_id = $1", actor.id)
        return mapOf("avatarRevision" to null)
    }

    /** Visible to the person and to anyone sharing a project or workspace with them (row policy). */
    fun avatar(tx: Transaction, principalId: String): Row =
        requirePresent(
            tx.row("SELECT image, revision FROM app.person_avatars WHERE principal_id = $1", principalId),
            404,
            "NOT_FOUND",
            "Фото недоступно.",
        )

    private fun requireHuman(tx: Transaction, actor: Actor, message: String) {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", message)
        ProjectAccess.requireActiveCredential(tx, actor)
    }
}
