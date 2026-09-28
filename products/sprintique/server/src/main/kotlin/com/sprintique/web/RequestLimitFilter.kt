package com.sprintique.web

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
 * at most 64 requests and 8 uploads in flight. Event streams have their own cap; readiness is never shed.
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
        if (!readiness && !path.startsWith("/api/") &&
            !path.startsWith("/auth/")
        ) {
            return chain.doFilter(request, response)
        }
        if (!admitWindow(
                clientAddresses.of(request),
                LOGINS.any(path::startsWith),
            )
        ) {
            return ProblemWriter.write(
                request,
                response,
                429,
                "REQUEST_LIMIT",
                "Слишком много запросов. Повторите через минуту.",
            )
        }
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

    companion object {
        private const val WINDOW_MILLISECONDS = 60_000L
        private const val MAX_WINDOWS = 4096
        private const val MAX_REQUESTS = 1000
        private const val MAX_LOGINS = 20
        private const val MAX_ACTIVE = 64
        private const val MAX_UPLOADS = 8

        /** Entry points that start a sign-in or check a secret: they share the tighter per-address login budget. */
        private val LOGINS = listOf("/auth/login", "/auth/dev-login", "/auth/email/")
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
