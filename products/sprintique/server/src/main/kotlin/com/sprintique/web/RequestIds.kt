package com.sprintique.web

import jakarta.servlet.ServletRequest
import java.util.concurrent.atomic.AtomicLong

/** Short, process-unique request identifiers for correlating a client error with the log. */
object RequestIds {
    private const val ATTRIBUTE = "sprintique.requestId"
    private val counter = AtomicLong()

    fun of(request: ServletRequest): String =
        request.getAttribute(ATTRIBUTE) as? String ?: "req-${counter.incrementAndGet().toString(36)}".also { request.setAttribute(ATTRIBUTE, it) }
}
