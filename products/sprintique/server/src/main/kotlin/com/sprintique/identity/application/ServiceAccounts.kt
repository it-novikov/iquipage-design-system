package com.sprintique.identity.application

import com.sprintique.access.application.Preset
import com.sprintique.access.application.Presets
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.util.UUID

/** The access history of service accounts: who did what to which account. Identifiers only, never a secret. */
object AccessEvents {
    fun record(
        tx: Transaction,
        principalId: String,
        action: String,
        subjectId: String,
        clientId: String? = null,
        actorId: String? = null,
    ) {
        tx.update(
            """
            INSERT INTO auth.access_events(id, principal_id, actor_id, action, subject_id, client_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            principalId,
            actorId,
            action,
            subjectId,
            clientId,
        )
    }
}

/**
 * Service accounts: how apps (Claude and other MCP clients) and scripts reach Sprintique. An app never acts as a
 * person; it acts as a service account, a principal of its own that a person made in one workspace and owns.
 *
 * - Any person of a workspace may make one there (at most [WORKSPACE_LIMIT] per workspace) and owns it.
 * - Its rights are permissions of the catalog in projects of its workspace: a preset for service accounts plus
 *   personal additions and removals, finance only when added explicitly, compiled by the database and never above its
 *   owner's permissions in that project now (recompiled whenever the owner's change). It never holds the decisions and
 *   access of people (auth.never_service_permissions).
 * - The owner names it, grants and changes its projects within their own rights, makes and revokes its tokens,
 *   connects and disconnects apps, and deletes it. A project administrator changes its rights in the project or
 *   removes it from the project, and deletes it when every project it is in is one they administer. A workspace
 *   administrator does all of that in every project of the workspace, gives the account a new owner and deletes it.
 * - While its owner is disabled or outside the workspace it does nothing; when the owner leaves the workspace it is
 *   suspended until an administrator gives it a new owner or deletes it.
 *
 * A project administrator here is someone who may manage members or agents in that project (members.manage,
 * agents.manage); a workspace administrator is someone who manages its people (workspace.people). Every operation here
 * needs the person's own session.
 */
@Component
@Profile("api")
class ServiceAccounts(private val properties: SprintiqueProperties) {
    /**
     * The grant of a service account in one project: a preset for service accounts (none: «Сервис: задачи» when
     * [writes], else «Сервис: чтение») and personal additions and removals from the catalog. The database compiles it
     * and caps it by the owner's permissions there.
     */
    data class ProjectGrant(
        val projectId: String,
        val presetId: String? = null,
        val granted: Set<Permission> = emptySet(),
        val revoked: Set<Permission> = emptySet(),
        val writes: Boolean = false,
    )

    data class NewAccount(val name: String, val workspaceId: String, val projects: List<ProjectGrant>)

    data class NewToken(val name: String, val scopes: Set<Scope>, val expiresInDays: Int)

    /** How the caller relates to one service account. */
    private data class Managed(
        val id: String,
        val workspaceId: String,
        val ownerId: String,
        val revision: Long,
        val isOwner: Boolean,
        val isWorkspaceAdmin: Boolean,
    )

    /** The accounts the caller may manage: their own, and every account of the workspaces they administer. */
    fun list(tx: Transaction, actor: Actor): List<Map<String, Any?>> {
        requirePerson(actor)
        val accounts = tx.rows(
            """
            SELECT s.principal_id AS id, p.name, s.workspace_id::text AS "workspaceId",
                   coalesce((SELECT w.name FROM app.workspaces w WHERE w.id = s.workspace_id), '') AS "workspaceName",
                   s.owner_id AS "ownerId", coalesce(o.profile_name, o.name) AS "ownerName", s.revision,
                   s.created_at AS "createdAt", s.owner_id = $1 AS mine,
                   NOT auth.service_account_active(s.principal_id) AS suspended
            FROM auth.service_accounts s JOIN auth.principals p ON p.id = s.principal_id
            JOIN auth.principals o ON o.id = s.owner_id
            WHERE s.deleted_at IS NULL AND ((s.owner_id = $1 AND s.suspended_at IS NULL) OR EXISTS (
              SELECT 1 FROM app.workspace_members w
              WHERE w.workspace_id = s.workspace_id AND w.principal_id = $1 AND 'workspace.people' = ANY(w.permissions)))
            ORDER BY (s.owner_id = $1) DESC, p.name, s.principal_id LIMIT $2
            """.trimIndent(),
            actor.id,
            LIST_LIMIT,
        )
        return accounts.map { account -> present(tx, account) }
    }

    /**
     * What the consent screen offers: the person's own active accounts, and the workspaces and projects in which a new
     * one can be made (with the person's role, the ceiling of the new account).
     */
    fun choices(tx: Transaction, actor: Actor): Map<String, Any?> {
        requirePerson(actor)
        val own = tx.rows(
            """
            SELECT s.principal_id AS id, p.name, s.workspace_id::text AS "workspaceId",
                   coalesce((SELECT w.name FROM app.workspaces w WHERE w.id = s.workspace_id), '') AS "workspaceName",
                   (SELECT count(*)::int FROM app.project_members m WHERE m.principal_id = s.principal_id) AS projects
            FROM auth.service_accounts s JOIN auth.principals p ON p.id = s.principal_id
            WHERE s.owner_id = $1 AND s.deleted_at IS NULL AND auth.service_account_active(s.principal_id)
            ORDER BY p.name, s.principal_id LIMIT $2
            """.trimIndent(),
            actor.id,
            LIST_LIMIT,
        )
        val projects = tx.rows(
            """
            SELECT w.id::text AS "workspaceId", w.name AS "workspaceName", p.id, p.name, m.role, m.permissions
            FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
            JOIN app.workspaces w ON w.id = p.workspace_id
            WHERE m.principal_id = $1 ORDER BY w.name, w.id, p.name, p.id LIMIT $2
            """.trimIndent(),
            actor.id,
            PROJECT_LIMIT,
        )
        val workspaces = projects.groupBy { it.string("workspaceId") }.map { (id, rows) ->
            linkedMapOf(
                "id" to id,
                "name" to rows.first().string("workspaceName"),
                "projects" to rows.map {
                    linkedMapOf(
                        "id" to it["id"],
                        "name" to it["name"],
                        "role" to it["role"],
                        "permissions" to it["permissions"],
                    )
                },
            )
        }
        return linkedMapOf("serviceAccounts" to own, "workspaces" to workspaces)
    }

    /**
     * A new account owned by the caller, with its first projects, each within the caller's own permissions there. A
     * guest of the workspace neither makes nor owns one (part II, II.2).
     */
    fun create(tx: Transaction, actor: Actor, input: NewAccount): Map<String, Any?> {
        requirePerson(actor)
        val member = tx.row(
            "SELECT role FROM app.workspace_members WHERE workspace_id = $1::uuid AND principal_id = $2",
            input.workspaceId,
            actor.id,
        )
        requireCondition(member != null, 404, "NOT_FOUND", "Пространство недоступно.")
        requireCondition(
            member.string("role") != "guest",
            422,
            "SERVICE_OWNER_INVALID",
            "Гость пространства не создаёт сервисные аккаунты.",
        )
        // One count per workspace at a time, so two requests cannot both take the last place.
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "service-accounts:${input.workspaceId}")
        val made = tx.row(
            "SELECT count(*)::int AS n FROM auth.service_accounts WHERE workspace_id = $1::uuid AND deleted_at IS NULL",
            input.workspaceId,
        )!!.int("n")
        requireCondition(
            made < WORKSPACE_LIMIT,
            422,
            "SERVICE_ACCOUNT_LIMIT",
            "В пространстве не больше $WORKSPACE_LIMIT сервисных аккаунтов. Удалите лишние.",
        )
        requireCondition(
            input.projects.map { it.projectId }.distinct().size == input.projects.size,
            400,
            "VALIDATION",
            "Каждый проект указывается один раз.",
        )
        val id = "sa_" + UUID.randomUUID()
        tx.update("INSERT INTO auth.principals(id, name, kind) VALUES ($1, $2, 'service')", id, input.name)
        tx.update(
            """
            INSERT INTO auth.service_accounts(principal_id, workspace_id, owner_id, created_by)
            VALUES ($1, $2::uuid, $3, $3)
            """.trimIndent(),
            id,
            input.workspaceId,
            actor.id,
        )
        AccessEvents.record(tx, id, "account.created", id, actorId = actor.id)
        val managed = Managed(id, input.workspaceId, actor.id, 1, isOwner = true, isWorkspaceAdmin = false)
        for (grant in input.projects) grantProject(tx, actor, managed, grant)
        return present(tx, account(tx, actor, id))
    }

    fun rename(tx: Transaction, actor: Actor, id: String, baseRevision: Long, name: String): Map<String, Any?> {
        val managed = manage(tx, actor, id)
        requireRevision(managed, baseRevision)
        tx.update("UPDATE auth.principals SET name = $2 WHERE id = $1", id, name)
        bump(tx, id)
        AccessEvents.record(tx, id, "account.changed", id, actorId = actor.id)
        return present(tx, account(tx, actor, id))
    }

    /**
     * Grants, changes or ends the account's access to one project of its workspace (`grant` null ends it). The owner
     * grants within their own rights there; a project administrator changes and removes it in their project; a
     * workspace administrator in any project of the workspace. Its owner's rights cap it in any case.
     */
    fun setProject(
        tx: Transaction,
        actor: Actor,
        id: String,
        projectId: String,
        grant: ProjectGrant?,
    ): Map<String, Any?> {
        requirePerson(actor)
        val managed = locate(tx, actor, id)
        val project = tx.row(
            """
            SELECT p.workspace_id::text AS "workspaceId",
                   (SELECT m.permissions && ARRAY['members.manage','agents.manage'] FROM app.project_members m
                    WHERE m.project_id = p.id AND m.principal_id = $2) AS mine,
                   (SELECT m.role FROM app.project_members m WHERE m.project_id = p.id AND m.principal_id = $3) AS current
            FROM app.projects p WHERE p.id = $1
            """.trimIndent(),
            projectId,
            actor.id,
            id,
        )
        val projectAdmin = project?.get("mine") == true
        requireCondition(
            project != null && project.string("workspaceId") == managed?.workspaceId &&
                (
                    managed.isOwner || managed.isWorkspaceAdmin ||
                        (projectAdmin && project.stringOrNull("current") != null)
                    ),
            404,
            "NOT_FOUND",
            "Сервисный аккаунт или проект недоступен.",
        )
        if (grant == null) {
            revokeProject(tx, actor, managed, projectId)
        } else {
            grantProject(tx, actor, managed, grant.copy(projectId = projectId))
        }
        if (managed.isOwner || managed.isWorkspaceAdmin) return present(tx, account(tx, actor, id))
        // A project administrator sees the account only as it is in their project.
        val member = tx.row(
            """
            SELECT m.role, m.preset_id AS "presetId", a.name AS "presetName", m.granted, m.revoked, m.permissions
            FROM app.project_members m JOIN app.access_presets a ON a.id = m.preset_id
            WHERE m.project_id = $1 AND m.principal_id = $2
            """.trimIndent(),
            projectId,
            id,
        )
        return linkedMapOf(
            "id" to id,
            "projectId" to projectId,
            "role" to member?.get("role"),
            "presetId" to member?.get("presetId"),
            "presetName" to member?.get("presetName"),
            "granted" to member?.strings("granted").orEmpty(),
            "revoked" to member?.strings("revoked").orEmpty(),
            "permissions" to member?.strings("permissions").orEmpty(),
        )
    }

    /**
     * A workspace administrator gives the account a new owner, a person of the workspace; this lifts a suspension and
     * ends every token and app of the account: the new owner starts afresh, nothing issued before acts under them.
     */
    fun reassign(tx: Transaction, actor: Actor, id: String, baseRevision: Long, ownerId: String): Map<String, Any?> {
        val managed = manage(tx, actor, id)
        requireCondition(
            managed.isWorkspaceAdmin,
            403,
            "WORKSPACE_ADMIN",
            "Владельца назначает администратор пространства.",
        )
        requireRevision(managed, baseRevision)
        val person = tx.row(
            """
            SELECT 1 AS found FROM app.workspace_members w JOIN auth.principals p ON p.id = w.principal_id
            WHERE w.workspace_id = $1::uuid AND w.principal_id = $2 AND p.kind = 'human' AND p.disabled_at IS NULL
              AND w.role <> 'guest'
            """.trimIndent(),
            managed.workspaceId,
            ownerId,
        )
        requireCondition(
            person != null,
            422,
            "SERVICE_OWNER_INVALID",
            "Владельцем может быть только участник пространства, не гость.",
        )
        tx.update(
            "UPDATE auth.service_accounts SET owner_id = $2, suspended_at = NULL WHERE principal_id = $1",
            id,
            ownerId,
        )
        // Tokens and apps were issued by the former owner under their rights: none of them carries over to the new one.
        endAccess(tx, id)
        bump(tx, id)
        AccessEvents.record(tx, id, "account.owner-changed", ownerId, actorId = actor.id)
        return present(tx, account(tx, actor, id))
    }

    /**
     * Ends the account: its projects, tokens and apps at once. Its principal stays, disabled, for the history. The
     * owner and workspace administrators delete it; a project administrator only when they administer every project
     * it is in.
     */
    fun delete(tx: Transaction, actor: Actor, id: String): Map<String, Boolean> {
        requirePerson(actor)
        val managed = requirePresent(locate(tx, actor, id), 404, "NOT_FOUND", "Сервисный аккаунт недоступен.")
        requireCondition(
            managed.isOwner || managed.isWorkspaceAdmin || administersEveryProject(tx, actor, id),
            403,
            "FORBIDDEN",
            "Аккаунт работает и в других проектах: удалить его может владелец или администратор пространства.",
        )
        tx.update("UPDATE auth.service_accounts SET deleted_at = clock_timestamp() WHERE principal_id = $1", id)
        tx.update("UPDATE auth.principals SET disabled_at = clock_timestamp() WHERE id = $1", id)
        tx.update("DELETE FROM app.project_members WHERE principal_id = $1", id)
        endAccess(tx, id)
        AccessEvents.record(tx, id, "account.deleted", id, actorId = actor.id)
        return mapOf("deleted" to true)
    }

    /** A token for a script: made by the owner only, shown once, only its hash is kept. */
    fun createToken(tx: Transaction, actor: Actor, id: String, input: NewToken): Map<String, Any?> {
        val managed = manage(tx, actor, id)
        requireCondition(managed.isOwner, 403, "OWNER_REQUIRED", "Токен создаёт владелец сервисного аккаунта.")
        requireCondition(
            tx.row("SELECT auth.service_account_active($1) AS active", id)!!.boolean("active"),
            409,
            "SERVICE_ACCOUNT_SUSPENDED",
            "Сервисный аккаунт приостановлен.",
        )
        val active = tx.row(
            """
            SELECT count(*)::int AS n FROM auth.credentials
            WHERE principal_id = $1 AND kind = 'service' AND revoked_at IS NULL AND expires_at > clock_timestamp()
            """.trimIndent(),
            id,
        )!!.int("n")
        requireCondition(
            active < TOKEN_LIMIT,
            422,
            "TOKEN_LIMIT",
            "Можно держать не больше $TOKEN_LIMIT токенов. Отзовите лишние.",
        )
        val tokenId = UUID.randomUUID().toString()
        val token = Tokens.prefixed(requireNotNull(CredentialKind.SERVICE.prefix))
        val row = tx.row(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, name, scopes, audience)
            VALUES ($1, $2, $3, 'service', $4, clock_timestamp() + make_interval(days => $5::int), $6, $7, $8)
            RETURNING id, name, scopes, created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt"
            """.trimIndent(),
            tokenId,
            id,
            Tokens.sha256Hex(token),
            actor.id,
            input.expiresInDays,
            input.name,
            (input.scopes + Scope.READ).map(Scope::wire).sorted(),
            properties.apiBase,
        )!!
        AccessEvents.record(tx, id, "token.created", tokenId, actorId = actor.id)
        return LinkedHashMap<String, Any?>(row).apply { put("token", token) }
    }

