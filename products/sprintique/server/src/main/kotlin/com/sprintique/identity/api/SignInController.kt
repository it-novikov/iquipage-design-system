package com.sprintique.identity.api

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.identity.application.Accounts
import com.sprintique.identity.application.IdentityProviderPort
import com.sprintique.identity.application.SignInProviders
import com.sprintique.identity.application.SignInRejectedException
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RestController
import java.net.URI

/**
 * Browser sign-in through Google or Apple. Anonymous entry points: expired attempts are collected in bounded batches
 * and pending ones are capped, so abandoned sign-ins cannot grow the table without limit. A failed callback returns
 * the browser to the sign-in screen with an error code instead of showing a raw error.
 */
@RestController
@Profile("api")
class SignInController(
    private val database: Database,
    private val properties: SprintiqueProperties,
    private val providers: SignInProviders,
    private val accounts: Accounts,
) {
    private val log = LoggerFactory.getLogger(SignInController::class.java)

    @GetMapping("/auth/login/{provider}")
    fun login(@PathVariable provider: String, response: HttpServletResponse): ResponseEntity<Void> {
        val identity = configured(provider)
        val start = try {
            identity.start(redirectOf(identity))
        } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
            // Discovery failed: the provider is unreachable or misconfigured. The person returns to the sign-in screen.
            log.warn("Sign-in with {} unavailable: {}", identity.name, error.javaClass.simpleName)
            return failed("PROVIDER_UNAVAILABLE")
        }
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
                INSERT INTO auth.login_states(state_hash, verifier, nonce, provider, expires_at)
                VALUES ($1, $2, $3, $4, clock_timestamp() + interval '10 minutes')
                """.trimIndent(),
                Tokens.sha256Hex(start.state), start.verifier, start.nonce, identity.name,
            )
        }
        response.addHeader("Set-Cookie", loginCookie(identity, start.state, LOGIN_SECONDS))
        return ResponseEntity.status(HttpStatus.FOUND).location(start.redirect).build()
    }

    /** Google returns with a query; Apple posts a form from its own site, which is why its state cookie is `None`. */
    @RequestMapping("/auth/callback/{provider}", method = [RequestMethod.GET, RequestMethod.POST])
    fun callback(
        @PathVariable provider: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<Void> {
        val identity = configured(provider)
        response.addHeader("Set-Cookie", loginCookie(identity, "", 0))
        val parameters = request.parameterMap.mapValues { it.value.toList() }
        val expected = if (identity.postsCallback) "POST" else "GET"
        val state = parameters["state"]?.singleOrNull()
        return when {
            request.method != expected -> failed("LOGIN_INVALID")
            parameters["error"] != null -> failed("LOGIN_CANCELLED")
            state == null || state != AuthenticatedRequests.cookie(request, LOGIN_COOKIE) -> failed("LOGIN_STATE")
            else -> finish(identity, parameters, state, response)
        }
    }

    private fun finish(
        identity: IdentityProviderPort,
        parameters: Map<String, List<String>>,
        state: String,
        response: HttpServletResponse,
    ): ResponseEntity<Void> {
        val attempt = database.transaction { tx ->
            tx.row(
                """
                DELETE FROM auth.login_states
                WHERE state_hash = $1 AND provider = $2 AND expires_at > clock_timestamp()
                RETURNING verifier, nonce
                """.trimIndent(),
                Tokens.sha256Hex(state), identity.name,
            )
        } ?: return failed("LOGIN_STATE")
        val external = try {
            identity.complete(
                parameters,
                redirectOf(identity),
                state,
                attempt.string("nonce"),
                attempt.string("verifier"),
            )
        } catch (error: SignInRejectedException) {
            // Which check failed goes to the server log for the operator, never to the browser: a probe learns nothing.
            log.warn("Sign-in with {} rejected: {}", identity.name, reasonOf(error))
            return failed("LOGIN_INVALID")
        }
        val session = try {
            database.transaction { tx -> accounts.signIn(tx, external) }
        } catch (error: ProblemException) {
            return failed(error.code)
        }
        response.addHeader(
            "Set-Cookie",
            AuthenticatedRequests.cookieValue(
                AuthenticatedRequests.SESSION_COOKIE,
                session.token,
                Accounts.SESSION_COOKIE_SECONDS,
            ),
        )
        return ResponseEntity.status(HttpStatus.FOUND).location(URI("/")).build()
    }

    /** The failed check, briefly: our own tag, the provider's error code or the validator's complaint. */
    private fun reasonOf(error: SignInRejectedException): String {
        val cause = error.cause ?: return "unknown"
        return "${cause.javaClass.simpleName}: ${cause.message.orEmpty().take(REASON_LIMIT)}"
    }

    private fun configured(name: String): IdentityProviderPort =
        providers[name] ?: throw ProblemException(404, "SIGN_IN_NOT_CONFIGURED", "Этот способ входа не настроен.")

    private fun redirectOf(identity: IdentityProviderPort) =
        URI("${properties.publicOrigin}/auth/callback/${identity.name}")

    private fun loginCookie(identity: IdentityProviderPort, value: String, seconds: Long): String {
        val cookie = AuthenticatedRequests.cookieValue(LOGIN_COOKIE, value, seconds)
        return if (identity.postsCallback) cookie.replace("SameSite=Lax", "SameSite=None") else cookie
    }

    private fun failed(code: String): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FOUND).location(URI("/?sign-in-error=$code")).build()

    private companion object {
        const val LOGIN_COOKIE = "__Host-sprintique-login"
        const val LOGIN_SECONDS = 600L
        const val PENDING_LIMIT = 10_000
        const val REASON_LIMIT = 200
        const val TOO_MANY_PENDING = "Слишком много незавершённых входов. Повторите через несколько минут."
    }
}
