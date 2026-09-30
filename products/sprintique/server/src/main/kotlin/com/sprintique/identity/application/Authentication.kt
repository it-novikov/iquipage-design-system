package com.sprintique.identity.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.identity.domain.Credential
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.identity.domain.ProtectedResource
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestAttributes
import org.springframework.web.context.request.RequestContextHolder

/**
 * What the transport knows about a request: whether it changes state, which origin and CSRF token it carries and
 * which resource it is addressed to.
 */
data class RequestIntent(
    val isMutation: Boolean,
    val origin: String?,
    val csrfToken: String?,
    val resource: ProtectedResource = ProtectedResource.API,
)

/**
 * Runs an operation in one transaction with the caller resolved from a live credential and the row-security context
 * set: `app.actor_id`, and `app.project_limit` for an agent. A person's mutation with a session also needs the
 * same-origin header and the CSRF token of the session. A service account's token (service or OAuth) authenticates
 * only a live service account (its owner still an enabled member of its workspace) and only while the person who
 * issued it is still its owner (a new owner starts afresh), must be issued for the requested
 * resource and carry the `write` scope to change anything; it carries no ambient authority, so CSRF does not apply.
 */
@Component
@Profile("api")
class Authentication(
    private val database: Database,
    private val properties: SprintiqueProperties,
    private val limits: CredentialLimits,
) {
    fun <T> run(
        credential: Credential,
        intent: RequestIntent,
        block: (Transaction, Actor) -> T,
    ): T = database.transaction { tx ->
        val row = tx.row(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.kind, c.id AS "credentialId", c.csrf,
                   c.project_id AS "projectId", c.capabilities, coalesce(s.owner_id, c.initiator_id) AS "initiatorId",
                   c.scopes, c.audience,
                   g.client_id AS "clientId", coalesce(c.grant_id::text, c.id) AS "limitKey",
                   (c.last_used_at IS NULL OR c.last_used_at < clock_timestamp() - interval '5 minutes') AS stale
            FROM auth.credentials c JOIN auth.principals p ON p.id = c.principal_id
            LEFT JOIN auth.oauth_grants g ON g.id = c.grant_id
            LEFT JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE c.token_hash = $1 AND c.kind = $2 AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp()
              AND p.disabled_at IS NULL AND (c.grant_id IS NULL OR g.revoked_at IS NULL)
              AND (c.kind NOT IN ('service', 'oauth') OR (p.kind = 'service' AND auth.service_account_active(p.id)
                AND c.initiator_id = s.owner_id))
            """.trimIndent(),
            Tokens.sha256Hex(credential.token),
            credential.kind.wire,
        )
        val found = requirePresent(row, 401, "UNAUTHENTICATED", "Войдите в аккаунт.")
        val actor = actorOf(found, credential.kind)
        if (credential.kind != CredentialKind.SESSION) {
            // The request carried a live credential: its address owes nothing for it (RequestLimitFilter).
            RequestContextHolder.getRequestAttributes()
                ?.setAttribute(CredentialLimits.ADMITTED, true, RequestAttributes.SCOPE_REQUEST)
            requireCondition(
                limits.admit(found.string("limitKey")),
                429,
                "REQUEST_LIMIT",
                "Слишком много запросов с этим токеном. Повторите через минуту.",
            )
        }
        if (actor.isDelegated) {
            requireCondition(
                found.string("audience") in audiences(intent.resource),
                401,
                "UNAUTHENTICATED",
                "Токен выдан для другого ресурса.",
            )
            requireCondition(
                !intent.isMutation || actor.mayChange,
                403,
                "INSUFFICIENT_SCOPE",
                "Токену разрешено только чтение.",
            )
            // When a token was last used, for the person's list of tokens and apps: at most every five minutes.
            if (found.boolean("stale")) {
                tx.update(
                    "UPDATE auth.credentials SET last_used_at = clock_timestamp() WHERE id = $1",
                    actor.credentialId,
                )
            }
        }
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
        if (intent.isMutation && actor.credentialKind == CredentialKind.SESSION) {
            requireCondition(
                intent.origin == properties.publicOrigin && intent.csrfToken != null && intent.csrfToken == actor.csrf,
                403,
                "CSRF",
                "Обновите страницу перед изменением данных.",
            )
        }
        block(tx, actor)
    }

    /** RFC 8707: a token for the whole API serves every resource; one for the MCP server serves only that. */
    private fun audiences(resource: ProtectedResource): Set<String> = when (resource) {
        ProtectedResource.API -> setOf(properties.apiBase)
        ProtectedResource.MCP -> setOf(properties.apiBase, properties.mcpResource)
    }

    private fun actorOf(row: Row, kind: CredentialKind) = Actor(
        id = row.string("id"),
        name = row.string("name"),
        kind = PrincipalKind.fromWire(row.string("kind")),
        credentialId = row.string("credentialId"),
        csrf = row.stringOrNull("csrf"),
        projectId = row.stringOrNull("projectId"),
        capabilities = row.strings("capabilities").mapNotNull(Capability::fromWire).toSet(),
        initiatorId = row.string("initiatorId"),
        credentialKind = kind,
        scopes = row.strings("scopes").mapNotNull(Scope::fromWire).toSet(),
        clientId = row.stringOrNull("clientId"),
    )
}