    fun revokeToken(tx: Transaction, actor: Actor, id: String, tokenId: String): Map<String, Boolean> {
        manage(tx, actor, id)
        val revoked = tx.row(
            """
            UPDATE auth.credentials SET revoked_at = clock_timestamp()
            WHERE id = $1 AND principal_id = $2 AND kind = 'service' AND revoked_at IS NULL RETURNING id
            """.trimIndent(),
            tokenId,
            id,
        )
        requireCondition(revoked != null, 404, "NOT_FOUND", "Токен недоступен.")
        AccessEvents.record(tx, id, "token.revoked", tokenId, actorId = actor.id)
        return mapOf("revoked" to true)
    }

    /** Disconnects an app from an account the caller manages. */
    fun revokeApp(tx: Transaction, actor: Actor, grantId: String): Map<String, Boolean> {
        requirePerson(actor)
        requireCondition(UUID_PATTERN.matches(grantId), 404, "NOT_FOUND", "Приложение не подключено.")
        val grant = tx.row(
            """
            SELECT principal_id AS "accountId", client_id AS "clientId" FROM auth.oauth_grants
            WHERE id = $1::uuid AND revoked_at IS NULL FOR UPDATE
            """.trimIndent(),
            grantId,
        )
        val managed = grant?.let { locate(tx, actor, it.string("accountId")) }
        requireCondition(grant != null && managed != null, 404, "NOT_FOUND", "Приложение не подключено.")
        requireCondition(
            managed.isOwner || managed.isWorkspaceAdmin,
            403,
            "FORBIDDEN",
            "Приложение отключают владелец аккаунта и администраторы пространства.",
        )
        ConnectedApps.revokeGrant(tx, grantId)
        AccessEvents.record(tx, grant.string("accountId"), "app.revoked", grantId, grant.string("clientId"), actor.id)
        return mapOf("revoked" to true)
    }

