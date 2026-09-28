package com.sprintique.identity.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent

/** The caller's membership in a project, after every check passed. */
data class ProjectMembership(val workspaceId: String, val role: String)

/**
 * Project access for people and agents. The database enforces the same boundary with row security; these checks
 * give the precise error and cover the rules row security cannot express (grantor rights, capabilities).
 */
object ProjectAccess {
    private val WRITERS = setOf("editor", "admin")

    /** Capabilities only a person who administers the project holds; agents are never granted them. */
    private val ADMINISTRATION = setOf(Capability.AGENTS_MANAGE, Capability.CATALOG_WRITE, Capability.FINANCE_WRITE)

    fun authorize(tx: Transaction, actor: Actor, projectId: String, capability: Capability): ProjectMembership {
        val row = tx.row(
            """
            SELECT p.workspace_id AS "workspaceId", m.role FROM app.projects p
            JOIN app.project_members m ON m.project_id = p.id AND m.principal_id = $2 WHERE p.id = $1
            """.trimIndent(),
            projectId,
            actor.id,
        )
        val membership = requirePresent(row, 404, "NOT_FOUND", "Проект недоступен.").let(::membershipOf)
        if (!actor.isHuman) {
            requireCondition(
                actor.projectId == projectId && capability in actor.capabilities,
                403,
                "FORBIDDEN",
                "Действие не входит в разрешения агента.",
            )
            val grantor = tx.row(
                """
                SELECT m.role FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
                WHERE m.project_id = $1 AND m.principal_id = $2 AND p.disabled_at IS NULL
                """.trimIndent(),
                projectId,
                actor.initiatorId,
            )
            requireCondition(
                grantor != null && (!capability.isWrite || grantor.string("role") in WRITERS),
                403,
                "GRANT_REVOKED",
                "Полномочия инициатора изменились.",
            )
        }
        requireCondition(!capability.isWrite || membership.role in WRITERS, 403, "FORBIDDEN", "Недостаточно прав.")
        if (capability in ADMINISTRATION) {
            requireCondition(
                actor.isHuman && membership.role == "admin",
                403,
                "FORBIDDEN",
                "Нужны права администратора проекта.",
            )
        }
        return membership
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

    private fun membershipOf(row: Row) = ProjectMembership(row.string("workspaceId"), row.string("role"))
}
