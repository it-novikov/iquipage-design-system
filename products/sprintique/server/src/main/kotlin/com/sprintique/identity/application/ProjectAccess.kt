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
 * Project access for people, agents and service accounts. The database enforces the same boundary with row
 * security; these checks give the precise error and cover the rules row security cannot express (grantor and owner
 * rights, capabilities).
 */
object ProjectAccess {
    private val WRITERS = setOf("editor", "admin")

    private val FINANCE = setOf(Capability.FINANCE_READ, Capability.FINANCE_WRITE)
    private const val FINANCE_READ = "finance.read"
    private const val FINANCE_WRITE = "finance.write"

    /**
     * Capabilities only a person who administers the project holds; agents are never granted them. The one exception
     * is finance for a service account whose owner administers the project and granted it explicitly.
     */
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
        if (actor.isAgent) {
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
        // A service account's finance comes from its explicit grant, not from its role (see requireOwnerRights).
        val financeOfService = actor.isService && capability in FINANCE
        requireCondition(
            !capability.isWrite || financeOfService || membership.role in WRITERS,
            403,
            "FORBIDDEN",
            "Недостаточно прав.",
        )
        if (actor.isService) requireOwnerRights(tx, actor, projectId, capability)
        requireCondition(
            !capability.isWrite || actor.mayChange,
            403,
            "INSUFFICIENT_SCOPE",
            "Токену разрешено только чтение.",
        )
        if (capability in ADMINISTRATION && !financeOfService) {
            requireCondition(
                actor.isHuman && membership.role == "admin",
                403,
                "FORBIDDEN",
                "Нужны права администратора проекта.",
            )
        }
        // Access itself (agents, members, invitations, jobs) is managed only by the person at the interface: a
        // delegated token must never mint a credential that outlives it or let someone else in.
        if (capability == Capability.AGENTS_MANAGE) requireInteractive(actor)
        return membership
    }

    /**
     * A service account works on tasks, discussions and maps within its role, on finance only as granted explicitly,
     * never on catalogs or access, and never above its owner: the owner must be a member of the project now, a writer
     * there for a change, and its administrator for a change of finance (as for people). Row security holds the same
     * ceiling (auth.can_project, auth.can_read_finance, auth.can_manage_finance).
     */
    private fun requireOwnerRights(tx: Transaction, actor: Actor, projectId: String, capability: Capability) {
        requireCondition(
            capability in Capability.GRANTABLE || capability in FINANCE,
            403,
            "SERVICE_ACCOUNT_FORBIDDEN",
            "Сервисному аккаунту это действие недоступно.",
        )
        val row = tx.row(
            """
            SELECT m.role,
                   (SELECT g.granted FROM auth.service_account_grants g
                    WHERE g.project_id = $1 AND g.principal_id = $3) AS granted
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND m.principal_id = $2 AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
            actor.initiatorId,
            actor.id,
        )
        if (capability in FINANCE) {
            val granted = row?.strings("granted").orEmpty()
            val needed = if (capability == Capability.FINANCE_WRITE) {
                setOf(FINANCE_WRITE)
            } else {
                setOf(FINANCE_READ, FINANCE_WRITE)
            }
            requireCondition(
                granted.any { it in needed },
                403,
                "SERVICE_ACCOUNT_FORBIDDEN",
                "Сервисному аккаунту не выдан доступ к финансам этого проекта.",
            )
        }
        val ownerRole = row?.string("role")
        requireCondition(
            ownerRole != null &&
                (!capability.isWrite || ownerRole in WRITERS) &&
                (capability != Capability.FINANCE_WRITE || ownerRole == "admin"),
            403,
            "OWNER_RIGHTS",
            "Права владельца сервисного аккаунта не позволяют это действие.",
        )
    }

    /**
     * Security decisions — who has access, approvals of agents' proposals, tokens and connected apps — need the
     * person's own session. A delegated token acts as the person for their work, not for these.
     */
    fun requireInteractive(actor: Actor) {
        requireCondition(
            actor.isInteractive,
            403,
            "SESSION_REQUIRED",
            "Это действие доступно только в интерфейсе Sprintique.",
        )
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
            LEFT JOIN auth.oauth_grants g ON g.id = c.grant_id
            LEFT JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE c.id = $1 AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp() AND p.disabled_at IS NULL
              AND (c.grant_id IS NULL OR g.revoked_at IS NULL)
              AND (p.kind <> 'service' OR (auth.service_account_active(p.id) AND c.initiator_id = s.owner_id))
            """.trimIndent(),
            actor.credentialId,
        )
        requireCondition(found != null, 401, "UNAUTHENTICATED", "Сессия завершена.")
    }

    private fun membershipOf(row: Row) = ProjectMembership(row.string("workspaceId"), row.string("role"))
}
