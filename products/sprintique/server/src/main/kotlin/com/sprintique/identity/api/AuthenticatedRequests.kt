package com.sprintique.identity.api

import com.sprintique.database.Transaction
import com.sprintique.identity.application.Authentication
import com.sprintique.identity.application.RequestIntent
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Credential
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.problem.requireCondition
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** Reads the credential of an HTTP request and runs the operation as its principal. */
@Component
@Profile("api")
class AuthenticatedRequests(private val authentication: Authentication) {
    fun <T> run(request: HttpServletRequest, block: (Transaction, Actor) -> T): T =
        authentication.run(
            credentialOf(request),
            RequestIntent(
                request.method !in SAFE_METHODS,
                request.getHeader("Origin"),
                request.getHeader("X-CSRF-Token"),
            ),
            block,
        )

    companion object {
        const val SESSION_COOKIE = "__Host-sprintique"
        private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
        private val AGENT_TOKEN = Regex("^Bearer spr_[A-Za-z0-9_-]{43}$")
        private val SESSION_TOKEN = Regex("^[A-Za-z0-9_-]{43}$")

        /** An Authorization header means an agent token and nothing else; otherwise the session cookie. */
        fun credentialOf(request: HttpServletRequest): Credential {
            val authorization = request.getHeader("Authorization")
            if (authorization != null) {
                requireCondition(AGENT_TOKEN.matches(authorization), 401, "UNAUTHENTICATED", "Некорректный токен.")
                return Credential(authorization.removePrefix("Bearer "), CredentialKind.AGENT)
            }
            val token = cookie(request, SESSION_COOKIE)
            requireCondition(
                token != null && SESSION_TOKEN.matches(token),
                401,
                "UNAUTHENTICATED",
                "Войдите в аккаунт.",
            )
            return Credential(token, CredentialKind.SESSION)
        }

        /** The first cookie with this name, read from the raw header as browsers send it. */
        fun cookie(request: HttpServletRequest, name: String): String? =
            request.getHeaders("Cookie").toList().flatMap { it.split(';') }.map(String::trim)
                .firstOrNull { it.startsWith("$name=") }?.substring(name.length + 1)

        fun cookieValue(name: String, value: String, maxAgeSeconds: Long) =
            "$name=$value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=$maxAgeSeconds"
    }
}
