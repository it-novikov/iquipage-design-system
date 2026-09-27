package com.sprintique.health

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException

/** A dependency this instance needs to serve traffic: the database, object storage. */
fun interface ReadinessProbe {
    fun check()
}

/**
 * Readiness probes the real dependencies on every request, so a failure shows at once; concurrent probes share one
 * check, so anonymous traffic cannot multiply database and storage work.
 */
@RestController
class ReadinessController(private val probes: List<ReadinessProbe>) {
    private var running: CompletableFuture<Unit>? = null

    @GetMapping("/ready")
    fun ready(): Map<String, String> {
        val probe = synchronized(this) {
            running ?: CompletableFuture.supplyAsync { probes.forEach(ReadinessProbe::check) }
                .whenComplete { _, _ -> synchronized(this) { running = null } }
                .also { running = it }
        }
        try {
            probe.get()
        } catch (error: ExecutionException) {
            throw error.cause ?: error
        }
        return mapOf("status" to "ready")
    }
}