    /** An account of the caller that is able to act now, for the consent screen; null otherwise. */
    fun ownedActive(tx: Transaction, actor: Actor, id: String): String? = tx.row(
        """
        SELECT principal_id AS id FROM auth.service_accounts
        WHERE principal_id = $1 AND owner_id = $2 AND deleted_at IS NULL AND auth.service_account_active(principal_id)
        """.trimIndent(),
        id,
        actor.id,
    )?.string("id")

    private fun grantProject(tx: Transaction, actor: Actor, managed: Managed, grant: ProjectGrant) {
        val projectId = grant.projectId
        // The owner's row is held until this grant commits, so a concurrent narrowing of the owner either waits and
        // then recompiles the account, or commits first and is what the account's row is compiled against. Every
        // change of the owner's rights locks that row before the account's, as this does.
        val owner = tx.row(
            """
            SELECT m.permissions FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
            WHERE m.project_id = $1 AND m.principal_id = $2 AND p.workspace_id = $3::uuid FOR SHARE OF m
            """.trimIndent(),
            projectId,
            managed.ownerId,
            managed.workspaceId,
        )
        requireCondition(
            owner != null,
            422,
            "OWNER_NOT_MEMBER",
            "Владелец сервисного аккаунта не участник этого проекта.",
        )
        val (preset, granted, revoked) = checked(tx, actor, managed, grant, ProjectAccess.permissionsOf(owner))
        val detail = "$projectId:${preset.key?.key ?: preset.id}" +
            granted.joinToString("") { "+${it.wire}" } + revoked.joinToString("") { "-${it.wire}" }
        val current = tx.row(
            """
            SELECT preset_id, granted, revoked FROM app.project_members WHERE project_id = $1 AND principal_id = $2 FOR UPDATE
            """.trimIndent(),
            projectId,
            managed.id,
        )
        if (current == null) {
            val count = tx.row(
                "SELECT count(*)::int AS n FROM app.project_members WHERE principal_id = $1",
                managed.id,
            )!!.int("n")
            requireCondition(count < PROJECT_LIMIT, 422, "PROJECT_LIMIT", "Слишком много проектов у одного аккаунта.")
            tx.update(
                """
                INSERT INTO app.project_members(project_id, workspace_id, principal_id, preset_id, granted, revoked, changed_by,
                  changed_at)
                VALUES ($1, $2::uuid, $3, $4::uuid, $5::text[], $6::text[], $7, clock_timestamp())
                """.trimIndent(),
                projectId, managed.workspaceId, managed.id, preset.id, granted.map(Permission::wire),
                revoked.map(Permission::wire), actor.id,
            )
        } else if (current.string("preset_id") != preset.id ||
            current.strings("granted") != granted.map(Permission::wire) ||
            current.strings("revoked") != revoked.map(Permission::wire)
        ) {
            tx.update(
                """
                UPDATE app.project_members SET preset_id = $3::uuid, granted = $4::text[], revoked = $5::text[],
                  revision = revision + 1, changed_by = $6, changed_at = clock_timestamp()
                WHERE project_id = $1 AND principal_id = $2
                """.trimIndent(),
                projectId, managed.id, preset.id, granted.map(Permission::wire), revoked.map(Permission::wire),
                actor.id,
            )
        } else {
            return
        }
        bump(tx, managed.id)
        AccessEvents.record(tx, managed.id, "project.granted", detail.take(DETAIL_LIMIT), actorId = actor.id)
    }

