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
 * at most 64 requests and 8 short uploads in flight. Long transfers have lanes of their own, so they never crowd out
 * short requests, each with a cap per credential so that one person cannot hold a whole lane: uploads of more than
 * 32 MiB (8, 2 each) and downloads of originals (32, 8 each), which a paused player may hold open. Event streams have
 * their own cap too; readiness is never shed.
 */
@Component
@Profile("api")
@Order(FilterOrder.LIMITS)
class RequestLimitFilter(private val clientAddresses: ClientAddresses) : OncePerRequestFilter() {
    private class Window(var since: Long, var count: Int = 0, var logins: Int = 0)

    private val windows = LinkedHashMap<String, Window>()
    private val active = AtomicInteger()
    private val uploads = AtomicInteger()
    private val longUploads = Lane(MAX_LONG_UPLOADS, LONG_UPLOADS_EACH)
    private val downloads = Lane(MAX_DOWNLOADS, DOWNLOADS_EACH)

    /** Concurrent holders of one kind of long request: a cap in total and a cap per holder. */
    private class Lane(private val total: Int, private val each: Int) {
        private var count = 0
        private val holders = HashMap<String, Int>()

        @Synchronized
        fun enter(holder: String): Boolean {
            if (count >= total || (holders[holder] ?: 0) >= each) return false
            count++
            holders.merge(holder, 1, Int::plus)
            return true
        }

        @Synchronized
        fun leave(holder: String) {
            count--
            holders.compute(holder) { _, held -> if (held == null || held <= 1) null else held - 1 }
        }
    }

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
        if (isDownload(request)) return admitLane(downloads, request, response, chain)
        if (isFileContent(request) && request.contentLengthLong !in 0..SHORT_BODY) {
            return admitLane(longUploads, request, response, chain)
        }
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

    private fun admitLane(lane: Lane, request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val holder = holderOf(request)
        if (!lane.enter(holder)) {
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
            lane.leave(holder)
        }
    }

    /** Whose transfer this is: the credential the request carries, or else its address. Kept in memory only. */
    private fun holderOf(request: HttpServletRequest): String =
        request.getHeader("Authorization")
            ?: AUTH_COOKIE.find(request.getHeader("Cookie").orEmpty())?.groupValues?.get(1)
            ?: ("address:" + clientAddresses.of(request))

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
        private const val MAX_LONG_UPLOADS = 8
        private const val LONG_UPLOADS_EACH = 2
        private const val MAX_DOWNLOADS = 32
        private const val DOWNLOADS_EACH = 8

        /** An upload body up to this size is a short request. */
        private const val SHORT_BODY = 32L * 1024 * 1024
        private val AUTH_COOKIE = Regex("(?:^|;\\s*)__Host-sprintique=([^;]+)")

        /** Entry points that start a sign-in or check a secret: they share the tighter per-address login budget. */
        private val LOGINS = listOf("/auth/login", "/auth/dev-login", "/auth/email/")
        private val UPLOAD = Regex("^/api/v1/projects/[^/]+/assets/[^/]+/content$")
        private val DOWNLOAD = Regex("^/api/v1/projects/[^/]+/assets/[^/]+/original$")
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
