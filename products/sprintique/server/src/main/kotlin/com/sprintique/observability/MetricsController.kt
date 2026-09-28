package com.sprintique.observability

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.problem.ProblemException
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.lang.management.ManagementFactory

/** Private aggregate metrics behind their own bearer token; without a configured token the route does not exist. */
@RestController
@Profile("api")
class MetricsController(private val properties: SprintiqueProperties, private val metrics: RequestMetrics) {
    @GetMapping("/internal/metrics")
    fun metrics(@RequestHeader("Authorization", required = false) authorization: String?): Map<String, Any> {
        val token = properties.metricsToken
        if (token.isEmpty() || !Tokens.equalsInConstantTime(authorization.orEmpty(), "Bearer $token")) {
            throw ProblemException(404, "NOT_FOUND", "Ресурс не найден.")
        }
        val memory = ManagementFactory.getMemoryMXBean()
        return linkedMapOf(
            "schema" to "sprintique.runtime-metrics/1",
            "scope" to "process",
            "uptimeSeconds" to (System.currentTimeMillis() - metrics.startedAtMillis) / MILLISECONDS_PER_SECOND,
            // The JVM reports committed memory, the closest portable measure of the process footprint.
            "rssBytes" to memory.heapMemoryUsage.committed + memory.nonHeapMemoryUsage.committed,
            "completedHttpRequests" to metrics.snapshot(),
            "longLivedStreams" to "not included until closed",
            "resetOnRestart" to true,
        )
    }

    private companion object {
        const val MILLISECONDS_PER_SECOND = 1000
    }
}
