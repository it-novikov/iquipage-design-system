package com.sprintique.observability

import com.sprintique.web.FilterOrder
import com.sprintique.web.RequestIds
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.servlet.HandlerMapping
import java.util.concurrent.ConcurrentHashMap

/**
 * Bounded, aggregate-only measurements by method, route template and status class. No path values, query strings,
 * principal identifiers, bodies, headers or tokens are recorded.
 */
@Component
@Profile("api")
@Order(FilterOrder.METRICS)
class RequestMetrics : OncePerRequestFilter() {
    private val log = LoggerFactory.getLogger("http")
    private val measurements = ConcurrentHashMap<String, Measurement>()
    private val tools = ConcurrentHashMap<String, Measurement>()
    val startedAtMillis: Long = System.currentTimeMillis()

    class Measurement(val method: String, val route: String, val statusClass: Int) {
        var requests = 0L
        var durationMs = 0.0
        var maxDurationMs = 0.0
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val started = System.nanoTime()
        try {
            chain.doFilter(request, response)
        } finally {
            record(request, response.status, (System.nanoTime() - started) / NANOSECONDS_PER_MILLISECOND)
        }
    }

    private fun record(request: HttpServletRequest, status: Int, durationMs: Double) {
        val route = (request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as? String)
            ?.replace(PATH_VARIABLE, ":$1") ?: "unmatched"
        if (route == "/internal/metrics") return
        val method = if (request.method in METHODS) request.method else "OTHER"
        val statusClass = status / STATUS_CLASS
        val key = "$method $route $statusClass"
        if (!measurements.containsKey(key) && measurements.size >= MAX_SERIES) return
        val measurement = measurements.computeIfAbsent(key) { Measurement(method, route, statusClass) }
        synchronized(measurement) {
            measurement.requests++
            measurement.durationMs += durationMs
            measurement.maxDurationMs = maxOf(measurement.maxDurationMs, durationMs)
        }
        if (route.startsWith("/api/") || route.startsWith("/auth/") || route == "/mcp") {
            log.info(
                "http.request.completed request_id={} method={} route={} status_code={} duration_ms={}",
                RequestIds.of(request),
                method,
                route,
                status,
                durationMs.toLong(),
            )
        }
    }

    /**
     * One MCP tool call by tool and outcome. Tool names come from the server's fixed list and outcomes from a fixed
     * set, so the series stay bounded; the caller, the client and the arguments are never labels.
     */
    fun recordTool(tool: String, outcome: String, durationMs: Double) {
        val key = "$tool $outcome"
        if (!tools.containsKey(key) && tools.size >= MAX_TOOL_SERIES) return
        val measurement = tools.computeIfAbsent(key) { Measurement("TOOL", tool, 0) }
        synchronized(measurement) {
            measurement.requests++
            measurement.durationMs += durationMs
            measurement.maxDurationMs = maxOf(measurement.maxDurationMs, durationMs)
        }
    }

    fun toolSnapshot(): List<Map<String, Any>> = tools.map { (key, measurement) ->
        synchronized(measurement) {
            linkedMapOf(
                "tool" to measurement.route,
                "outcome" to key.substringAfter(' '),
                "calls" to measurement.requests,
                "durationMs" to measurement.durationMs,
                "maxDurationMs" to measurement.maxDurationMs,
            )
        }
    }

    fun snapshot(): List<Map<String, Any>> = measurements.values.map { measurement ->
        synchronized(measurement) {
            linkedMapOf(
                "method" to measurement.method,
                "route" to measurement.route,
                "statusClass" to measurement.statusClass,
                "requests" to measurement.requests,
                "durationMs" to measurement.durationMs,
                "maxDurationMs" to measurement.maxDurationMs,
            )
        }
    }

    private companion object {
        const val NANOSECONDS_PER_MILLISECOND = 1_000_000.0
        const val STATUS_CLASS = 100
        const val MAX_SERIES = 2048
        const val MAX_TOOL_SERIES = 128
        val METHODS = setOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
        val PATH_VARIABLE = Regex("\\{([^}/]+)}")
    }
}
