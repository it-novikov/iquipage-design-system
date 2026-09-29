package com.sprintique.web

import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.application.CredentialLimits
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.concurrent.atomic.AtomicInteger

/**
 * Per-process safeguards, not cluster-wide quotas: a per-address window (1000 requests and 20 sign-ins a minute), at
 * most 64 requests and 8 uploads in flight. Event streams have their own cap; readiness is never shed.
 *
 * A request with a well-formed bearer token is counted against its credential once that is found live
 * ([com.sprintique.identity.application.CredentialLimits]), not against its address: an assistant's servers carry
 * many people's tokens from a few shared addresses. Its address pays for it unless the token was found live, and an
 * address whose window is spent is refused whatever it carries.
 */
@Component
@Profile("api")
@Order(FilterOrder.LIMITS)
class RequestLimitFilter(private val clientAddresses: ClientAddresses) : OncePerRequestFilter() {
    private class Window(var since: Long, var count: Int = 0, var logins: Int = 0)

    private val windows = LinkedHashMap<String, Window>()
    private val active = AtomicInteger()
    private val uploads = AtomicInteger()

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val path = routedPath(request)
        val readiness = path == "/ready"
        if (!readiness && LIMITED.none(path::startsWith)) return chain.doFilter(request, response)
        val address = clientAddresses.of(request)
        val login = LOGINS.any(path::startsWith)
        val bearer = !login && AuthenticatedRequests.isBearer(request.getHeader("Authorization"))
        if (!admitWindow(address, login, count = !bearer)) {
            return ProblemWriter.write(
                request,
                response,
                429,
                "REQUEST_LIMIT",
                "Слишком много запросов. Повторите через минуту.",
            )
        }
        try {
            admitted(request, response, chain, readiness)
        } finally {
            if (bearer && request.getAttribute(CredentialLimits.ADMITTED) == null) charge(address)
        }
    }

    private fun admitted(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
        readiness: Boolean,
    ) {
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

    /** Counts a request of the address (unless [count] is false, which only checks the window is not spent). */
    @Synchronized
    private fun admitWindow(address: String, login: Boolean, count: Boolean = true): Boolean {
        val now = System.currentTimeMillis()
        if (windows.size >= MAX_WINDOWS) windows.values.removeIf { now - it.since >= WINDOW_MILLISECONDS }
        val existing = windows[address]
        if (!count && (existing == null || now - existing.since >= WINDOW_MILLISECONDS)) return true
        val window =
            existing ?: if (windows.size >= MAX_WINDOWS) return false else Window(now).also { windows[address] = it }
        if (now - window.since >= WINDOW_MILLISECONDS) {
            window.since = now
            window.count = 0
            window.logins = 0
        }
        if (count) window.count++
        if (login) window.logins++
        return window.count <= MAX_REQUESTS && (!login || window.logins <= MAX_LOGINS)
    }

    /** A bearer header that proved no live credential costs its address one request, as if it had carried none. */
    private fun charge(address: String) {
        admitWindow(address, login = false)
    }

    companion object {
        private const val WINDOW_MILLISECONDS = 60_000L

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