    /**
     * The preset and the personal changes of a grant, once they are for service accounts, consistent, within the
     * owner's permissions in the project and, when someone else grants it, within theirs.
     */
    private fun checked(
        tx: Transaction,
        actor: Actor,
        managed: Managed,
        grant: ProjectGrant,
        ownerHas: Set<Permission>,
    ): Triple<Preset, Set<Permission>, Set<Permission>> {
        val projectId = grant.projectId
        val presetId = grant.presetId ?: Presets.system(
            tx,
            managed.workspaceId,
            if (grant.writes) SystemPreset.SERVICE_TASKS else SystemPreset.SERVICE_READ,
        ).id
        val preset = Presets.find(tx, managed.workspaceId, presetId)
        requireCondition(
            !preset.human && !preset.archived,
            422,
            "PRESET_NOT_FOUND",
            "Выберите пресет для сервисных аккаунтов.",
        )
        // Removing a permission the account can never hold is harmless; only adding one is refused.
        val never = grant.granted.filter { it.service == Permission.ServiceUse.NEVER }
        requireCondition(
            never.isEmpty(),
            422,
            "SERVICE_RESTRICTED",
            "Сервисному аккаунту это право недоступно: ${never.joinToString { "«${it.title}»" }}.",
        )
        val conflicts = Permissions.conflicts(grant.granted, grant.revoked)
        requireCondition(
            conflicts.isEmpty(),
            422,
            "PERMISSION_DEPENDENCY",
            "Нельзя одновременно дать и убрать то, от чего оно зависит: ${conflicts.joinToString { "«${it.title}»" }}.",
        )
        val base = preset.permissions.filterNot { it.service == Permission.ServiceUse.EXPLICIT }
        val (granted, revoked) = Permissions.normalize(base, grant.granted, grant.revoked)
        val wanted = Permissions.compile(base, granted, revoked, Permissions.NEVER_SERVICE)
        // An addition is never above its owner here. What the preset holds beyond the owner stays in the grant: the
        // database caps it by the owner's current permissions (II.5), so it applies once the owner has it, and is
        // not written into the removals. Nor above the person who grants it, unless that is the owner.
        val beyondOwner = granted - ownerHas
        requireCondition(
            beyondOwner.isEmpty(),
            422,
            "SERVICE_RESTRICTED",
            "Не шире прав владельца: у него нет ${beyondOwner.joinToString { "«${it.title}»" }}.",
        )
        if (actor.id != managed.ownerId && !managed.isWorkspaceAdmin) {
            val mine = ProjectAccess.membership(tx, actor, projectId)?.permissions.orEmpty()
            val beyond = wanted - mine
            requireCondition(
                beyond.isEmpty(),
                403,
                "PERMISSION_EXCEEDS_ACTOR",
                "Нельзя дать право, которого нет у вас: ${beyond.joinToString { "«${it.title}»" }}.",
            )
        }
        return Triple(preset, granted, revoked)
    }

