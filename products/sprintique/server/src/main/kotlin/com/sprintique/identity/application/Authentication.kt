package com.sprintique.identity.application

import com.sprintique.database.Database
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.identity.domain.Credential
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** What the transport knows about a request: whether it changes state and which origin and CSRF token it carries. */
data class RequestIntent(val isMutation: Boolean, val origin: String?, val csrfToken: String?)

/**
 * Runs an operation in one transaction with the caller resolved from a live credential and the row-security context
 * set: `app.actor_id`, and `app.project_limit` for an agent. A person's mutation also needs the same-origin header
 * and the CSRF token of the session.
 */
@Component
@Profile("api")
class Authentication(
    private val database: Database,
    private val properties: com.sprintique.configuration.SprintiqueProperties,
) {
    fun <T> run(
        credential: Credential,
        intent: RequestIntent,
        block: (Transaction, Actor) -> T,
    ): T = database.transaction { tx ->
        val row = tx.row(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.kind, c.id AS "credentialId", c.csrf,
                   c.project_id AS "projectId", c.capabilities, c.initiator_id AS "initiatorId"
            FROM auth.credentials c JOIN auth.principals p ON p.id = c.principal_id
            WHERE c.token_hash = $1 AND c.kind = $2 AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp()
              AND p.disabled_at IS NULL
            """.trimIndent(),
            Tokens.sha256Hex(credential.token),
            credential.kind.wire,
        )
        val actor = actorOf(requirePresent(row, 401, "UNAUTHENTICATED", "Войдите в аккаунт."))
        // The initiator lets task activity tell a person's own agent from a colleague (docs/adr W3).
        tx.row(
            """
            SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', $2, true),
                   set_config('app.initiator_id', $3, true)
            """.trimIndent(),
            actor.id,
            actor.projectId.orEmpty(),
            actor.initiatorId,
        )
        if (intent.isMutation && actor.isHuman) {
            requireCondition(
                intent.origin == properties.publicOrigin && intent.csrfToken != null && intent.csrfToken == actor.csrf,
                403,
                "CSRF",
                "Обновите страницу перед изменением данных.",
            )
        }
        block(tx, actor)
    }

    private fun actorOf(row: Row) = Actor(
        id = row.string("id"),
        name = row.string("name"),
        kind = if (row.string("kind") == "agent") PrincipalKind.AGENT else PrincipalKind.HUMAN,
        credentialId = row.string("credentialId"),
        csrf = row.stringOrNull("csrf"),
        projectId = row.stringOrNull("projectId"),
        capabilities = row.strings("capabilities").mapNotNull(Capability::fromWire).toSet(),
        initiatorId = row.string("initiatorId"),
    )
}
