package com.sprintique.local

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.identity.api.AuthenticatedRequests
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.net.URI

/**
 * The settings preview stand opens a synthetic session per role (`/__preview/admin`, `/__preview/reader`). The
 * sessions come from the stand's own fixture through SPRINTIQUE_PREVIEW_SESSIONS (`role:token,…`). Only the local
 * artifact has this route, and like dev login it refuses production and origins other than loopback.
 */
@RestController
@Profile("api")
@ConditionalOnExpression("'\${sprintique.preview-sessions:}' != ''")
class LocalPreviewSessions(
    properties: SprintiqueProperties,
    @Value("\${sprintique.preview-sessions}") sessions: String,
) {
    private val tokens: Map<String, String> = sessions.split(',').map { it.split(':', limit = 2) }
        .filter { it.size == 2 }.associate { (role, token) -> role to token }

    init {
        check(!properties.isProduction) { "Preview sessions are never available in production" }
        check(URI(properties.publicOrigin).host in setOf("localhost", "127.0.0.1")) {
            "Preview sessions require a loopback PUBLIC_ORIGIN"
        }
    }

    @GetMapping("/__preview/{role}")
    fun open(@PathVariable role: String, response: HttpServletResponse) {
        val token = tokens[role]
        if (token == null) {
            response.status = HttpServletResponse.SC_NOT_FOUND
            return
        }
        val cookie = AuthenticatedRequests.cookieValue(AuthenticatedRequests.SESSION_COOKIE, token, DAY)
        response.addHeader("Set-Cookie", cookie)
        response.sendRedirect("/#settings/appearance")
    }

    private companion object {
        const val DAY = 86_400L
    }
}