    private fun revokeProject(tx: Transaction, actor: Actor, managed: Managed, projectId: String) {
        val removed = tx.update(
            "DELETE FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
            projectId,
            managed.id,
        )
        requireCondition(removed == 1, 404, "NOT_FOUND", "У сервисного аккаунта нет доступа к проекту.")
        bump(tx, managed.id)
        AccessEvents.record(tx, managed.id, "project.revoked", projectId, actorId = actor.id)
    }

    /** The account as its owner or an administrator sees it; null when the caller may not manage it. */
    private fun locate(tx: Transaction, actor: Actor, id: String): Managed? {
        val row = tx.row(
            """
            SELECT s.principal_id AS id, s.workspace_id::text AS "workspaceId", s.owner_id AS "ownerId", s.revision,
                   s.owner_id = $2 AND s.suspended_at IS NULL AND EXISTS (SELECT 1 FROM app.workspace_members w
                     WHERE w.workspace_id = s.workspace_id AND w.principal_id = $2) AS "isOwner",
                   EXISTS (SELECT 1 FROM app.workspace_members w WHERE w.workspace_id = s.workspace_id
                           AND w.principal_id = $2 AND 'workspace.people' = ANY(w.permissions)) AS "isWorkspaceAdmin"
            FROM auth.service_accounts s WHERE s.principal_id = $1 AND s.deleted_at IS NULL FOR UPDATE OF s
            """.trimIndent(),
            id,
            actor.id,
        ) ?: return null
        return Managed(
            row.string("id"),
            row.string("workspaceId"),
            row.string("ownerId"),
            row.long("revision"),
            row.boolean("isOwner"),
            row.boolean("isWorkspaceAdmin"),
        ).takeIf { it.isOwner || it.isWorkspaceAdmin || isProjectAdminOf(tx, actor, id) }
    }

