package com.sprintique.identity.application

import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition

/**
 * The apps a person connected by OAuth: one entry per approval, with the client's own name, the scopes and when it
 * was last used. Revoking an app ends its access and refresh tokens at once.
 */
object ConnectedApps {
    const val LIMIT = 50
    private val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

    fun list(tx: Transaction, actor: Actor): List<Map<String, Any?>> {
        ProjectAccess.requireInteractive(actor)
        return tx.rows(
            """
            SELECT g.id, c.name, g.client_id AS "clientId", c.redirect_uris[1] AS "redirectUri", g.scopes, g.resource,
                   g.created_at AS "createdAt",
                   greatest(g.last_used_at, (SELECT max(t.last_used_at) FROM auth.credentials t WHERE t.grant_id = g.id))
                     AS "lastUsedAt"
            FROM auth.oauth_grants g JOIN auth.oauth_clients c ON c.id = g.client_id
            WHERE g.principal_id = $1 AND g.revoked_at IS NULL ORDER BY g.created_at DESC, g.id LIMIT $2
            """.trimIndent(),
            actor.id,
            LIMIT,
        ).map { row ->
            linkedMapOf(
                "id" to row["id"],
                "name" to row["name"],
                "clientId" to row["clientId"],
                "redirectHost" to runCatching { java.net.URI(row.string("redirectUri")).authority }.getOrNull(),
                "scopes" to row.strings("scopes"),
                "resource" to row["resource"],
                "createdAt" to row["createdAt"],
                "lastUsedAt" to row["lastUsedAt"],
            )
        }
    }

    fun revoke(tx: Transaction, actor: Actor, id: String): Map<String, Boolean> {
        ProjectAccess.requireInteractive(actor)
        requireCondition(UUID.matches(id), 404, "NOT_FOUND", "Приложение не подключено.")
        val grant = tx.row(
            """
            SELECT client_id AS "clientId" FROM auth.oauth_grants
            WHERE id = $1::uuid AND principal_id = $2 AND revoked_at IS NULL FOR UPDATE
            """.trimIndent(),
            id,
            actor.id,
        )
        requireCondition(grant != null, 404, "NOT_FOUND", "Приложение не подключено.")
        revokeGrant(tx, id)
        AccessEvents.record(tx, actor.id, "app.revoked", id, grant.string("clientId"))
        return mapOf("revoked" to true)
    }

    /** Ends a grant with every token issued under it, in the caller's transaction. */
    fun revokeGrant(tx: Transaction, grantId: String) {
        tx.update(
            "UPDATE auth.oauth_grants SET revoked_at = clock_timestamp() WHERE id = $1::uuid AND revoked_at IS NULL",
            grantId,
        )
        tx.update(
            """
            UPDATE auth.credentials SET revoked_at = clock_timestamp()
            WHERE grant_id = $1::uuid AND kind = 'oauth' AND revoked_at IS NULL
            """.trimIndent(),
            grantId,
        )
        tx.update(
            """
            UPDATE auth.oauth_refresh_tokens SET revoked_at = clock_timestamp()
            WHERE grant_id = $1::uuid AND revoked_at IS NULL
            """.trimIndent(),
            grantId,
        )
    }
}
