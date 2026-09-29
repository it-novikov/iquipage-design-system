package com.sprintique.identity.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.OAuthRules
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.net.URI

/** The parameters of an authorization request as the client put them in the authorize address. */
data class AuthorizationRequest(
    val clientId: String?,
    val redirectUri: String?,
    val responseType: String?,
    val codeChallenge: String?,
    val codeChallengeMethod: String?,
    val state: String?,
    val scope: String?,
    val resource: String?,
)

/**
 * The consent step of the authorization code flow. The person is signed in to the interface with a session; the
 * interface shows who asks for what and sends the decision back. A code is issued only for a registered address
 * (exactly; a loopback address may differ in its port), a PKCE S256 challenge, known scopes and one of this server's
 * resources.
 *
 * An unknown client or address is never redirected to. Other invalid requests are reported with the error redirect
 * the client expects, which the person follows by hand: the server never bounces a browser to a client's address on
 * its own (RFC 9700, open redirection).
 */
@Component
@Profile("api")
class OAuthAuthorizations(private val properties: SprintiqueProperties) {
    private data class Checked(
        val client: OAuthClient,
        val redirectUri: String,
        val challenge: String,
        val scopes: Set<Scope>,
        val resource: String,
        val state: String?,
    )

    /** What the consent screen shows: the client as it named itself, where it will be sent, what it asks for. */
    fun describe(tx: Transaction, actor: Actor, request: AuthorizationRequest): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        val checked = check(tx, request)
        val connected = tx.row(
            """
            SELECT 1 AS found FROM auth.oauth_grants g
            WHERE g.principal_id = $1 AND g.client_id = $2 AND ${ConnectedApps.LIVE} LIMIT 1
            """.trimIndent(),
            actor.id,
            checked.client.id,
        ) != null
        return linkedMapOf(
            "client" to linkedMapOf(
                "id" to checked.client.id,
                "name" to checked.client.name,
                "redirectUri" to checked.redirectUri,
                "redirectHost" to URI(checked.redirectUri).authority,
                "registeredAt" to checked.client.createdAt,
            ),
            "scopes" to Scope.entries.filter { it in checked.scopes }.map(Scope::wire),
            "resource" to checked.resource,
            "connected" to connected,
        )
    }

    /**
     * The person's answer. Approval may narrow the scopes (never widen them) and returns the address with a fresh
     * code; refusal returns the address with `access_denied`. Both carry the issuer (RFC 9207).
     */
    fun decide(
        tx: Transaction,
        actor: Actor,
        request: AuthorizationRequest,
        approve: Boolean,
        granted: Set<Scope>,
    ): Map<String, Any> {
        ProjectAccess.requireInteractive(actor)
        val checked = check(tx, request)
        if (!approve) return mapOf("redirectTo" to errorRedirect(checked.redirectUri, checked.state, "access_denied"))
        val scopes = granted + Scope.READ
        requireCondition(
            checked.scopes.containsAll(scopes),
            400,
            "OAUTH_SCOPE_INVALID",
            "Можно дать только те права, которые запросило приложение.",
        )
        // The app's own earlier connection is replaced by this one, so it does not count.
        val active = tx.row(
            """
            SELECT count(*)::int AS n FROM auth.oauth_grants g
            WHERE g.principal_id = $1 AND g.client_id <> $2 AND ${ConnectedApps.LIVE}
            """.trimIndent(),
            actor.id,
            checked.client.id,
        )!!.int("n")
        requireCondition(
            active < ConnectedApps.LIMIT,
            422,
            "APP_LIMIT",
            "Подключено слишком много приложений. Отключите лишние в настройках.",
        )
        val code = Tokens.prefixed("spc_")
        tx.update(
            """
            INSERT INTO auth.oauth_codes(code_hash, client_id, principal_id, redirect_uri, code_challenge, scopes, resource,
                                         expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp() + interval '5 minutes')
            """.trimIndent(),
            Tokens.sha256Hex(code),
            checked.client.id,
            actor.id,
            checked.redirectUri,
            checked.challenge,
            Scope.entries.filter { it in scopes }.map(Scope::wire),
            checked.resource,
        )
        val parameters = linkedMapOf("code" to code)
        checked.state?.let { parameters["state"] = it }
        parameters["iss"] = properties.apiBase
        return mapOf("redirectTo" to OAuthRules.redirect(checked.redirectUri, parameters))
    }

    private fun check(tx: Transaction, request: AuthorizationRequest): Checked {
        val client = OAuthClients.find(tx, request.clientId)
            ?: throw ProblemException(
                400,
                "OAUTH_CLIENT_INVALID",
                "Приложение не зарегистрировано. Подключите его заново.",
            )
        val redirectUri = request.redirectUri?.takeIf { asked ->
            client.redirectUris.any { OAuthRules.matchesRegistered(asked, it) }
        }
            ?: throw ProblemException(
                400,
                "OAUTH_REDIRECT_INVALID",
                "Адрес возврата не совпадает с зарегистрированным.",
            )
        val state = request.state
        if (state != null && !OAuthRules.isState(state)) {
            throw ProblemException(400, "OAUTH_REQUEST_INVALID", "Некорректный запрос приложения.")
        }
        fun fail(error: String): Nothing = throw ProblemException(
            400,
            "OAUTH_REQUEST_INVALID",
            "Приложение прислало некорректный запрос на доступ.",
            mapOf("redirectTo" to errorRedirect(redirectUri, state, error)),
        )
        if (request.responseType != "code") fail("unsupported_response_type")
        val challenge = request.codeChallenge
        if (challenge == null || request.codeChallengeMethod != "S256" || !OAuthRules.isChallenge(challenge)) {
            fail("invalid_request")
        }
        val scopes = OAuthRules.scopes(request.scope) ?: fail("invalid_scope")
        val resource = OAuthRules.resource(request.resource, properties.mcpResource)
            ?: fail("invalid_target")
        return Checked(client, redirectUri, challenge, scopes, resource, state)
    }

    private fun errorRedirect(redirectUri: String, state: String?, error: String): String {
        val parameters = linkedMapOf("error" to error)
        state?.let { parameters["state"] = it }
        parameters["iss"] = properties.apiBase
        return OAuthRules.redirect(redirectUri, parameters)
    }
}
