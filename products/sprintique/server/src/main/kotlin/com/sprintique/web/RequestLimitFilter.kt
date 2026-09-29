package com.sprintique.web

import com.sprintique.token.Tokens
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.concurrent.atomic.AtomicInteger

/**
 * Per-process safeguards, not cluster-wide quotas: a per-address window (1000 requests and 20 sign-ins a minute),
 * a per-token window for bearer credentials (600 requests a minute, whichever address they come from), at most 64
 * requests and 8 uploads in flight. Event streams have their own cap; readiness is never shed.
 */
@Component
@Profile("api")
@Order(FilterOrder.LIMITS)
class RequestLimitFilter(private val clientAddresses: ClientAddresses) : OncePerRequestFilter() {
    private class Window(var since: Long, var count: Int = 0, var logins: Int = 0)

    private val windows = LinkedHashMap<String, Window>()
    private val tokenWindows = LinkedHashMap<String, Window>()
    private val active = AtomicInteger()
    private val uploads = AtomicInteger()

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val path = routedPath(request)
        val readiness = path == "/ready"
        if (!readiness && LIMITED.none(path::startsWith)) return chain.doFilter(request, response)
        val bearer = request.getHeader("Authorization")?.takeIf { it.length in 1..MAX_AUTHORIZATION }
        val refusal = when {
            !admitWindow(clientAddresses.of(request), LOGINS.any(path::startsWith)) ->
                "Слишком много запросов. Повторите через минуту."

            bearer != null && !admitToken(Tokens.sha256Hex(bearer)) ->
                "Слишком много запросов с этим токеном. Повторите через минуту."

            else -> null
        }
        if (refusal != null) return ProblemWriter.write(request, response, 429, "REQUEST_LIMIT", refusal)
        if (readiness || isStream(request)) return chain.doFilter(request, response)
        val upload = isUpload(request)
        if (active.get() >= MAX_ACTIVE || (upload && uploads.get() >= MAX_UPLOADS)) {
            return ProblemWriter.write(
                request,
                response,
                503,
                "BUSY",
                "Сервис занят. Повторите через несколько секунд.",
            )
        }
        active.incrementAndGet()
        if (upload) uploads.incrementAndGet()
        try {
            chain.doFilter(request, response)
        } finally {
            active.decrementAndGet()
            if (upload) uploads.decrementAndGet()
        }
    }

    @Synchronized
    private fun admitWindow(address: String, login: Boolean): Boolean {
        val now = System.currentTimeMillis()
        if (windows.size >= MAX_WINDOWS) windows.values.removeIf { now - it.since >= WINDOW_MILLISECONDS }
        val window =
            windows[address]
                ?: if (windows.size >= MAX_WINDOWS) return false else Window(now).also { windows[address] = it }
        if (now - window.since >= WINDOW_MILLISECONDS) {
            window.since = now
            window.count = 0
            window.logins = 0
        }
        window.count++
        if (login) window.logins++
        return window.count <= MAX_REQUESTS && (!login || window.logins <= MAX_LOGINS)
    }

    /** The window of one bearer credential, keyed by the digest of the header: the token itself is never kept. */
    @Synchronized
    private fun admitToken(key: String): Boolean {
        val now = System.currentTimeMillis()
        if (tokenWindows.size >= MAX_WINDOWS) tokenWindows.values.removeIf { now - it.since >= WINDOW_MILLISECONDS }
        val window =
            tokenWindows[key]
                ?: if (tokenWindows.size >= MAX_WINDOWS) return false else Window(now).also { tokenWindows[key] = it }
        if (now - window.since >= WINDOW_MILLISECONDS) {
            window.since = now
            window.count = 0
        }
        window.count++
        return window.count <= MAX_TOKEN_REQUESTS
    }

    companion object {
        private const val WINDOW_MILLISECONDS = 60_000L
        private const val MAX_TOKEN_REQUESTS = 600
        private const val MAX_AUTHORIZATION = 2048

        /** The routes under limits: the API, the MCP server, OAuth discovery and sign-in. */
        private val LIMITED = listOf("/api/", "/auth/", "/mcp", "/.well-known/")
        private const val MAX_WINDOWS = 4096
        private const val MAX_REQUESTS = 1000
        private const val MAX_LOGINS = 20
        private const val MAX_ACTIVE = 64
        private const val MAX_UPLOADS = 8

        /**
         * Entry points that start a sign-in or check a secret, and open OAuth client registration, share the tighter
         * per-address login budget. The token endpoint is not among them: its codes, refresh tokens and client secrets
         * are 256 random bits, and one assistant's servers refresh the tokens of many people from few addresses.
         */
        private val LOGINS = listOf("/auth/login", "/auth/dev-login", "/auth/email/", "/api/oauth/register")
        private val UPLOAD = Regex("^/api/v1/projects/[^/]+/assets/[^/]+/content$")
        private val STREAM = Regex("^/api/v1/projects/[^/]+/events$")

        /**
         * The decoded, normalized path the router matches (`/%61uth/login` is `/auth/login`), never the raw URI:
         * a spelling the router accepts must not escape the limits.
         */
        fun routedPath(request: HttpServletRequest): String = request.servletPath + (request.pathInfo ?: "")

        fun isUpload(request: HttpServletRequest) =
            request.method == "PUT" &&
                (UPLOAD.matches(routedPath(request)) || routedPath(request) == "/api/v1/profile/avatar")

        fun isStream(request: HttpServletRequest) =
            STREAM.matches(routedPath(request)) && request.getParameter("stream") == "true"
    }
}
