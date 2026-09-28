package com.sprintique.identity.application

import com.sprintique.database.Transaction
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.util.UUID

/** A new browser session: the cookie token and nothing else leaves the server. */
data class OpenedSession(val principalId: String, val token: String)

/**
 * Turns a verified way in into a person and a session. One person, several ways in: a known identity leads to its
 * principal; a new identity with a verified e-mail joins the one person who holds that address; otherwise a new
 * person is created. Concurrent first sign-ins with one address or one identity are serialized, so they cannot
 * create two people or collide on the identity key.
 */
@Component
@Profile("api")
class Accounts {
    fun signIn(tx: Transaction, identity: ExternalIdentity): OpenedSession {
        // First sign-ins with one address, or with one identity, run one after another.
        val key = identity.verifiedEmail?.let { "sign-in:$it" } ?: "sign-in:${identity.issuer}|${identity.subject}"
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", key)
        val principal = known(tx, identity) ?: joined(tx, identity) ?: created(tx, identity)
        val disabled = tx.row("SELECT disabled_at FROM auth.principals WHERE id = $1", principal)!!["disabled_at"]
        requireCondition(disabled == null, 403, "ACCOUNT_DISABLED", "Аккаунт отключён.")
        return open(tx, principal)
    }

    /** An eight-hour session with its own CSRF token. */
    fun open(tx: Transaction, principalId: String): OpenedSession {
        val token = Tokens.random()
        tx.update(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
            VALUES ($1, $2, $3, 'session', $4, $2, clock_timestamp() + interval '8 hours')
            """.trimIndent(),
            UUID.randomUUID().toString(), principalId, Tokens.sha256Hex(token), Tokens.random(),
        )
        return OpenedSession(principalId, token)
    }

    private fun known(tx: Transaction, identity: ExternalIdentity): String? {
        val principal = tx.row(
            """
            UPDATE auth.identities SET last_used_at = clock_timestamp(), email = coalesce($3, email)
            WHERE issuer = $1 AND subject = $2 RETURNING principal_id
            """.trimIndent(),
            identity.issuer, identity.subject, identity.verifiedEmail,
        )?.string("principal_id") ?: return null
        // A person known before without an address gets the first one a provider vouches for, if nobody holds it.
        identity.verifiedEmail?.let { email ->
            tx.update(
                """
                UPDATE auth.principals SET email = $2 WHERE id = $1 AND email IS NULL
                  AND NOT EXISTS (SELECT 1 FROM auth.principals WHERE kind = 'human' AND lower(email) = $2)
                """.trimIndent(),
                principal, email,
            )
        }
        return principal
    }

    private fun joined(tx: Transaction, identity: ExternalIdentity): String? {
        val email = identity.verifiedEmail ?: return null
        val holders = tx.rows(
            "SELECT id FROM auth.principals WHERE kind = 'human' AND lower(email) = $1 LIMIT 2",
            email,
        )
        // Two people with one address is ambiguous: never guess which one to join.
        val principal = holders.singleOrNull()?.string("id") ?: return null
        link(tx, identity, principal)
        return principal
    }

    private fun created(tx: Transaction, identity: ExternalIdentity): String {
        val principal = UUID.randomUUID().toString()
        val email = identity.verifiedEmail?.takeIf {
            tx.row("SELECT 1 FROM auth.principals WHERE kind = 'human' AND lower(email) = $1", it) == null
        }
        tx.update(
            "INSERT INTO auth.principals(id, kind, name, email) VALUES ($1, 'human', $2, $3)",
            principal, identity.name.take(NAME_LIMIT).ifBlank { FALLBACK_NAME }, email,
        )
        link(tx, identity, principal)
        return principal
    }

    private fun link(tx: Transaction, identity: ExternalIdentity, principal: String) {
        tx.update(
            "INSERT INTO auth.identities(issuer, subject, principal_id, email) VALUES ($1, $2, $3, $4)",
            identity.issuer, identity.subject, principal, identity.verifiedEmail,
        )
    }

    private companion object {
        const val NAME_LIMIT = 100
        const val FALLBACK_NAME = "Участник"
    }
}
