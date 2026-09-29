package com.sprintique.identity.application

import com.sprintique.database.Database
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.OAuthRules
import com.sprintique.identity.domain.Scope
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * The token endpoint and revocation (RFC 6749, 7009, 8707) for the authorization code and refresh token grants.
 *
 * - An access token lives an hour and is bound to the resource the person approved.
 * - A refresh token rotates on every use and lives 30 days from its issue. A rotated token presented again within a
 *   minute, while its successor is still unused, is a lost response: the successor is revoked and a new pair issued.
 *   Any other replay of a rotated or revoked token revokes the whole grant.
 * - A replayed authorization code revokes the grant issued for it.
 *
 * A detected replay revokes in its own committed transaction before the client gets `invalid_grant`.
 */
@Component
@Profile("api")
class OAuthTokens(private val database: Database) {
    /** A token request that failed after changing something that must stay changed (a revocation). */
    private class Refused(val error: OAuthException)

    fun exchangeCode(
        credentials: ClientCredentials,
        code: String?,
        redirectUri: String?,
        verifier: String?,
        resource: String?,
    ): Map<String, Any?> = settle(
        database.transaction { tx ->
            val client = OAuthClients.authenticate(tx, credentials)
            if (code == null || redirectUri == null || verifier == null) {
                throw OAuthException("invalid_request", "code, redirect_uri and code_verifier are required.")
            }
            val row = tx.row(
                """
                SELECT o.client_id AS "clientId", o.principal_id AS "principalId", o.redirect_uri AS "redirectUri",
                       o.code_challenge AS challenge, o.scopes, o.resource, o.grant_id AS "grantId",
                       o.consumed_at IS NOT NULL AS consumed, o.expires_at <= clock_timestamp() AS expired,
                       p.disabled_at IS NOT NULL AS disabled
                FROM auth.oauth_codes o JOIN auth.principals p ON p.id = o.principal_id
                WHERE o.code_hash = $1 FOR UPDATE OF o
                """.trimIndent(),
                Tokens.sha256Hex(code),
            )
            if (row == null || row.string("clientId") != client.id) throw invalidGrant()
            if (row.boolean("consumed")) {
                row.stringOrNull("grantId")?.let { grant ->
                    ConnectedApps.revokeGrant(tx, grant)
                    AccessEvents.record(tx, row.string("principalId"), "app.code-replayed", grant, client.id)
                }
                return@transaction Refused(invalidGrant())
            }
            if (row.boolean("expired") || row.boolean("disabled")) throw invalidGrant()
            if (row.string("redirectUri") != redirectUri || !OAuthRules.verifies(verifier, row.string("challenge"))) {
                throw invalidGrant()
            }
            if (resource != null && resource.removeSuffix("/") != row.string("resource")) throw invalidTarget()
            val grant = UUID.randomUUID().toString()
            tx.update(
                """
                INSERT INTO auth.oauth_grants(id, client_id, principal_id, scopes, resource)
                VALUES ($1::uuid, $2, $3, $4, $5)
                """.trimIndent(),
                grant,
                client.id,
                row.string("principalId"),
                row.strings("scopes"),
                row.string("resource"),
            )
            tx.update(
                "UPDATE auth.oauth_codes SET consumed_at = clock_timestamp(), grant_id = $2::uuid WHERE code_hash = $1",
                Tokens.sha256Hex(code),
                grant,
            )
            AccessEvents.record(tx, row.string("principalId"), "app.connected", grant, client.id)
            issue(
                tx,
                Grant(grant, row.string("principalId"), row.strings("scopes"), row.string("resource")),
                row.strings("scopes"),
                "refresh_token" in client.grantTypes,
            )
        },
    )

    fun refresh(credentials: ClientCredentials, token: String?, scope: String?, resource: String?): Map<String, Any?> =
        settle(
            database.transaction { tx ->
                val client = OAuthClients.authenticate(tx, credentials)
                if (token == null) throw OAuthException("invalid_request", "refresh_token is required.")
                if ("refresh_token" !in client.grantTypes) {
                    throw OAuthException("unauthorized_client", "The client is not registered for refresh tokens.")
                }
                val hash = Tokens.sha256Hex(token)
                val grantId = tx.row("SELECT grant_id AS id FROM auth.oauth_refresh_tokens WHERE token_hash = $1", hash)
                    ?.string("id") ?: throw invalidGrant()
                // The grant row is the lock of its whole chain: one refresh of a grant at a time.
                val grant = tx.row(
                    """
                    SELECT g.id, g.client_id AS "clientId", g.principal_id AS "principalId", g.scopes, g.resource,
                           g.revoked_at IS NOT NULL AS revoked, p.disabled_at IS NOT NULL AS disabled
                    FROM auth.oauth_grants g JOIN auth.principals p ON p.id = g.principal_id
                    WHERE g.id = $1::uuid FOR UPDATE OF g
                    """.trimIndent(),
                    grantId,
                )!!
                if (grant.string("clientId") != client.id || grant.boolean("revoked") || grant.boolean("disabled")) {
                    throw invalidGrant()
                }
                val current = tx.row(
                    """
                    SELECT revoked_at IS NOT NULL AS revoked, expires_at <= clock_timestamp() AS expired,
                           rotated_at IS NOT NULL AS rotated,
                           rotated_at > clock_timestamp() - interval '60 seconds' AS recent, replaced_by AS successor
                    FROM auth.oauth_refresh_tokens WHERE token_hash = $1
                    """.trimIndent(),
                    hash,
                )!!
                if (current.boolean("expired")) throw invalidGrant()
                val replay = current.boolean("revoked") ||
                    (current.boolean("rotated") && !lostResponse(tx, current))
                if (replay) {
                    ConnectedApps.revokeGrant(tx, grantId)
                    AccessEvents.record(tx, grant.string("principalId"), "app.refresh-replayed", grantId, client.id)
                    return@transaction Refused(invalidGrant())
                }
                current.stringOrNull("successor")?.let { successor ->
                    tx.update(
                        "UPDATE auth.oauth_refresh_tokens SET revoked_at = clock_timestamp() WHERE token_hash = $1",
                        successor,
                    )
                }
                val granted = grant.strings("scopes")
                val scopes = scope?.let { requested ->
                    val names = OAuthRules.scopes(requested)?.map(Scope::wire)
                    if (names == null || !granted.containsAll(names)) {
                        throw OAuthException("invalid_scope", "The scope exceeds the grant.")
                    }
                    Scope.entries.map(Scope::wire).filter { it in names }
                } ?: granted
                if (resource != null && resource.removeSuffix("/") != grant.string("resource")) throw invalidTarget()
                tx.update("UPDATE auth.oauth_grants SET last_used_at = clock_timestamp() WHERE id = $1::uuid", grantId)
                tx.update(
                    """
                    DELETE FROM auth.oauth_refresh_tokens
                    WHERE grant_id = $1::uuid AND expires_at < clock_timestamp() - interval '1 day'
                    """.trimIndent(),
                    grantId,
                )
                val issued = issue(
                    tx,
                    Grant(grantId, grant.string("principalId"), granted, grant.string("resource")),
                    scopes,
                    true,
                )
                tx.update(
                    """
                    UPDATE auth.oauth_refresh_tokens
                    SET rotated_at = coalesce(rotated_at, clock_timestamp()), replaced_by = $2
                    WHERE token_hash = $1
                    """.trimIndent(),
                    hash,
                    Tokens.sha256Hex(issued.getValue("refresh_token") as String),
                )
                issued
            },
        )

