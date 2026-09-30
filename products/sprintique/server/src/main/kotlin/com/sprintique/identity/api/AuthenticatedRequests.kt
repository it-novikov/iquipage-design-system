package com.sprintique.identity.api

import com.sprintique.database.Transaction
import com.sprintique.identity.application.Authentication
import com.sprintique.identity.application.RequestIntent
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Credential
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.ProtectedResource
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.web.ApiHosts
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** Reads the credential of an HTTP request and runs the operation as its principal. */
@Component
@Profile("api")
class AuthenticatedRequests(private val authentication: Authentication, private val hosts: ApiHosts) {
    fun <T> run(request: HttpServletRequest, block: (Transaction, Actor) -> T): T =
        authentication.run(
            credentialOf(request),
            RequestIntent(
                request.method !in SAFE_METHODS,
                request.getHeader("Origin"),
                request.getHeader("X-CSRF-Token"),
                ProtectedResource.API,
            ),
            block,
        )

    /**
     * An Authorization header means a bearer token and nothing else; otherwise the session cookie, except on the API
     * host, where a browser's ambient cookie is never a credential.
     */
    fun credentialOf(request: HttpServletRequest): Credential {
        bearerOf(request)?.let { return it }
        requireCondition(
            !hosts.isApiHost(request),
            401,
            "UNAUTHENTICATED",
            "Передайте токен в заголовке Authorization.",
        )
        val token = cookie(request, SESSION_COOKIE)
        requireCondition(
            token != null && SESSION_TOKEN.matches(token),
            401,
            "UNAUTHENTICATED",
            "Войдите в аккаунт.",
        )
        return Credential(token, CredentialKind.SESSION)
    }

    companion object {
        const val SESSION_COOKIE = "__Host-sprintique"
        private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
        private val BEARER = Regex("^[Bb]earer ((?:spr|spk|spo)_[A-Za-z0-9_-]{43})$")
        private val SESSION_TOKEN = Regex("^[A-Za-z0-9_-]{43}$")

        /** Whether an Authorization header has the shape of this server's bearer tokens; nothing is looked up. */
        fun isBearer(authorization: String?): Boolean = authorization != null && BEARER.matches(authorization)

        /** The bearer token of the request, told apart by its prefix; null without an Authorization header. */
        fun bearerOf(request: HttpServletRequest): Credential? {
            val authorization = request.getHeader("Authorization") ?: return null
            val token = requirePresent(
                BEARER.matchEntire(authorization)?.groupValues?.get(1),
                401,
                "UNAUTHENTICATED",
                "Некорректный токен.",
            )
            return Credential(token, requireNotNull(CredentialKind.ofBearer(token)))
        }

        /** The first cookie with this name, read from the raw header as browsers send it. */
        fun cookie(request: HttpServletRequest, name: String): String? =
            request.getHeaders("Cookie").toList().flatMap { it.split(';') }.map(String::trim)
                .firstOrNull { it.startsWith("$name=") }?.substring(name.length + 1)

        fun cookieValue(name: String, value: String, maxAgeSeconds: Long) =
            "$name=$value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=$maxAgeSeconds"
    }
}
