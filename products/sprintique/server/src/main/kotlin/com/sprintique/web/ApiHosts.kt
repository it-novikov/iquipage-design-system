package com.sprintique.web

import com.sprintique.configuration.SprintiqueProperties
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI

/**
 * Which of the two public names a request was addressed to. The interface and the API share one process; the reverse
 * proxy passes the name the client used in `Host`. With no separate API origin configured there is only one name.
 */
@Component
@Profile("api")
class ApiHosts(properties: SprintiqueProperties) {
    private val apiAuthority = URI(properties.apiBase).authority.lowercase()
    private val separate = properties.apiOrigin.isNotEmpty() &&
        apiAuthority != URI(properties.publicOrigin).authority.lowercase()

    /** Whether the request came through the API name: session cookies are not credentials there. */
    fun isApiHost(request: HttpServletRequest): Boolean =
        separate && request.getHeader("Host")?.trim()?.lowercase() == apiAuthority
}

/**
 * The API name serves the API and nothing else: `/api/…`, `/mcp`, the OAuth metadata and the probes. The interface,
 * its sign-in routes and its static files exist only under the interface name, so no page of the product runs on the
 * API origin.
 */
@Component
@Profile("api")
@Order(FilterOrder.HOSTS)
class ApiHostFilter(private val hosts: ApiHosts) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val path = RequestLimitFilter.routedPath(request)
        val served = API_PATHS.any { path == it || path.startsWith("$it/") } || path.startsWith(WELL_KNOWN_OAUTH)
        if (!served && hosts.isApiHost(request)) {
            return ProblemWriter.write(request, response, 404, "NOT_FOUND", "Ресурс не найден.")
        }
        chain.doFilter(request, response)
    }

    private companion object {
        val API_PATHS = listOf("/api", "/mcp", "/health", "/ready")
        const val WELL_KNOWN_OAUTH = "/.well-known/oauth-"
    }
}
