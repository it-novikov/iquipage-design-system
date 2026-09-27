package com.sprintique.identity.application

import com.sprintique.command.AuditTrail
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import com.sprintique.workspace.application.Membership
import java.time.Instant
import java.util.UUID

/**
 * Agents are principals of one project with a limited set of capabilities and an expiry, issued by an administrator
 * whose own rights they never exceed. The token is shown once and is never stored or journaled.
 */
object AgentGrants {
    private const val MEMBER_LIMIT = 500

    data class Grant(val name: String, val capabilities: List<Capability>, val expiresInSeconds: Long)

    fun issue(tx: Transaction, actor: Actor, projectId: String, grant: Grant): Map<String, Any> {
        Membership.manageProject(tx, actor, projectId)
        val members = tx.row("SELECT count(*)::int AS n FROM app.project_members WHERE project_id = $1", projectId)
        val count = members!!.int("n")
        requireCondition(count < MEMBER_LIMIT, 422, "MEMBER_LIMIT", "В проекте достигнут лимит участников.")
        val id = UUID.randomUUID().toString()
        val credentialId = UUID.randomUUID().toString()
        val token = "spr_" + Tokens.random()
        tx.update("INSERT INTO auth.principals(id, name, kind) VALUES ($1, $2, 'agent')", id, grant.name)
        tx.update(
            "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'editor')",
            projectId, id,
        )
        val expiresAt = Instant.now().plusSeconds(grant.expiresInSeconds)
        val wire = grant.capabilities.map(Capability::wire)
        tx.update(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, project_id, capabilities, initiator_id, expires_at)
            VALUES ($1, $2, $3, 'agent', $4, $5, $6, $7)
            """.trimIndent(),
            credentialId, id, Tokens.sha256Hex(token), projectId, wire, actor.id, expiresAt,
        )
        AuditTrail.record(tx, actor, projectId, "agent.granted", id, 1)
        return linkedMapOf(
            "id" to id, "credentialId" to credentialId, "token" to token, "expiresAt" to expiresAt,
            "capabilities" to wire,
        )
    }

    fun list(tx: Transaction, actor: Actor, projectId: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
        return tx.rows(
            """
            SELECT c.id, p.name, c.principal_id AS "agentId", c.capabilities, c.initiator_id AS "initiatorId",
                   c.expires_at AS "expiresAt", c.revoked_at AS "revokedAt"
            FROM auth.credentials c JOIN auth.principals p ON p.id = c.principal_id
            WHERE c.project_id = $1 AND c.kind = 'agent' ORDER BY c.expires_at DESC LIMIT 100
            """.trimIndent(),
            projectId,
        )
    }

    fun revoke(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Any> {
        Membership.manageProject(tx, actor, projectId)
        val revoked = tx.row(
            """
            UPDATE auth.credentials SET revoked_at = clock_timestamp()
            WHERE project_id = $1 AND id = $2 AND kind = 'agent' RETURNING principal_id
            """.trimIndent(),
            projectId, id,
        )
        requireCondition(revoked != null, 404, "NOT_FOUND", "Разрешение недоступно.")
        AuditTrail.record(tx, actor, projectId, "agent.revoked", id, 1)
        return mapOf("revoked" to true)
    }
}
