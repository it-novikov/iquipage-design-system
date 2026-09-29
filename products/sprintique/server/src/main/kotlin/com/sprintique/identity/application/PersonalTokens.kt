package com.sprintique.identity.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.UUID

/** The account-level history of access: tokens made and revoked, apps connected and revoked, replays detected. */
object AccessEvents {
    fun record(tx: Transaction, principalId: String, action: String, subjectId: String, clientId: String? = null) {
        tx.update(
            """
            INSERT INTO auth.access_events(id, principal_id, action, subject_id, client_id)
            VALUES ($1, $2, $3, $4, $5)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            principalId,
            action,
            subjectId,
            clientId,
        )
    }
}

/**
 * Personal access tokens: a person's own credential for scripts, made in settings with a name, scopes and an expiry.
 * The token is shown once; only its hash is stored. It acts with the person's rights, narrowed by its scopes, on the
 * whole API (REST and MCP), and only the person at the interface can make, list or revoke one.
 */
@Component
@Profile("api")
class PersonalTokens(private val properties: SprintiqueProperties) {
    data class NewToken(val name: String, val scopes: Set<Scope>, val expiresInDays: Int)

    fun list(tx: Transaction, actor: Actor): List<Map<String, Any?>> {
        ProjectAccess.requireInteractive(actor)
        return tx.rows(
            """
            SELECT id, name, scopes, created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt"
            FROM auth.credentials
            WHERE principal_id = $1 AND kind = 'personal' AND revoked_at IS NULL AND expires_at > clock_timestamp()
            ORDER BY created_at DESC, id LIMIT $2
            """.trimIndent(),
            actor.id,
            LIMIT,
        ).map(::present)
    }

    fun create(tx: Transaction, actor: Actor, input: NewToken): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        // Concurrent creations by one person are counted one after another.
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "personal-tokens:${actor.id}")
        val active = tx.row(
            """
            SELECT count(*)::int AS n FROM auth.credentials
            WHERE principal_id = $1 AND kind = 'personal' AND revoked_at IS NULL AND expires_at > clock_timestamp()
            """.trimIndent(),
            actor.id,
        )!!.int("n")
        requireCondition(active < LIMIT, 422, "TOKEN_LIMIT", "Можно держать не больше $LIMIT токенов. Отзовите лишние.")
        val id = UUID.randomUUID().toString()
        val token = Tokens.prefixed(requireNotNull(CredentialKind.PERSONAL.prefix))
        val scopes = (input.scopes + Scope.READ).map(Scope::wire).sorted()
        val row = tx.row(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, name, scopes, audience)
            VALUES ($1, $2, $3, 'personal', $2, clock_timestamp() + make_interval(days => $4::int), $5, $6, $7)
            RETURNING id, name, scopes, created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt"
            """.trimIndent(),
            id,
            actor.id,
            Tokens.sha256Hex(token),
            input.expiresInDays,
            input.name,
            scopes,
            properties.apiBase,
        )!!
        AccessEvents.record(tx, actor.id, "token.created", id)
        return present(row) + ("token" to token)
    }

    fun revoke(tx: Transaction, actor: Actor, id: String): Map<String, Boolean> {
        ProjectAccess.requireInteractive(actor)
        val revoked = tx.row(
            """
            UPDATE auth.credentials SET revoked_at = clock_timestamp()
            WHERE id = $1 AND principal_id = $2 AND kind = 'personal' AND revoked_at IS NULL RETURNING id
            """.trimIndent(),
            id,
            actor.id,
        )
        requireCondition(revoked != null, 404, "NOT_FOUND", "Токен недоступен.")
        AccessEvents.record(tx, actor.id, "token.revoked", id)
        return mapOf("revoked" to true)
    }

    private fun present(row: Row): Map<String, Any?> = linkedMapOf(
        "id" to row["id"],
        "name" to row["name"],
        "scopes" to row.strings("scopes"),
        "createdAt" to row["createdAt"],
        "expiresAt" to row["expiresAt"],
        "lastUsedAt" to row["lastUsedAt"],
    )

    companion object {
        const val LIMIT = 20
        const val MAX_DAYS = 365
    }
}
