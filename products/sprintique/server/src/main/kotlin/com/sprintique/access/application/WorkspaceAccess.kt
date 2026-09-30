package com.sprintique.access.application

import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ServiceAccounts
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.util.UUID

/** The caller's membership in a workspace: role, compiled permissions and the workspace's rule for new projects. */
data class WorkspaceMembership(
    val workspaceId: String,
    val role: WorkspaceRole,
    val permissions: Set<Permission>,
    val membersCreateProjects: Boolean,
    val revoked: Set<Permission> = emptySet(),
) {
    /** Members create projects when the workspace allows it, unless that was removed for them personally. */
    fun has(permission: Permission): Boolean = permission in permissions ||
        (
            permission == Permission.PROJECTS_CREATE && role == WorkspaceRole.MEMBER && membersCreateProjects &&
                permission !in revoked
            )

    val isOwner: Boolean get() = role == WorkspaceRole.OWNER
}

/**
 * People of a workspace: roles (Владелец, Администратор, Участник, Гость), personal workspace permissions, ownership
 * transfer and the workspace's access rules. A workspace role never grants project content; the only way from the
 * workspace into a project is an explicit, recorded entry (MemberAccess.joinAsAdmin).
 */
object WorkspaceAccess {
    fun membership(tx: Transaction, actor: Actor, workspaceId: String): WorkspaceMembership? {
        if (!actor.isHuman) return null
        val row = tx.row(
            """
            SELECT m.role, m.permissions, m.revoked, w.projects_created_by = 'members' AS "membersCreate"
            FROM app.workspace_members m JOIN app.workspaces w ON w.id = m.workspace_id
            WHERE m.workspace_id = $1::uuid AND m.principal_id = $2
            """.trimIndent(),
            workspaceId,
            actor.id,
        ) ?: return null
        return WorkspaceMembership(
            workspaceId,
            WorkspaceRole.fromWire(row.string("role"))!!,
            ProjectAccess.permissionsOf(row),
            row.boolean("membersCreate"),
            ProjectAccess.permissionsOf(row, "revoked"),
        )
    }

    fun require(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        permission: Permission? = null,
    ): WorkspaceMembership {
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Пространством управляет человек.")
        val membership = requirePresent(
            membership(tx, actor, workspaceId),
            404,
            "NOT_FOUND",
            "Пространство недоступно.",
        )
        if (permission != null) {
            requireCondition(
                membership.has(permission),
                403,
                "FORBIDDEN",
                ProjectAccess.deniedMessage(permission),
            )
        }
        return membership
    }

    /** Locks the workspace row, revalidates the credential and the permission after the wait. */
    fun lock(tx: Transaction, actor: Actor, workspaceId: String, permission: Permission?): WorkspaceMembership {
        require(tx, actor, workspaceId, permission)
        // NO KEY UPDATE: serializes the workspace's own writers without blocking the foreign-key checks (KEY SHARE) of
        // rows that reference the workspace, such as an acceptance inserting its member row while holding its
        // invitation.
        tx.update("SELECT id FROM app.workspaces WHERE id = $1::uuid FOR NO KEY UPDATE", workspaceId)
        ProjectAccess.requireActiveCredential(tx, actor)
        return require(tx, actor, workspaceId, permission)
    }

