package com.sprintique.ai.domain

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI

/**
 * Where an AI connection may send a request (server-side request forgery). A base address is `https://` on a public
 * host; a host the server's operator listed (a local vLLM or Ollama) may also be plain `http://` and private. Every
 * address the host resolves to must be public: not loopback, link-local (cloud metadata), private, carrier-grade NAT,
 * unique-local, multicast or reserved. The address is checked again right before every request.
 */
object AddressPolicy {
    private const val MIN_URL = 10
    private const val MAX_URL = 500
    private const val FIRST_PRINTABLE = 0x20

    /** A base address as it is stored: scheme, host, optional port and path, no query, fragment or user part. */
    fun normalize(value: String): String? {
        val text = value.trim().trimEnd('/')
        if (text.length !in MIN_URL..MAX_URL || text.any { it.isWhitespace() || it.code < FIRST_PRINTABLE }) return null
        val uri = runCatching { URI(text) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        return text.takeIf {
            (scheme == "https" || scheme == "http") && !uri.host.isNullOrEmpty() && uri.rawUserInfo == null &&
                uri.rawQuery == null && uri.rawFragment == null && !uri.isOpaque
        }
    }

    /** Whether the operator listed this host (or this host and port) for private or plain-HTTP connections. */
    fun allowed(uri: URI, allowedHosts: Set<String>): Boolean {
        val host = uri.host?.lowercase()?.removePrefix("[")?.removeSuffix("]") ?: return false
        val port = if (uri.port == -1) (if (uri.scheme == "https") 443 else 80) else uri.port
        return host in allowedHosts || "$host:$port" in allowedHosts
    }

    /** The reason a request to [uri] may not be sent, or null when it may; [resolve] looks the host up. */
    @Suppress("ReturnCount")
    fun check(uri: URI, allowedHosts: Set<String>, resolve: (String) -> List<InetAddress>): ProviderFailure? {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") return ProviderFailure.PROVIDER_INSECURE_URL
        if (uri.host.isNullOrEmpty() || uri.rawUserInfo != null) return ProviderFailure.PROVIDER_UNREACHABLE
        if (allowed(uri, allowedHosts)) return null
        if (scheme != "https") return ProviderFailure.PROVIDER_INSECURE_URL
        val addresses = resolve(uri.host.removePrefix("[").removeSuffix("]"))
        if (addresses.isEmpty()) return ProviderFailure.PROVIDER_UNREACHABLE
        return if (addresses.all(::isPublic)) null else ProviderFailure.PROVIDER_ADDRESS_BLOCKED
    }

    fun isPublic(address: InetAddress): Boolean = when (address) {
        is Inet4Address -> isPublicV4(address.address)
        is Inet6Address -> isPublicV6(address.address)
        else -> false
    }

    @Suppress("CyclomaticComplexMethod", "MagicNumber")
    private fun isPublicV4(b: ByteArray): Boolean {
        val a0 = b[0].toInt() and 0xff
        val a1 = b[1].toInt() and 0xff
        val a2 = b[2].toInt() and 0xff
        return when {
            a0 == 0 || a0 == 10 || a0 == 127 -> false

            // Carrier-grade NAT 100.64.0.0/10, link-local 169.254.0.0/16 (cloud metadata), private 172.16.0.0/12.
            a0 == 100 && a1 in 64..127 -> false

            a0 == 169 && a1 == 254 -> false

            a0 == 172 && a1 in 16..31 -> false

            // IETF protocol assignments 192.0.0.0/24, documentation 192.0.2.0/24, private 192.168.0.0/16.
            a0 == 192 && a1 == 0 && (a2 == 0 || a2 == 2) -> false

            a0 == 192 && a1 == 168 -> false

            // The former 6to4 relay anycast 192.88.99.0/24.
            a0 == 192 && a1 == 88 && a2 == 99 -> false

            // Benchmarking 198.18.0.0/15, documentation 198.51.100.0/24 and 203.0.113.0/24.
            a0 == 198 && (a1 == 18 || a1 == 19) -> false

            a0 == 198 && a1 == 51 && a2 == 100 -> false

            a0 == 203 && a1 == 0 && a2 == 113 -> false

            // Multicast, reserved and broadcast: 224.0.0.0 and above.
            a0 >= 224 -> false

            else -> true
        }
    }

    @Suppress("MagicNumber")
    private fun isPublicV6(b: ByteArray): Boolean {
        embeddedV4(b)?.let { return isPublicV4(it) }
        val first = b[0].toInt() and 0xff
        val second = b[1].toInt() and 0xff
        val third = b[2].toInt() and 0xff
        val fourth = b[3].toInt() and 0xff
        // Only global unicast 2000::/3 is public; within it, documentation 2001:db8::/32 is not, nor the IETF protocol
        // assignments 2001::/23: Teredo 2001::/32 (an obfuscated IPv4 address inside), benchmarking and ORCHID.
        val documentation = first == 0x20 && second == 0x01 && third == 0x0d && fourth == 0xb8
        val protocol = first == 0x20 && second == 0x01 && (third and 0xfe) == 0
        return first and 0xe0 == 0x20 && !documentation && !protocol
    }

    /**
     * The IPv4 address an IPv6 address carries, judged in its place: mapped ::ffff:0:0/96, compatible ::/96, NAT64
     * 64:ff9b::/96 and 6to4 2002::/16.
     */
    @Suppress("MagicNumber", "ComplexCondition")
    private fun embeddedV4(b: ByteArray): ByteArray? {
        val first = b[0].toInt() and 0xff
        val second = b[1].toInt() and 0xff
        return when {
            b.sliceArray(0 until 10).all { it.toInt() == 0 } && (b[10].toInt() and 0xff) == 0xff &&
                (b[11].toInt() and 0xff) == 0xff -> b.sliceArray(12 until 16)

            b.sliceArray(0 until 12).all { it.toInt() == 0 } -> b.sliceArray(12 until 16)

            first == 0x00 && second == 0x64 && (b[2].toInt() and 0xff) == 0xff && (b[3].toInt() and 0xff) == 0x9b &&
                b.sliceArray(4 until 12).all { it.toInt() == 0 } -> b.sliceArray(12 until 16)

            first == 0x20 && second == 0x02 -> b.sliceArray(2 until 6)

            else -> null
        }
    }
}
