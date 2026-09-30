package com.sprintique.identity.application

import com.sprintique.access.domain.Permission
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent

/**
 * The caller's membership in a project, after every check passed: its workspace, the role derived from its
 * permissions (for code and pages that still speak in roles) and the compiled permissions themselves.
 */
data class ProjectMembership(val workspaceId: String, val role: String, val permissions: Set<Permission>) {
    fun has(permission: Permission): Boolean = permission in permissions
}

/**
 * Project access for people and agents: every action needs one permission on the caller's membership row (compiled
 * by the database from its preset and personal changes). The database enforces the same boundary with row security;
 * these checks give the precise error and cover the rules row security cannot express (an agent's capabilities and
 * the current rights of the person who issued it).
 */
object ProjectAccess {
    fun authorize(tx: Transaction, actor: Actor, projectId: String, capability: Capability): ProjectMembership {
        val membership = requirePresent(membership(tx, actor, projectId), 404, "NOT_FOUND", "Проект недоступен.")
        val permission = capability.permission
        if (!actor.isHuman) {
            requireCondition(
                actor.projectId == projectId && capability in actor.capabilities &&
                    permission.service != Permission.ServiceUse.NEVER,
                403,
                "FORBIDDEN",
                "Действие не входит в разрешения агента.",
            )
            val grantor = tx.row(
                """
                SELECT m.permissions FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
                WHERE m.project_id = $1 AND m.principal_id = $2 AND p.disabled_at IS NULL
                """.trimIndent(),
                projectId,
                actor.initiatorId,
            )
            requireCondition(
                grantor != null && permission.wire in grantor.strings("permissions"),
                403,
                "GRANT_REVOKED",
                "Полномочия инициатора изменились.",
            )
        }
        requireCondition(permission in membership.permissions, 403, "FORBIDDEN", deniedMessage(permission))
        return membership
    }

    /** The caller's membership without requiring anything beyond it; null when the caller is not a member. */
    fun membership(tx: Transaction, actor: Actor, projectId: String): ProjectMembership? = tx.row(
        """
        SELECT p.workspace_id AS "workspaceId", m.role, m.permissions FROM app.projects p
        JOIN app.project_members m ON m.project_id = p.id AND m.principal_id = $2 WHERE p.id = $1
        """.trimIndent(),
        projectId,
        actor.id,
    )?.let(::membershipOf)

    fun deniedMessage(permission: Permission): String = when (permission) {
        Permission.TASKS_WRITE, Permission.THREADS_WRITE, Permission.MAPS_WRITE -> "Недостаточно прав."
        else -> "Нужно право «${permission.title}»."
    }

    /**
     * The shared mutation fence: authorize, lock the project row, then revalidate the live credential and the exact
     * capability, so a revocation committed while the request waited cannot be outrun. Project before resource.
     */
    fun projectWriteFence(tx: Transaction, actor: Actor, projectId: String, capability: Capability): ProjectMembership {
        authorize(tx, actor, projectId, capability)
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        requireActiveCredential(tx, actor)
        return authorize(tx, actor, projectId, capability)
    }

    fun requireActiveCredential(tx: Transaction, actor: Actor) {
        val found = tx.row(
            """
            SELECT 1 AS found FROM auth.credentials c JOIN auth.principals p ON p.id = c.principal_id
            WHERE c.id = $1 AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp() AND p.disabled_at IS NULL
            """.trimIndent(),
            actor.credentialId,
        )
        requireCondition(found != null, 401, "UNAUTHENTICATED", "Сессия завершена.")
    }

    fun permissionsOf(row: Row, column: String = "permissions"): Set<Permission> =
        row.strings(column).mapNotNullTo(linkedSetOf(), Permission::fromWire)

    private fun membershipOf(row: Row) =
        ProjectMembership(row.string("workspaceId"), row.string("role"), permissionsOf(row))
}
