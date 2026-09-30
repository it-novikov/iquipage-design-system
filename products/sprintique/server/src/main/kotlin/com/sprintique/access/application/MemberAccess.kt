package com.sprintique.access.application

import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.AccessEvents
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ProjectMembership
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.workbench.application.AttentionRequests
import java.util.UUID

/**
 * Who has which permissions in a project: the members with their preset and personal changes, the change of one
 * person's access, adding someone from the workspace, handing administration over, an administrator of the workspace
 * entering the project, the project's defaults for new members and the read-only matrix.
 *
 * Rules that hold for every change: not more than one's own (a member cannot give or keep for someone a permission
 * they lack, nor change someone who holds more than they do); a project keeps at least one active person with
 * «Управлять доступом»; a guest never gets it; every change is audited with what was added and removed.
 */
@Suppress("TooManyFunctions")
object MemberAccess {
    private const val MEMBER_LIMIT = 500
    private val AGENT_VIEW = setOf("id", "name", "kind", "role", "avatarRevision", "joinedAt", "lastActiveAt")

    /**
     * The membership lock shared with the other membership changes: an advisory lock, the project row, then the live
     * credential and the permission again.
     */
    fun manage(tx: Transaction, actor: Actor, projectId: String, capability: Capability): ProjectMembership {
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        ProjectAccess.requireActiveCredential(tx, actor)
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Доступом управляет человек.")
        return ProjectAccess.authorize(tx, actor, projectId, capability)
    }

