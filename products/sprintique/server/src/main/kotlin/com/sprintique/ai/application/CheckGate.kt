package com.sprintique.ai.application

import com.sprintique.problem.ProblemException
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * Paces «Проверить» (docs/decisions/0005-ai-agents.md). A check is a real outgoing call made while a request waits:
 * one connection is checked once at a time, a workspace has at most two checks in flight and thirty a minute, so
 * repeated clicks cannot hold the API's request threads or make the server a load generator against an address.
 * Per process, like the other request limits.
 */
@Component
@Profile("api")
class CheckGate {
    /** Nanoseconds of a monotonic clock; tests replace it. */
    internal var clock: () -> Long = System::nanoTime
    private val inFlight = HashMap<String, String>()
    private val windows = HashMap<String, Window>()

    private class Window(val since: Long, var count: Int = 0)

    /** Runs [block] as the check of [connectionId] in [workspaceId], or refuses with 429 when it is too much. */
    fun <T> check(workspaceId: String, connectionId: String, block: () -> T): T {
        enter(workspaceId, connectionId)
        try {
            return block()
        } finally {
            leave(connectionId)
        }
    }

    @Synchronized
    private fun enter(workspaceId: String, connectionId: String) {
        val now = clock()
        windows.values.removeIf { now - it.since >= WINDOW.toNanos() }
        val window = windows.getOrPut(workspaceId) { Window(now) }
        val busy = connectionId in inFlight || inFlight.values.count { it == workspaceId } >= PER_WORKSPACE
        if (busy || window.count >= PER_MINUTE || windows.size > REMEMBERED) {
            throw ProblemException(
                429,
                "AI_CHECK_BUSY",
                "Подключение уже проверяется или проверок было слишком много. Повторите через минуту.",
            )
        }
        window.count++
        inFlight[connectionId] = workspaceId
    }

    @Synchronized
    private fun leave(connectionId: String) {
        inFlight.remove(connectionId)
    }

    private companion object {
        val WINDOW: Duration = Duration.ofMinutes(1)
        const val PER_WORKSPACE = 2
        const val PER_MINUTE = 30
        const val REMEMBERED = 10_000
    }
}
