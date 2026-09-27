package com.sprintique.local

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.contract.Contracts
import com.sprintique.database.Database
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.application.SignInMethod
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.constraints.Size
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.net.URI
import java.util.UUID

/**
 * The fixed admin/admin sign-in of the local stand. It exists only in the local artifact and refuses to start in
 * production or on an origin other than loopback, so it can never be switched on in a deployed product.
 */
@Configuration(proxyBeanMethods = false)
@Profile("api")
@ConditionalOnProperty("sprintique.dev-login", havingValue = "true")
class LocalDevLoginConfiguration(properties: SprintiqueProperties) {
    init {
        check(!properties.isProduction) { "Local dev login is never available in production" }
        check(URI(properties.publicOrigin).host in setOf("localhost", "127.0.0.1")) {
            "Local dev login requires a loopback PUBLIC_ORIGIN"
        }
    }

    @Bean
    fun devLoginMethod() = SignInMethod { "devLogin" }
}

data class DevLoginRequest(
    @field:Size(max = 100)
    val username: String,
    @field:Size(max = 100)
    val password: String,
)

/** Registered by component scanning, so it carries the same conditions as [LocalDevLoginConfiguration] itself. */
@RestController
@Profile("api")
@ConditionalOnProperty("sprintique.dev-login", havingValue = "true")
class DevLoginController(
    private val database: Database,
    private val properties: SprintiqueProperties,
    private val contracts: Contracts,
) {
    @PostMapping("/auth/dev-login")
    fun signIn(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): Map<String, Boolean> {
        val sameOrigin = request.getHeader("Origin") == properties.publicOrigin
        requireCondition(sameOrigin, 403, "CSRF", "Обновите страницу и войдите заново.")
        val input = contracts.parse<DevLoginRequest>(body)
        requireCondition(
            Tokens.equalsInConstantTime(input.username, "admin") &&
                Tokens.equalsInConstantTime(input.password, "admin"),
            401,
            "LOGIN_INVALID",
            "Неверный логин или пароль.",
        )
        val token = Tokens.random()
        val csrf = Tokens.random()
        database.transaction { tx ->
            val principal = tx.row(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', $2, $3, $4)
                ON CONFLICT (issuer, subject) DO UPDATE SET disabled_at = NULL RETURNING id
                """.trimIndent(),
                UUID.randomUUID().toString(), NAME, ISSUER, SUBJECT,
            )!!.string("id")
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
                VALUES ($1, $2, $3, 'session', $4, $2, clock_timestamp() + interval '8 hours')
                """.trimIndent(),
                UUID.randomUUID().toString(), principal, Tokens.sha256Hex(token), csrf,
            )
        }
        val cookie = AuthenticatedRequests.cookieValue(AuthenticatedRequests.SESSION_COOKIE, token, SESSION_SECONDS)
        response.addHeader("Set-Cookie", cookie)
        return mapOf("ok" to true)
    }

    companion object {
        /** The local account is keyed by this issuer, never by a real identity provider. */
        const val ISSUER = "urn:sprintique:local-dev"
        const val SUBJECT = "admin"
        const val NAME = "Администратор"
        private const val SESSION_SECONDS = 28_800L
    }
}
