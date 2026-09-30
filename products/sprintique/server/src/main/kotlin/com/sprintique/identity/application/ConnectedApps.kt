package com.sprintique.identity.application

import com.sprintique.database.Transaction

/**
 * The apps connected to a service account by OAuth: one entry per app, with the client's own name, the scopes, who
 * approved it and when it was last used. Connecting the same app again replaces its earlier grant; a grant whose
 * tokens have all expired is no longer a connection. Revoking an app ends its access and refresh tokens at once.
 */
object ConnectedApps {
    /** Connected apps per person who approves them, across their service accounts. */
    const val LIMIT = 50

    /** SQL condition on a grant `g`: not revoked and still holding a live refresh or access token. */
    const val LIVE = """g.revoked_at IS NULL AND (
          EXISTS (SELECT 1 FROM auth.oauth_refresh_tokens r WHERE r.grant_id = g.id AND r.revoked_at IS NULL
                    AND r.rotated_at IS NULL AND r.superseded_at IS NULL AND r.expires_at > clock_timestamp())
          OR EXISTS (SELECT 1 FROM auth.credentials t WHERE t.grant_id = g.id AND t.revoked_at IS NULL
                       AND t.expires_at > clock_timestamp()))"""

    fun of(tx: Transaction, accountId: String): List<Map<String, Any?>> = tx.rows(
        """
        SELECT g.id, c.name, g.client_id AS "clientId", c.redirect_uris[1] AS "redirectUri", g.scopes,
               g.created_at AS "createdAt", coalesce(b.profile_name, b.name) AS "grantedBy",
               greatest(g.last_used_at, (SELECT max(t.last_used_at) FROM auth.credentials t WHERE t.grant_id = g.id))
                 AS "lastUsedAt"
        FROM auth.oauth_grants g JOIN auth.oauth_clients c ON c.id = g.client_id
        JOIN auth.principals b ON b.id = g.granted_by
        WHERE g.principal_id = $1 AND $LIVE ORDER BY g.created_at DESC, g.id LIMIT $2
        """.trimIndent(),
        accountId,
        LIMIT,
    ).map { row ->
        linkedMapOf(
            "id" to row["id"],
            "name" to row["name"],
            "clientId" to row["clientId"],
            "redirectHost" to runCatching { java.net.URI(row.string("redirectUri")).authority }.getOrNull(),
            "scopes" to row.strings("scopes"),
            "grantedBy" to row["grantedBy"],
            "createdAt" to row["createdAt"],
            "lastUsedAt" to row["lastUsedAt"],
        )
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