    /** The owner or a workspace administrator; a project administrator only changes the project grant. */
    private fun manage(tx: Transaction, actor: Actor, id: String): Managed {
        requirePerson(actor)
        val managed = requirePresent(locate(tx, actor, id), 404, "NOT_FOUND", "Сервисный аккаунт недоступен.")
        requireCondition(
            managed.isOwner || managed.isWorkspaceAdmin,
            403,
            "FORBIDDEN",
            "Сервисным аккаунтом управляют его владелец и администраторы пространства.",
        )
        return managed
    }

    private fun isProjectAdminOf(tx: Transaction, actor: Actor, id: String): Boolean = tx.row(
        """
        SELECT 1 AS found FROM app.project_members a JOIN app.project_members s ON s.project_id = a.project_id
        WHERE a.principal_id = $1 AND a.permissions && ARRAY['members.manage','agents.manage'] AND s.principal_id = $2 LIMIT 1
        """.trimIndent(),
        actor.id,
        id,
    ) != null

    /** Whether the caller administers every project the account is in (and it is in one at least). */
    private fun administersEveryProject(tx: Transaction, actor: Actor, id: String): Boolean = tx.row(
        """
        SELECT count(*) > 0 AND bool_and(EXISTS (
                 SELECT 1 FROM app.project_members a WHERE a.project_id = s.project_id AND a.principal_id = $1
                 AND a.permissions && ARRAY['members.manage','agents.manage'])) AS every
        FROM app.project_members s WHERE s.principal_id = $2
        """.trimIndent(),
        actor.id,
        id,
    )!!.boolean("every")