    /**
     * RFC 7009. A refresh token ends its whole grant; an access token ends itself. A token of another client, an
     * unknown or an already revoked one is answered the same way, so nothing is revealed.
     */
    fun revoke(credentials: ClientCredentials, token: String?) {
        database.transaction { tx ->
            val client = OAuthClients.authenticate(tx, credentials)
            if (token == null) throw OAuthException("invalid_request", "token is required.")
            val hash = Tokens.sha256Hex(token)
            val refresh = tx.row(
                """
                SELECT g.id, g.principal_id AS "principalId" FROM auth.oauth_refresh_tokens r
                JOIN auth.oauth_grants g ON g.id = r.grant_id
                WHERE r.token_hash = $1 AND g.client_id = $2 AND g.revoked_at IS NULL FOR UPDATE OF g
                """.trimIndent(),
                hash,
                client.id,
            )
            if (refresh != null) {
                ConnectedApps.revokeGrant(tx, refresh.string("id"))
                AccessEvents.record(tx, refresh.string("principalId"), "app.revoked", refresh.string("id"), client.id)
                return@transaction
            }
            tx.update(
                """
                UPDATE auth.credentials c SET revoked_at = clock_timestamp() FROM auth.oauth_grants g
                WHERE c.token_hash = $1 AND c.kind = 'oauth' AND c.revoked_at IS NULL AND g.id = c.grant_id
                  AND g.client_id = $2
                """.trimIndent(),
                hash,
                client.id,
            )
        }
    }

    private data class Grant(val id: String, val principalId: String, val scopes: List<String>, val resource: String)

    /** A rotated token within a minute of rotation whose successor was never used: the client lost the answer. */
    private fun lostResponse(tx: Transaction, current: Row): Boolean {
        if (!current.boolean("recent")) return false
        val successor = current.stringOrNull("successor") ?: return false
        return tx.row(
            """
            SELECT 1 AS found FROM auth.oauth_refresh_tokens
            WHERE token_hash = $1 AND rotated_at IS NULL AND revoked_at IS NULL
            """.trimIndent(),
            successor,
        ) != null
    }

    private fun issue(tx: Transaction, grant: Grant, scopes: List<String>, withRefresh: Boolean): Map<String, Any?> {
        val access = Tokens.prefixed(requireNotNull(CredentialKind.OAUTH.prefix))
        tx.update(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, scopes, audience,
                                         grant_id)
            VALUES ($1, $2, $3, 'oauth', $2, clock_timestamp() + make_interval(secs => $4::int), $5, $6, $7::uuid)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            grant.principalId,
            Tokens.sha256Hex(access),
            ACCESS_SECONDS,
            scopes,
            grant.resource,
            grant.id,
        )
        val result = linkedMapOf<String, Any?>(
            "access_token" to access,
            "token_type" to "Bearer",
            "expires_in" to ACCESS_SECONDS,
            "scope" to scopes.joinToString(" "),
        )
        if (withRefresh) {
            val refresh = Tokens.prefixed("spf_")
            tx.update(
                """
                INSERT INTO auth.oauth_refresh_tokens(token_hash, grant_id, expires_at)
                VALUES ($1, $2::uuid, clock_timestamp() + make_interval(days => $3::int))
                """.trimIndent(),
                Tokens.sha256Hex(refresh),
                grant.id,
                REFRESH_DAYS,
            )
            result["refresh_token"] = refresh
        }
        return result
    }

    @Suppress("UNCHECKED_CAST")
    private fun settle(outcome: Any): Map<String, Any?> {
        if (outcome is Refused) throw outcome.error
        return outcome as Map<String, Any?>
    }

    private fun invalidGrant() = OAuthException("invalid_grant", "The grant is invalid, expired or revoked.")

    private fun invalidTarget() = OAuthException("invalid_target", "The resource does not match the grant.")

    companion object {
        const val ACCESS_SECONDS = 3600
        const val REFRESH_DAYS = 30
    }
}
