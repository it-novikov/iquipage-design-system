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
 * at most 64 requests and 8 uploads in flight. File downloads have a cap of their own (32), apart from the other
 * requests, because a player may hold one open while it buffers; event streams have their own cap too; readiness is
 * never shed.
 */
@Component
@Profile("api")
@Order(FilterOrder.LIMITS)
class RequestLimitFilter(private val clientAddresses: ClientAddresses) : OncePerRequestFilter() {
    private class Window(var since: Long, var count: Int = 0, var logins: Int = 0)

    private val windows = LinkedHashMap<String, Window>()
    private val active = AtomicInteger()
    private val uploads = AtomicInteger()
    private val downloads = AtomicInteger()

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
        admitActive(request, response, chain)
    }

    private fun admitActive(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (isDownload(request)) return admitDownload(request, response, chain)
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

    private fun admitDownload(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (downloads.incrementAndGet() > MAX_DOWNLOADS) {
            downloads.decrementAndGet()
            return ProblemWriter.write(
                request,
                response,
                503,
                "BUSY",
                "Сервис занят. Повторите через несколько секунд.",
            )
        }
        try {
            chain.doFilter(request, response)
        } finally {
            downloads.decrementAndGet()
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
        private const val MAX_DOWNLOADS = 32

        /** Entry points that start a sign-in or check a secret: they share the tighter per-address login budget. */
        private val LOGINS = listOf("/auth/login", "/auth/dev-login", "/auth/email/")
        private val UPLOAD = Regex("^/api/v1/projects/[^/]+/assets/[^/]+/content$")
        private val DOWNLOAD = Regex("^/api/v1/projects/[^/]+/assets/[^/]+/(original|display|thumb)$")
        private val STREAM = Regex("^/api/v1/projects/[^/]+/events$")

        /**
         * The decoded, normalized path the router matches (`/%61uth/login` is `/auth/login`), never the raw URI:
         * a spelling the router accepts must not escape the limits.
         */
        fun routedPath(request: HttpServletRequest): String = request.servletPath + (request.pathInfo ?: "")

        fun isUpload(request: HttpServletRequest) = isFileContent(request) ||
            (request.method == "PUT" && routedPath(request) == "/api/v1/profile/avatar")

        /** The body of a stored file, up to the file limit rather than a photo's. */
        fun isFileContent(request: HttpServletRequest) = request.method == "PUT" && UPLOAD.matches(routedPath(request))

        fun isDownload(request: HttpServletRequest) =
            request.method in setOf("GET", "HEAD") && DOWNLOAD.matches(routedPath(request))

        fun isStream(request: HttpServletRequest) =
            STREAM.matches(routedPath(request)) && request.getParameter("stream") == "true"
    }
}