    private fun account(tx: Transaction, actor: Actor, id: String): Row = tx.row(
        """
        SELECT s.principal_id AS id, p.name, s.workspace_id::text AS "workspaceId",
               coalesce((SELECT w.name FROM app.workspaces w WHERE w.id = s.workspace_id), '') AS "workspaceName",
               s.owner_id AS "ownerId", coalesce(o.profile_name, o.name) AS "ownerName", s.revision,
               s.created_at AS "createdAt", s.owner_id = $2 AS mine,
               NOT auth.service_account_active(s.principal_id) AS suspended
        FROM auth.service_accounts s JOIN auth.principals p ON p.id = s.principal_id
        JOIN auth.principals o ON o.id = s.owner_id WHERE s.principal_id = $1
        """.trimIndent(),
        id,
        actor.id,
    )!!

    /** One account with its projects (compiled permissions and its owner's there), tokens and connected apps. */
    private fun present(tx: Transaction, account: Row): Map<String, Any?> {
        val id = account.string("id")
        val projects = tx.rows(
            """
            SELECT m.project_id AS "projectId", coalesce(p.name, '') AS name, m.role, m.preset_id AS "presetId",
                   a.name AS "presetName", m.granted, m.revoked, m.permissions, o.permissions AS "ownerPermissions"
            FROM app.project_members m JOIN app.access_presets a ON a.id = m.preset_id
            LEFT JOIN app.projects p ON p.id = m.project_id
            LEFT JOIN app.project_members o ON o.project_id = m.project_id AND o.principal_id = $2
            WHERE m.principal_id = $1 ORDER BY name, m.project_id
            """.trimIndent(),
            id,
            account.string("ownerId"),
        ).map { LinkedHashMap<String, Any?>(it) }
        val tokens = tx.rows(
            """
            SELECT id, name, scopes, created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt"
            FROM auth.credentials
            WHERE principal_id = $1 AND kind = 'service' AND revoked_at IS NULL AND expires_at > clock_timestamp()
            ORDER BY created_at DESC, id LIMIT $2
            """.trimIndent(),
            id,
            TOKEN_LIMIT,
        )
        return LinkedHashMap<String, Any?>(account).apply {
            put("projects", projects)
            put("tokens", tokens)
            put("apps", ConnectedApps.of(tx, id))
        }
    }