    fun members(tx: Transaction, actor: Actor, workspaceId: String): List<Map<String, Any?>> {
        require(tx, actor, workspaceId, Permission.WORKSPACE_PEOPLE)
        return tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, m.role, m.revision, m.granted, m.revoked, m.permissions,
                   m.joined_at AS "joinedAt", coalesce(i.profile_name, i.name) AS "invitedByName",
                   (SELECT count(*)::int FROM app.project_members pm WHERE pm.workspace_id = m.workspace_id
                      AND pm.principal_id = m.principal_id) AS projects,
                   (SELECT string_agg(x.name, ', ' ORDER BY x.name) FROM app.project_members pm
                      JOIN app.projects x ON x.id = pm.project_id
                    WHERE pm.workspace_id = m.workspace_id AND pm.principal_id = m.principal_id) AS "projectNames",
                   (SELECT v.revision FROM app.person_avatars v WHERE v.principal_id = p.id) AS "avatarRevision"
            FROM app.workspace_members m JOIN auth.principals p ON p.id = m.principal_id
            LEFT JOIN auth.principals i ON i.id = m.invited_by
            WHERE m.workspace_id = $1::uuid AND p.kind = 'human'
            ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, name, p.id
            LIMIT 501
            """.trimIndent(),
            workspaceId,
        ).map { LinkedHashMap<String, Any?>(it) }
    }

    data class MemberChange(val baseRevision: Long, val role: WorkspaceRole?, val alsoFromProjects: Boolean)

    @Suppress("LongMethod", "CyclomaticComplexMethod")
    fun change(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        input: MemberChange,
    ): Map<String, Any?> {
        val me = lock(tx, actor, workspaceId, Permission.WORKSPACE_PEOPLE)
        val current = target(tx, workspaceId, id)
        val role = WorkspaceRole.fromWire(current.string("role"))!!
        requireCondition(
            current.long("revision") == input.baseRevision,
            409,
            "CONFLICT",
            "Права участника уже изменены.",
        )
        requireCondition(
            role != WorkspaceRole.OWNER,
            422,
            "OWNER_PROTECTED",
            "Владельца меняет только передача владения.",
        )
        requireCondition(
            input.role != WorkspaceRole.OWNER,
            422,
            "OWNER_PROTECTED",
            "Владельца назначает передача владения.",
        )
        // Only the owner removes or demotes an administrator (someone may step down themselves).
        requireCondition(
            role != WorkspaceRole.ADMIN || input.role == WorkspaceRole.ADMIN || me.isOwner || id == actor.id,
            403,
            "OWNER_REQUIRED",
            "Снять администратора может только владелец пространства.",
        )
        requireNotAbove(me, actor, id, ProjectAccess.permissionsOf(current))
        // Not more than one's own: appointing an administrator gives every workspace permission.
        requireCondition(
            input.role != WorkspaceRole.ADMIN || role == WorkspaceRole.ADMIN ||
                me.permissions.containsAll(Permission.WORKSPACE),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "Назначить администратора может тот, у кого есть все права пространства.",
        )
        if (input.role == null) {
            requireCondition(
                id != actor.id,
                422,
                "SELF_REMOVAL",
                "Удаление своего доступа выполняет другой администратор.",
            )
            removeFromProjects(tx, actor, workspaceId, id, input.alsoFromProjects)
            // The service accounts this person owns here stop until they get a new owner or are deleted.
            ServiceAccounts.suspendOwnedBy(tx, actor, workspaceId, id)
            tx.update(
                "DELETE FROM app.workspace_members WHERE workspace_id = $1::uuid AND principal_id = $2",
                workspaceId,
                id,
            )
        } else {
            if (input.role == WorkspaceRole.GUEST) {
                val admin = tx.row(
                    """
                    SELECT 1 AS found FROM app.project_members WHERE workspace_id = $1::uuid AND principal_id = $2
                      AND 'project.access' = ANY(permissions) LIMIT 1
                    """.trimIndent(),
                    workspaceId,
                    id,
                )
                requireCondition(
                    admin == null,
                    422,
                    "GUEST_RESTRICTED",
                    "Гость не может управлять доступом проекта. Сначала смените его пресет в проектах.",
                )
            }
            tx.update(
                """
                UPDATE app.workspace_members SET role = $3, revision = revision + 1,
                  granted = CASE WHEN $3 = 'guest' THEN '{}' ELSE granted END
                WHERE workspace_id = $1::uuid AND principal_id = $2
                """.trimIndent(),
                workspaceId, id, input.role.wire,
            )
            // A guest owns no service accounts: theirs stop until they get a new owner or are deleted.
            if (input.role == WorkspaceRole.GUEST) ServiceAccounts.suspendOwnedBy(tx, actor, workspaceId, id)
            // Whether someone is a guest changes what their project presets may give.
            tx.update(
                """
                UPDATE app.project_members SET revision = revision + 1 WHERE workspace_id = $1::uuid AND principal_id = $2
                """.trimIndent(),
                workspaceId,
                id,
            )
        }
        audit(
            tx, actor, workspaceId, "workspace.member.updated", id, input.baseRevision + 1,
            mapOf("roleBefore" to role.wire, "roleAfter" to input.role?.wire),
        )
        return linkedMapOf("id" to id, "role" to input.role?.wire, "revision" to input.baseRevision + 1)
    }

    /**
     * Without `also` a person who still works in projects stays: no hidden removal. With it, they leave every project
     * of the workspace, unless they are the last administrator of one.
     */
    private fun removeFromProjects(tx: Transaction, actor: Actor, workspaceId: String, id: String, also: Boolean) {
        val projects = tx.rows(
            """
            SELECT project_id AS id, permissions FROM app.project_members WHERE workspace_id = $1::uuid AND principal_id = $2
            """.trimIndent(),
            workspaceId,
            id,
        )
        if (projects.isEmpty()) return
        requireCondition(also, 409, "PROJECT_ACCESS_REMAINS", "Человек ещё участвует в проектах пространства.")
        for (project in projects) {
            val projectId = project.string("id")
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
            if ("project.access" in
                project.strings("permissions")
            ) {
                MemberAccess.requireAnotherAdministrator(tx, projectId, id)
            }
            MemberAccess.recordAccessEvent(tx, actor, projectId, "member.removed", id, mapOf("fromWorkspace" to true))
            MemberAccess.stopsChanging(tx, actor, projectId, id)
            tx.update("DELETE FROM app.project_members WHERE project_id = $1 AND principal_id = $2", projectId, id)
        }
    }

    data class AccessChange(val baseRevision: Long, val granted: Set<Permission>, val revoked: Set<Permission>)

    /** Personal workspace permissions of a member or an administrator: never beyond the actor's own. */
    fun changeAccess(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        input: AccessChange,
    ): Map<String, Any?> {
        val me = lock(tx, actor, workspaceId, Permission.WORKSPACE_PEOPLE)
        val current = target(tx, workspaceId, id)
        val role = WorkspaceRole.fromWire(current.string("role"))!!
        requireCondition(
            current.long("revision") == input.baseRevision,
            409,
            "CONFLICT",
            "Права участника уже изменены.",
        )
        requireCondition(
            role != WorkspaceRole.OWNER,
            422,
            "OWNER_PROTECTED",
            "У владельца есть все права пространства.",
        )
        requireCondition(
            role != WorkspaceRole.GUEST || input.granted.isEmpty(),
            422,
            "GUEST_RESTRICTED",
            "Гостю права пространства не выдаются.",
        )
        requireCondition(
            input.granted.all { it.scope == com.sprintique.access.domain.PermissionScope.WORKSPACE } &&
                input.revoked.all { it.scope == com.sprintique.access.domain.PermissionScope.WORKSPACE },
            422,
            "PERMISSION_SCOPE",
            "Здесь меняются только права пространства.",
        )
        val before = ProjectAccess.permissionsOf(current)
        requireCondition(
            role != WorkspaceRole.ADMIN || me.isOwner || id == actor.id,
            403,
            "OWNER_REQUIRED",
            "Права администратора пространства меняет только владелец.",
        )
        requireNotAbove(me, actor, id, before)
        val after = Permissions.compileWorkspace(role, input.granted, input.revoked)
        requireCondition(
            me.permissions.containsAll(after - before),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "Нельзя выдать право, которого нет у вас.",
        )
        tx.update(
            """
            UPDATE app.workspace_members SET granted = $3, revoked = $4, revision = revision + 1
            WHERE workspace_id = $1::uuid AND principal_id = $2
            """.trimIndent(),
            workspaceId, id, input.granted.map(Permission::wire), input.revoked.map(Permission::wire),
        )
        audit(
            tx, actor, workspaceId, "workspace.member.permissions.updated", id, input.baseRevision + 1,
            mapOf(
                "added" to (after - before).map(Permission::wire),
                "removed" to (before - after).map(Permission::wire),
            ),
        )
        return linkedMapOf(
            "id" to id, "revision" to input.baseRevision + 1,
            "permissions" to after.map(Permission::wire),
        )
    }

    /**
     * The owner hands the workspace to another person, who is a member and not a guest; the old owner stays an
     * administrator.
     */
    fun transferOwnership(tx: Transaction, actor: Actor, workspaceId: String, toId: String): Map<String, Any?> {
        val me = lock(tx, actor, workspaceId, null)
        requireCondition(me.isOwner, 403, "OWNER_REQUIRED", "Передать владение может только владелец.")
        requireCondition(toId != actor.id, 422, "OWNER_SAME", "Вы уже владелец.")
        val target = target(tx, workspaceId, toId)
        val kind = tx.row("SELECT kind, disabled_at IS NULL AS active FROM auth.principals WHERE id = $1", toId)!!
        requireCondition(
            target.string("role") in setOf("admin", "member") && kind.string("kind") == "human" &&
                kind.boolean("active"),
            422,
            "OWNER_INVALID",
            "Владельцем может стать участник или администратор пространства.",
        )
        tx.update(
            """
            UPDATE app.workspace_members SET role = 'admin', revision = revision + 1 WHERE workspace_id = $1::uuid AND principal_id = $2
            """.trimIndent(),
            workspaceId,
            actor.id,
        )
        tx.update(
            """
            UPDATE app.workspace_members SET role = 'owner', granted = '{}', revoked = '{}', revision = revision + 1
            WHERE workspace_id = $1::uuid AND principal_id = $2
            """.trimIndent(),
            workspaceId,
            toId,
        )
        audit(tx, actor, workspaceId, "workspace.owner.transferred", toId, 1, mapOf("from" to actor.id, "to" to toId))
        return linkedMapOf("ownerId" to toId)
    }

    fun settings(tx: Transaction, actor: Actor, workspaceId: String): Map<String, Any?> {
        val me = require(tx, actor, workspaceId)
        val row = tx.row(
            """
            SELECT w.access_revision AS revision, w.projects_created_by AS "projectsCreatedBy",
                   coalesce(w.default_member_preset_id, (SELECT id FROM app.access_presets WHERE workspace_id = w.id AND key = 'editor'))
                     AS "defaultMemberPresetId",
                   coalesce(w.default_guest_preset_id, (SELECT id FROM app.access_presets WHERE workspace_id = w.id AND key = 'guest'))
                     AS "defaultGuestPresetId",
                   o.principal_id AS "ownerId", coalesce(p.profile_name, p.name) AS "ownerName"
            FROM app.workspaces w LEFT JOIN app.workspace_members o ON o.workspace_id = w.id AND o.role = 'owner'
            LEFT JOIN auth.principals p ON p.id = o.principal_id WHERE w.id = $1::uuid
            """.trimIndent(),
            workspaceId,
        )!!
        return LinkedHashMap<String, Any?>(row).apply {
            put("role", me.role.wire)
            put(
                "permissions",
                Permissions.sorted(
                    me.permissions + listOfNotNull(
                        Permission.PROJECTS_CREATE.takeIf { me.has(it) },
                    ),
                ).map(Permission::wire),
            )
        }
    }

    data class SettingsChange(
        val baseRevision: Long,
        val projectsCreatedBy: String,
        val defaultMemberPresetId: String?,
        val defaultGuestPresetId: String?,
    )

    fun changeSettings(tx: Transaction, actor: Actor, workspaceId: String, input: SettingsChange): Map<String, Any?> {
        lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val revision = tx.row(
            "SELECT access_revision FROM app.workspaces WHERE id = $1::uuid",
            workspaceId,
        )!!.long("access_revision")
        requireCondition(revision == input.baseRevision, 409, "CONFLICT", "Правила пространства уже изменены.")
        input.defaultMemberPresetId?.let { Presets.requireUsable(tx, workspaceId, it) }
        input.defaultGuestPresetId?.let { Presets.requireGuestUsable(tx, workspaceId, it) }
        tx.update(
            """
            UPDATE app.workspaces SET projects_created_by = $2, default_member_preset_id = $3::uuid,
              default_guest_preset_id = $4::uuid, access_revision = access_revision + 1 WHERE id = $1::uuid
            """.trimIndent(),
            workspaceId, input.projectsCreatedBy, input.defaultMemberPresetId, input.defaultGuestPresetId,
        )
        audit(
            tx, actor, workspaceId, "workspace.rules.updated", workspaceId, revision + 1,
            mapOf("projectsCreatedBy" to input.projectsCreatedBy),
        )
        return settings(tx, actor, workspaceId)
    }

    /** Someone who holds a workspace permission the actor lacks is changed by the owner (or by themselves). */
    private fun requireNotAbove(me: WorkspaceMembership, actor: Actor, id: String, theirs: Set<Permission>) {
        requireCondition(
            id == actor.id || me.isOwner || me.permissions.containsAll(theirs),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "У этого человека есть права пространства, которых нет у вас: изменить их может владелец.",
        )
    }

    private fun target(tx: Transaction, workspaceId: String, id: String): Row = requirePresent(
        tx.row(
            """
            SELECT role, revision, permissions FROM app.workspace_members
            WHERE workspace_id = $1::uuid AND principal_id = $2 FOR UPDATE
            """.trimIndent(),
            workspaceId,
            id,
        ),
        404,
        "NOT_FOUND",
        "Участник недоступен.",
    )

    @Suppress("LongParameterList")
    fun audit(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        action: String,
        id: String,
        revision: Long,
        details: Map<String, Any?>? = null,
    ) {
        tx.update(
            """
            INSERT INTO app.workspace_audit(id, workspace_id, actor_id, action, resource_id, revision, details)
            VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)
            """.trimIndent(),
            UUID.randomUUID().toString(), workspaceId, actor.id, action, id, revision, details,
        )
    }
}