    fun members(tx: Transaction, actor: Actor, projectId: String): List<Map<String, Any?>> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.kind, m.role, m.revision, m.joined_at AS "joinedAt",
                   (SELECT a.created_at FROM app.audit_events a WHERE a.project_id = m.project_id AND a.actor_id = p.id
                    ORDER BY a.created_at DESC LIMIT 1) AS "lastActiveAt",
                   (SELECT v.revision FROM app.person_avatars v WHERE v.principal_id = p.id) AS "avatarRevision",
                   m.preset_id AS "presetId", s.name AS "presetName", s.key AS "presetKey", s.hint AS "presetHint",
                   s.permissions AS "presetPermissions", m.granted, m.revoked, m.permissions,
                   m.changed_at AS "changedAt", coalesce(c.profile_name, c.name) AS "changedByName",
                   w.role AS "workspaceRole", coalesce(i.profile_name, i.name) AS "invitedByName",
                   sa.owner_id AS "ownerId",
                   (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = sa.owner_id) AS "ownerName",
                   CASE WHEN sa.principal_id IS NULL THEN NULL ELSE NOT auth.service_account_active(sa.principal_id) END
                     AS suspended
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            JOIN app.access_presets s ON s.id = m.preset_id
            LEFT JOIN auth.service_accounts sa ON sa.principal_id = m.principal_id
            LEFT JOIN auth.principals c ON c.id = m.changed_by
            LEFT JOIN app.workspace_members w ON w.workspace_id = m.workspace_id AND w.principal_id = m.principal_id
            LEFT JOIN auth.principals i ON i.id = w.invited_by
            WHERE m.project_id = $1 ORDER BY name, p.id LIMIT 501
            """.trimIndent(),
            projectId,
        ).map { row ->
            // An agent's token sees who is in the project, not how their access is set up.
            if (actor.isHuman) withDifference(row) else row.filterKeys { it in AGENT_VIEW }
        }
    }

    /** The personal difference from the preset as the page shows it: what is added and what is removed. */
    private fun withDifference(row: Row): Map<String, Any?> {
        val preset = ProjectAccess.permissionsOf(row, "presetPermissions")
        val (added, removed) = Permissions.normalize(
            preset,
            ProjectAccess.permissionsOf(row, "granted"),
            ProjectAccess.permissionsOf(row, "revoked"),
        )
        return LinkedHashMap<String, Any?>(row.without("presetPermissions")).apply {
            put("added", added.map(Permission::wire))
            put("removed", removed.map(Permission::wire))
            put("modified", added.isNotEmpty() || removed.isNotEmpty())
        }
    }

    data class AccessChange(
        val baseRevision: Long,
        val presetId: String,
        val granted: Set<Permission>,
        val revoked: Set<Permission>,
    )

    @Suppress("LongMethod")
    fun change(tx: Transaction, actor: Actor, projectId: String, id: String, input: AccessChange): Map<String, Any?> {
        val me = manage(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        val target = target(tx, projectId, id)
        requireCondition(
            target.string("kind") != "agent",
            422,
            "AGENT_GRANT_REQUIRED",
            "Доступ агента изменяется через его разрешение.",
        )
        requireCondition(
            target.string("kind") == "human",
            422,
            "SERVICE_ACCOUNT_ENDPOINT",
            "Права сервисного аккаунта меняются в его настройках (PUT " +
                "/api/v1/service-accounts/{id}/projects/{project}).",
        )
        requireCondition(
            target.long("revision") == input.baseRevision,
            409,
            "CONFLICT",
            "Права участника уже изменены.",
        )
        val preset = Presets.requireUsable(tx, me.workspaceId, input.presetId)
        val conflicts = Permissions.conflicts(input.granted, input.revoked)
        requireCondition(
            conflicts.isEmpty(),
            422,
            "PERMISSION_DEPENDENCY",
            "Нельзя одновременно дать и убрать то, от чего оно зависит: ${conflicts.joinToString { "«${it.title}»" }}.",
        )
        val (granted, revoked) = Permissions.normalize(preset.permissions, input.granted, input.revoked)
        val guest = target.stringOrNull("workspaceRole") == WorkspaceRole.GUEST.wire
        val after = Permissions.compile(preset.permissions, granted, revoked)
        requireCondition(
            !guest || Permission.PROJECT_ACCESS !in after,
            422,
            "GUEST_RESTRICTED",
            "Гостю нельзя дать «Управлять доступом».",
        )
        val before = ProjectAccess.permissionsOf(target)
        requireNotAbove(me, id, actor, before, after)
        if (Permission.PROJECT_ACCESS in before && Permission.PROJECT_ACCESS !in after) {
            requireAnotherAdministrator(tx, projectId, id)
        }
        tx.update(
            """
            UPDATE app.project_members SET preset_id = $3::uuid, granted = $4::text[], revoked = $5::text[],
              revision = revision + 1, changed_by = $6, changed_at = clock_timestamp()
            WHERE project_id = $1 AND principal_id = $2
            """.trimIndent(),
            projectId, id, preset.id, granted.map(Permission::wire), revoked.map(Permission::wire), actor.id,
        )
        val stored = target(tx, projectId, id)
        val effective = ProjectAccess.permissionsOf(stored)
        if (Permission.TASKS_WRITE !in effective) stopsChanging(tx, actor, projectId, id)
        recordAccessEvent(
            tx, actor, projectId, "member.permissions.updated", id,
            mapOf(
                "presetBefore" to target.string("presetName"),
                "presetAfter" to preset.name,
                "granted" to granted.map(Permission::wire),
                "revoked" to revoked.map(Permission::wire),
                "added" to (effective - before).map(Permission::wire),
                "removed" to (before - effective).map(Permission::wire),
            ),
        )
        return linkedMapOf(
            "id" to id,
            "revision" to stored.long("revision"),
            "presetId" to preset.id,
            "role" to stored.string("role"),
            "permissions" to effective.map(Permission::wire),
        )
    }

    /** A person leaves the project. Their workspace membership stays; their agent tokens here stop. */
    fun remove(tx: Transaction, actor: Actor, projectId: String, id: String, baseRevision: Long): Map<String, Any?> {
        val me = manage(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        requireCondition(id != actor.id, 422, "SELF_REMOVAL", "Удаление своего доступа выполняет другой администратор.")
        val target = target(tx, projectId, id)
        requireCondition(target.long("revision") == baseRevision, 409, "CONFLICT", "Права участника уже изменены.")
        val before = ProjectAccess.permissionsOf(target)
        requireNotAbove(me, id, actor, before, emptySet())
        if (Permission.PROJECT_ACCESS in before) requireAnotherAdministrator(tx, projectId, id)
        // Recorded while the actor is still a member. One transaction.
        recordAccessEvent(
            tx,
            actor,
            projectId,
            "member.removed",
            id,
            mapOf("presetBefore" to target.string("presetName")),
        )
        if (target.string("kind") ==
            "service"
        ) {
            AccessEvents.record(tx, id, "project.revoked", projectId, actorId = actor.id)
        }
        // Orphaned while the actor still sees the project's requests, then the membership goes.
        stopsChanging(tx, actor, projectId, id)
        tx.update("DELETE FROM app.project_members WHERE project_id = $1 AND principal_id = $2", projectId, id)
        return linkedMapOf("id" to id, "role" to null, "revision" to baseRevision + 1)
    }

    /** People of the workspace who can be added: members and administrators who are not here yet (never guests). */
    fun directory(tx: Transaction, actor: Actor, projectId: String): List<Row> {
        ProjectAccess.requireInteractive(actor)
        val me = ProjectAccess.authorize(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        return tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, w.role,
                   (SELECT v.revision FROM app.person_avatars v WHERE v.principal_id = p.id) AS "avatarRevision"
            FROM app.workspace_members w JOIN auth.principals p ON p.id = w.principal_id
            WHERE w.workspace_id = $1::uuid AND w.role <> 'guest' AND p.kind = 'human' AND p.disabled_at IS NULL
              AND NOT EXISTS(SELECT 1 FROM app.project_members m WHERE m.project_id = $2 AND m.principal_id = p.id)
            ORDER BY name, p.id LIMIT 501
            """.trimIndent(),
            me.workspaceId,
            projectId,
        )
    }

    fun add(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        principalId: String,
        presetId: String?,
    ): Map<String, Any?> {
        val me = manage(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        val person = tx.row(
            """
            SELECT w.role FROM app.workspace_members w JOIN auth.principals p ON p.id = w.principal_id
            WHERE w.workspace_id = $1::uuid AND w.principal_id = $2 AND p.kind = 'human' AND p.disabled_at IS NULL
            """.trimIndent(),
            me.workspaceId,
            principalId,
        )
        requireCondition(person != null, 404, "NOT_FOUND", "Человек не состоит в пространстве.")
        requireCondition(
            person.string("role") != WorkspaceRole.GUEST.wire,
            422,
            "GUEST_RESTRICTED",
            "Гостя добавляют в проект только приглашением.",
        )
        val exists = tx.row(
            "SELECT 1 AS found FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
            projectId,
            principalId,
        )
        requireCondition(exists == null, 409, "MEMBER_EXISTS", "Человек уже участвует в проекте.")
        requireRoom(tx, projectId)
        val preset =
            presetId?.let { Presets.requireUsable(tx, me.workspaceId, it) }
                ?: defaultPreset(tx, projectId, guest = false)
        val after = Permissions.compile(preset.permissions)
        requireNotAbove(me, principalId, actor, emptySet(), after)
        insertMember(tx, projectId, me.workspaceId, principalId, preset.id, actor.id)
        recordAccessEvent(tx, actor, projectId, "member.added", principalId, mapOf("preset" to preset.name))
        return linkedMapOf("id" to principalId, "presetId" to preset.id)
    }

    /**
     * The only way out of administration for the last administrator: someone else gets exactly the actor's access
     * (never more), and the actor takes a preset within it, in one step.
     */
    fun handover(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        toId: String,
        baseRevision: Long,
        ownPresetId: String,
    ): Map<String, Any?> {
        val me = manage(tx, actor, projectId, Capability.PROJECT_ACCESS)
        requireCondition(toId != actor.id, 422, "HANDOVER_SELF", "Выберите другого участника.")
        val target = target(tx, projectId, toId)
        val active = tx.row("SELECT disabled_at IS NULL AS active FROM auth.principals WHERE id = $1", toId)!!
        requireCondition(
            target.string("kind") == "human" && active.boolean("active") &&
                target.stringOrNull("workspaceRole") != WorkspaceRole.GUEST.wire,
            422,
            "HANDOVER_INVALID",
            "Администратором может стать активный участник пространства, не гость.",
        )
        requireCondition(target.long("revision") == baseRevision, 409, "CONFLICT", "Права участника уже изменены.")
        // Not more than one's own: the new administrator gets exactly the actor's access, and the actor keeps no more.
        val mine = target(tx, projectId, actor.id)
        val own = Presets.requireUsable(tx, me.workspaceId, ownPresetId)
        val kept = Permissions.compile(own.permissions)
        requireNotAbove(me, actor.id, actor, me.permissions, kept)
        requireNotAbove(me, toId, actor, ProjectAccess.permissionsOf(target), me.permissions)
        tx.update(
            """
            UPDATE app.project_members SET preset_id = $3::uuid, granted = $4::text[], revoked = $5::text[],
              revision = revision + 1, changed_by = $6, changed_at = clock_timestamp()
            WHERE project_id = $1 AND principal_id = $2
            """.trimIndent(),
            projectId, toId, mine.string("presetId"), mine.strings("granted"), mine.strings("revoked"), actor.id,
        )
        tx.update(
            """
            UPDATE app.project_members SET preset_id = $3::uuid, granted = '{}', revoked = '{}', revision = revision + 1,
              changed_by = $2, changed_at = clock_timestamp() WHERE project_id = $1 AND principal_id = $2
            """.trimIndent(),
            projectId, actor.id, own.id,
        )
        requireCondition(
            Permission.PROJECT_ACCESS in ProjectAccess.permissionsOf(target(tx, projectId, toId)),
            409,
            "LAST_ADMIN",
            "Новый администратор не получил «Управлять доступом».",
        )
        if (Permission.TASKS_WRITE !in ProjectAccess.permissionsOf(target(tx, projectId, actor.id))) {
            stopsChanging(tx, actor, projectId, actor.id)
        }
        recordAccessEvent(tx, actor, projectId, "member.handover", toId, mapOf("to" to toId, "ownPreset" to own.name))
        return linkedMapOf("administratorId" to toId, "presetId" to own.id)
    }

    /**
     * An owner or administrator of the workspace (projects.oversee) enters a project as its administrator. It is
     * explicit and recorded in the project's history, which its members see.
     */
    fun joinAsAdmin(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Войти в проект может человек.")
        // Visible through the workspace directory policy only to those who oversee the workspace's projects.
        val project = tx.row("SELECT workspace_id AS \"workspaceId\", slug FROM app.projects WHERE id = $1", projectId)
        requirePresent(project, 404, "NOT_FOUND", "Проект недоступен.")
        val workspaceId = project.string("workspaceId")
        WorkspaceAccess.lock(tx, actor, workspaceId, Permission.PROJECTS_OVERSEE)
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        val admin = Presets.system(tx, workspaceId, SystemPreset.ADMIN)
        val existing = tx.row(
            "SELECT permissions FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
            projectId,
            actor.id,
        )
        if (existing == null) {
            requireRoom(tx, projectId)
            insertMember(tx, projectId, workspaceId, actor.id, admin.id, actor.id)
        } else {
            tx.update(
                """
                UPDATE app.project_members SET preset_id = $3::uuid, granted = '{}', revoked = '{}', revision = revision + 1,
                  changed_by = $2, changed_at = clock_timestamp() WHERE project_id = $1 AND principal_id = $2
                """.trimIndent(),
                projectId, actor.id, admin.id,
            )
        }
        recordAccessEvent(
            tx,
            actor,
            projectId,
            "access.workspace_admin_joined",
            actor.id,
            mapOf("wasMember" to (existing != null)),
        )
        return linkedMapOf("projectId" to projectId, "slug" to project.string("slug"))
    }

    /**
     * «Что может»: every permission of the catalog with where it comes from. About oneself always; about others with
     * members.manage.
     */
    fun effective(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        if (id == actor.id) {
            ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        } else {
            ProjectAccess.authorize(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        }
        val row = target(tx, projectId, id, lock = false)
        val preset = ProjectAccess.permissionsOf(row, "presetPermissions")
        val effective = ProjectAccess.permissionsOf(row)
        val (added, removed) = Permissions.normalize(
            preset,
            ProjectAccess.permissionsOf(row, "granted"),
            ProjectAccess.permissionsOf(row, "revoked"),
        )
        val sources = Permissions.sources(preset, added, removed, effective)
        return linkedMapOf(
            "id" to id,
            "name" to row.string("name"),
            "kind" to row.string("kind"),
            "workspaceRole" to row.stringOrNull("workspaceRole"),
            "revision" to row.long("revision"),
            "presetId" to row.string("presetId"),
            "presetName" to row.string("presetName"),
            "added" to added.map(Permission::wire),
            "removed" to removed.map(Permission::wire),
            "permissions" to effective.map(Permission::wire),
            "sources" to sources.entries.associate { (permission, source) -> permission.wire to source.wire },
            "changedAt" to row["changedAt"],
            "changedByName" to row["changedByName"],
        )
    }

    fun settings(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        val me = ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val row = tx.row(
            """
            SELECT p.access_revision AS revision, p.default_member_preset_id AS "memberPresetId",
                   p.default_guest_preset_id AS "guestPresetId",
                   coalesce(w.default_member_preset_id, (SELECT id FROM app.access_presets WHERE workspace_id = w.id AND key = 'editor'))
                     AS "workspaceMemberPresetId",
                   coalesce(w.default_guest_preset_id, (SELECT id FROM app.access_presets WHERE workspace_id = w.id AND key = 'guest'))
                     AS "workspaceGuestPresetId"
            FROM app.projects p JOIN app.workspaces w ON w.id = p.workspace_id WHERE p.id = $1
            """.trimIndent(),
            projectId,
        )!!
        val overseers = tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, w.role FROM app.workspace_members w
            JOIN auth.principals p ON p.id = w.principal_id
            WHERE w.workspace_id = $1::uuid AND 'projects.oversee' = ANY(w.permissions) AND p.kind = 'human' AND p.disabled_at IS NULL
            ORDER BY CASE w.role WHEN 'owner' THEN 0 ELSE 1 END, name LIMIT 50
            """.trimIndent(),
            me.workspaceId,
        )
        return LinkedHashMap<String, Any?>(row).apply {
            put("workspaceId", me.workspaceId)
            put("workspaceAdministrators", overseers)
            put("canManage", me.has(Permission.PROJECT_ACCESS))
        }
    }

    data class SettingsChange(val baseRevision: Long, val memberPresetId: String?, val guestPresetId: String?)

    fun changeSettings(tx: Transaction, actor: Actor, projectId: String, input: SettingsChange): Map<String, Any?> {
        val me = manage(tx, actor, projectId, Capability.PROJECT_ACCESS)
        val revision = tx.row(
            "SELECT access_revision FROM app.projects WHERE id = $1",
            projectId,
        )!!.long("access_revision")
        requireCondition(revision == input.baseRevision, 409, "CONFLICT", "Доступ проекта уже изменён.")
        input.memberPresetId?.let { Presets.requireUsable(tx, me.workspaceId, it) }
        input.guestPresetId?.let { Presets.requireGuestUsable(tx, me.workspaceId, it) }
        tx.update(
            """
            UPDATE app.projects SET default_member_preset_id = $2::uuid, default_guest_preset_id = $3::uuid,
              access_revision = access_revision + 1 WHERE id = $1
            """.trimIndent(),
            projectId, input.memberPresetId, input.guestPresetId,
        )
        recordAccessEvent(
            tx, actor, projectId, "access.defaults.updated", projectId,
            mapOf("memberPresetId" to input.memberPresetId, "guestPresetId" to input.guestPresetId),
        )
        return settings(tx, actor, projectId)
    }

    /** A compact read-only overview: who holds which permission. */
    fun matrix(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        ProjectAccess.authorize(tx, actor, projectId, Capability.PROJECT_ACCESS)
        val members = tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.kind, s.name AS "presetName", m.permissions
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id JOIN app.access_presets s ON s.id = m.preset_id
            WHERE m.project_id = $1 ORDER BY p.kind DESC, name, p.id LIMIT 501
            """.trimIndent(),
            projectId,
        )
        return linkedMapOf("permissions" to Permission.PROJECT.map(Permission::wire), "members" to members)
    }

    /** The preset a new member of the project starts from: the project's own default, else the workspace's. */
    fun defaultPreset(tx: Transaction, projectId: String, guest: Boolean): Preset {
        val row = tx.row(
            """
            SELECT p.workspace_id AS "workspaceId",
                   coalesce(${if (guest) "p.default_guest_preset_id, w.default_guest_preset_id" else "p.default_member_preset_id, w.default_member_preset_id"})
                     AS "presetId"
            FROM app.projects p JOIN app.workspaces w ON w.id = p.workspace_id WHERE p.id = $1
            """.trimIndent(),
            projectId,
        )!!
        val id = row.stringOrNull("presetId")
        return if (id != null) {
            Presets.find(tx, row.string("workspaceId"), id)
        } else {
            Presets.system(tx, row.string("workspaceId"), if (guest) SystemPreset.GUEST else SystemPreset.EDITOR)
        }
    }

    fun insertMember(
        tx: Transaction,
        projectId: String,
        workspaceId: String,
        principalId: String,
        presetId: String,
        by: String,
    ) {
        tx.update(
            """
            INSERT INTO app.project_members(project_id, workspace_id, principal_id, preset_id, changed_by, changed_at)
            VALUES ($1, $2::uuid, $3, $4::uuid, $5, clock_timestamp())
            """.trimIndent(),
            projectId, workspaceId, principalId, presetId, by,
        )
    }

    fun requireRoom(tx: Transaction, projectId: String) {
        val count = tx.row(
            "SELECT count(*)::int AS n FROM app.project_members WHERE project_id = $1",
            projectId,
        )!!.int("n")
        requireCondition(count < MEMBER_LIMIT, 422, "MEMBER_LIMIT", "В проекте достигнут лимит участников.")
    }

    /** At least one other active person keeps «Управлять доступом». */
    fun requireAnotherAdministrator(tx: Transaction, projectId: String, leaving: String) {
        val others = tx.row(
            """
            SELECT count(*)::int AS n FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND m.principal_id <> $2 AND 'project.access' = ANY(m.permissions)
              AND p.kind = 'human' AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
            leaving,
        )!!.int("n")
        requireCondition(others > 0, 409, "LAST_ADMIN", "Сначала назначьте другого администратора.")
    }

    /**
     * A person leaves the project or can no longer change tasks there: the agent tokens they issued stop, and the
     * requests addressed to them become orphaned for the requester to reassign (docs/adr W1), never silently gone.
     * Row security shows the requests to a member of the project only, so the actor orphans them while one.
     */
    fun stopsChanging(tx: Transaction, actor: Actor, projectId: String, principalId: String) {
        revokeAgentsIssuedBy(tx, projectId, principalId)
        AttentionRequests.orphanRecipient(tx, actor, projectId, principalId)
    }

    /** Agent tokens a person issued in the project stop when that person leaves or can no longer change tasks. */
    fun revokeAgentsIssuedBy(tx: Transaction, projectId: String, principalId: String) {
        tx.update(
            """
            UPDATE auth.credentials SET revoked_at = clock_timestamp()
            WHERE project_id = $1 AND kind = 'agent' AND initiator_id = $2 AND revoked_at IS NULL
            """.trimIndent(),
            projectId,
            principalId,
        )
    }

    /** An access event in the project's audit and outbox, with what changed in `details`. */
    fun recordAccessEvent(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        action: String,
        resourceId: String,
        details: Map<String, Any?>,
    ) {
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO app.audit_events(id, project_id, actor_id, initiator_id, action, resource_id, revision, details)
            VALUES ($1, $2, $3, $4, $5, $6, 1, $7::jsonb)
            """.trimIndent(),
            id, projectId, actor.id, actor.initiatorId, action, resourceId, details,
        )
        tx.update(
            "INSERT INTO app.outbox(id, project_id, topic, payload) VALUES ($1, $2, $3, $4)",
            id,
            projectId,
            action,
            mapOf("id" to id, "projectId" to projectId, "resourceId" to resourceId, "revision" to 1),
        )
    }

    /**
     * Not more than one's own: a member may change only someone who holds nothing they lack (oneself excepted), and
     * may give only what they hold.
     */
    private fun requireNotAbove(
        me: ProjectMembership,
        targetId: String,
        actor: Actor,
        before: Set<Permission>,
        after: Set<Permission>,
    ) {
        requireCondition(
            targetId == actor.id || me.permissions.containsAll(before),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "У этого участника есть права, которых нет у вас: изменить их может администратор проекта.",
        )
        val beyond = (after - before).filterNot { it in me.permissions }
        requireCondition(
            beyond.isEmpty(),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "Нельзя дать право, которого нет у вас: ${beyond.joinToString { "«${it.title}»" }}.",
        )
    }

    private fun target(tx: Transaction, projectId: String, id: String, lock: Boolean = true): Row = requirePresent(
        tx.row(
            """
            SELECT m.revision, m.role, m.permissions, m.granted, m.revoked, m.preset_id AS "presetId", s.name AS "presetName",
                   s.permissions AS "presetPermissions", p.kind, coalesce(p.profile_name, p.name) AS name, w.role AS "workspaceRole",
                   m.changed_at AS "changedAt", coalesce(c.profile_name, c.name) AS "changedByName"
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            JOIN app.access_presets s ON s.id = m.preset_id
            LEFT JOIN app.workspace_members w ON w.workspace_id = m.workspace_id AND w.principal_id = m.principal_id
            LEFT JOIN auth.principals c ON c.id = m.changed_by
            WHERE m.project_id = $1 AND m.principal_id = $2 ${if (lock) "FOR UPDATE OF m" else ""}
            """.trimIndent(),
            projectId,
            id,
        ),
        404,
        "NOT_FOUND",
        "Участник недоступен.",
    )
}
