package com.sprintique.identity.api

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.identity.application.IdentityProviderPort
import com.sprintique.identity.application.SignInRejectedException
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.net.URI
import java.util.UUID

/**
 * Browser sign-in through the identity provider. Anonymous entry points: expired attempts are collected in bounded
 * batches and pending ones are capped, so abandoned sign-ins cannot grow the table without limit.
 */
@RestController
@Profile("api")
class OidcController(
    private val database: Database,
    private val properties: SprintiqueProperties,
    private val provider: ObjectProvider<IdentityProviderPort>,
) {
    private val redirect: URI get() = URI(properties.publicOrigin + "/auth/callback")

    @GetMapping("/auth/login")
    fun login(response: HttpServletResponse): ResponseEntity<Void> {
        val identity = configured()
        val start = identity.start(redirect)
        database.transaction { tx ->
            tx.update(
                """
                DELETE FROM auth.login_states WHERE state_hash IN
                    (SELECT state_hash FROM auth.login_states WHERE expires_at <= clock_timestamp() LIMIT 500)
                """.trimIndent(),
            )
            val pending = tx.row("SELECT count(*)::int AS n FROM auth.login_states")!!.int("n")
            requireCondition(pending < PENDING_LIMIT, 503, "BUSY", TOO_MANY_PENDING)
            tx.update(
                """
                INSERT INTO auth.login_states(state_hash, verifier, nonce, expires_at)
                VALUES ($1, $2, $3, clock_timestamp() + interval '10 minutes')
                """.trimIndent(),
                Tokens.sha256Hex(start.state), start.verifier, start.nonce,
            )
        }
        response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(LOGIN_COOKIE, start.state, LOGIN_SECONDS))
        return ResponseEntity.status(HttpStatus.FOUND).location(start.redirect).build()
    }

    @GetMapping("/auth/callback")
    fun callback(request: HttpServletRequest, response: HttpServletResponse): ResponseEntity<Void> {
        val identity = configured()
        val callback = URI(properties.publicOrigin + request.requestURI + (request.queryString?.let { "?$it" } ?: ""))
        val state = request.getParameter("state")
        requireCondition(
            state != null && state == AuthenticatedRequests.cookie(request, LOGIN_COOKIE),
            400,
            "LOGIN_STATE",
            "Сессия входа устарела. Начните вход заново.",
        )
        val pending = database.transaction { tx ->
            tx.row(
                """
                DELETE FROM auth.login_states WHERE state_hash = $1 AND expires_at > clock_timestamp()
                RETURNING verifier, nonce
                """.trimIndent(),
                Tokens.sha256Hex(state),
            )
        }
        val attempt = requirePresent(pending, 400, "LOGIN_STATE", "Сессия входа устарела.")
        val external = try {
            identity.complete(callback, redirect, state, attempt.string("nonce"), attempt.string("verifier"))
        } catch (@Suppress("SwallowedException") error: SignInRejectedException) {
            // Which check failed is logged by nobody and told to nobody: a probe learns nothing.
            throw ProblemException(401, "LOGIN_INVALID", "Не удалось подтвердить вход. Начните заново.")
        }
        val token = Tokens.random()
        database.transaction { tx ->
            val principal = tx.row(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject, email) VALUES ($1, 'human', $2, $3, $4, $5)
                ON CONFLICT (issuer, subject) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email RETURNING id, disabled_at
                """.trimIndent(),
                UUID.randomUUID().toString(), external.name, external.issuer, external.subject, external.verifiedEmail,
            )!!
            requireCondition(principal["disabled_at"] == null, 403, "ACCOUNT_DISABLED", "Аккаунт отключён.")
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
                VALUES ($1, $2, $3, 'session', $4, $2, clock_timestamp() + interval '8 hours')
                """.trimIndent(),
                UUID.randomUUID().toString(), principal.string("id"), Tokens.sha256Hex(token), Tokens.random(),
            )
        }
        val session = AuthenticatedRequests.cookieValue(AuthenticatedRequests.SESSION_COOKIE, token, SESSION_SECONDS)
        response.addHeader("Set-Cookie", session)
        response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(LOGIN_COOKIE, "", 0))
        return ResponseEntity.status(HttpStatus.FOUND).location(URI("/")).build()
    }

    private fun configured(): IdentityProviderPort =
        provider.ifAvailable
            ?: throw ProblemException(503, "IDENTITY_NOT_CONFIGURED", "OIDC-провайдер ещё не настроен.")

    private companion object {
        const val LOGIN_COOKIE = "__Host-sprintique-login"
        const val LOGIN_SECONDS = 600L
        const val SESSION_SECONDS = 28_800L
        const val PENDING_LIMIT = 10_000
        const val TOO_MANY_PENDING = "Слишком много незавершённых входов. Повторите через несколько минут."
    }
}