    private fun bump(tx: Transaction, id: String) {
        tx.update("UPDATE auth.service_accounts SET revision = revision + 1 WHERE principal_id = $1", id)
    }

    private fun requireRevision(managed: Managed, baseRevision: Long) {
        requireCondition(managed.revision == baseRevision, 409, "CONFLICT", "Сервисный аккаунт уже изменён.")
    }

    private fun requirePerson(actor: Actor) {
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Сервисными аккаунтами управляет человек.")
    }

    companion object {
        const val WORKSPACE_LIMIT = 50
        const val TOKEN_LIMIT = 20
        const val PROJECT_LIMIT = 100
        const val MAX_TOKEN_DAYS = 365
        private const val LIST_LIMIT = 200
        private const val DETAIL_LIMIT = 100
        private val UUID_PATTERN = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

        /** Ends every token and app of an account, in the caller's transaction. */
        fun endAccess(tx: Transaction, id: String) {
            tx.update(
                """
                UPDATE auth.credentials SET revoked_at = clock_timestamp()
                WHERE principal_id = $1 AND kind IN ('service', 'oauth') AND revoked_at IS NULL
                """.trimIndent(),
                id,
            )
            val grants = tx.rows("SELECT id FROM auth.oauth_grants WHERE principal_id = $1 AND revoked_at IS NULL", id)
            for (grant in grants) ConnectedApps.revokeGrant(tx, grant.string("id"))
        }

        /**
         * The owner left the workspace: their accounts there stop until an administrator gives them a new owner or
         * deletes them. Their tokens stay; nothing authenticates while the account is suspended.
         */
        fun suspendOwnedBy(tx: Transaction, actor: Actor, workspaceId: String, ownerId: String) {
            val suspended = tx.rows(
                """
                UPDATE auth.service_accounts SET suspended_at = clock_timestamp(), revision = revision + 1
                WHERE workspace_id = $1::uuid AND owner_id = $2 AND deleted_at IS NULL AND suspended_at IS NULL
                RETURNING principal_id AS id
                """.trimIndent(),
                workspaceId,
                ownerId,
            )
            for (account in suspended) {
                AccessEvents.record(tx, account.string("id"), "account.suspended", ownerId, actorId = actor.id)
            }
        }
    }
}
