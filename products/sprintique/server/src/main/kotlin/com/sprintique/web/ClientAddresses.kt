package com.sprintique.web

import com.sprintique.configuration.SprintiqueProperties
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * The client address for per-address limits. Forwarding headers are trusted only as configured: a hop count, or the
 * exact proxy addresses. Without configuration the socket peer is the client, so spoofed headers change nothing.
 */
@Component
@Profile("api")
class ClientAddresses(properties: SprintiqueProperties) {
    private val hops: Int? = properties.trustProxy.toIntOrNull()
    private val proxies: Set<String> =
        if (hops ==
            null
        ) {
            properties.trustProxy.split(',').map(String::trim).filter(String::isNotEmpty).toSet()
        } else {
            emptySet()
        }

    fun of(request: HttpServletRequest): String {
        val peer = request.remoteAddr
        if (hops == null && proxies.isEmpty()) return peer
        val forwarded = request.getHeaders("X-Forwarded-For").toList().flatMap {
            it.split(',')
        }.map(String::trim).filter(String::isNotEmpty)
        val chain = listOf(peer) + forwarded.reversed()
        chain.forEachIndexed { hop, address ->
            val trusted = if (hops != null) hop < hops else address in proxies
            if (!trusted) return address
        }
        return chain.last()
    }
}
