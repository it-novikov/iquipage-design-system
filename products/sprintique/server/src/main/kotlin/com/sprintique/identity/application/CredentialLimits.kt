package com.sprintique.identity.application

import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * The request window of one bearer credential: 600 requests a minute, whichever addresses they come from. It is
 * counted only after the credential was found live, so its keys are real credentials (the grant of an OAuth token,
 * which all tokens of one connection share, or the credential itself) and a stream of made-up tokens cannot crowd
 * them out. A per-process safeguard like the address window, not a cluster-wide quota.
 */
@Component
@Profile("api")
class CredentialLimits {
    private class Window(var since: Long, var count: Int = 0)

    private val windows = LinkedHashMap<String, Window>()

    /** Counts one request of the credential named by [key]; false once its window is spent. */
    @Synchronized
    fun admit(key: String): Boolean {
        val now = System.currentTimeMillis()
        if (windows.size >= MAX_WINDOWS) windows.values.removeIf { now - it.since >= WINDOW_MILLISECONDS }
        // Every key is a live credential, so a full table means real load: the oldest window makes room.
        if (windows.size >= MAX_WINDOWS && key !in windows) windows.remove(windows.keys.first())
        val window = windows.getOrPut(key) { Window(now) }
        if (now - window.since >= WINDOW_MILLISECONDS) {
            window.since = now
            window.count = 0
        }
        window.count++
        return window.count <= MAX_REQUESTS
    }

    companion object {
        const val MAX_REQUESTS = 600
        private const val WINDOW_MILLISECONDS = 60_000L
        private const val MAX_WINDOWS = 4096
    }
}
