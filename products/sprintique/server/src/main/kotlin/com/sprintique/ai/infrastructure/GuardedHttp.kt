package com.sprintique.ai.infrastructure

import com.sprintique.ai.domain.AddressPolicy
import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ProviderFailure
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI
import java.net.UnknownHostException
import java.time.Duration
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * Outgoing HTTP to AI providers, with the guards of docs/decisions/0005-ai-agents.md: the host is resolved once per
 * request, every address it resolves to is judged (AddressPolicy: public unless the operator listed the host), and the
 * connection goes to one of exactly those addresses, so a name that answers differently a moment later (DNS rebinding)
 * cannot lead the request inside. TLS checks the certificate against the host name (SNI and endpoint identification).
 * Redirects are never followed; the answer must begin within the timeout and end a few seconds later, and its size is
 * limited. Failures carry a code, never what the provider said, an address or a key.
 *
 * It speaks HTTP/1.1 with `Connection: close` over a socket of its own: the JDK client resolves names itself and
 * offers no way to pin the address it connects to.
 */
class GuardedHttp(
    private val allowedHosts: Set<String>,
    private val timeout: Duration,
    private val resolve: (String) -> List<InetAddress> = { host -> InetAddress.getAllByName(host).toList() },
    private val connect: (InetSocketAddress, Int) -> Socket = ::plainSocket,
    private val tls: () -> SSLSocketFactory = { SSLContext.getDefault().socketFactory },
) {
    class Reply(val status: Int, val body: ByteArray, val retryAfterSeconds: Long?)

    // A failure keeps only its code: the cause may carry the address or what the provider said.
    @Suppress("ThrowsCount", "SwallowedException")
    fun send(uri: URI, headers: Map<String, String>, body: ByteArray?): Reply {
        val host = uri.host?.removePrefix("[")?.removeSuffix("]").orEmpty()
        val addresses = if (host.isEmpty()) emptyList() else lookUp(host)
        // The very addresses judged here are the ones connected to below: the name is not looked up again.
        AddressPolicy.check(uri, allowedHosts) { addresses }?.let { throw ProviderException(it) }
        if (headers.any { (name, value) -> !TOKEN.matches(name) || value.any { it.code < SPACE || it.code == DEL } }) {
            throw ProviderException(ProviderFailure.PROVIDER_REJECTED)
        }
        val secure = uri.scheme.equals("https", ignoreCase = true)
        val port = if (uri.port == -1) defaultPort(secure) else uri.port
        val start = System.nanoTime()
        val head = start + timeout.toNanos()
        val end = head + BODY_GRACE.toNanos()
        return try {
            open(addresses, port, head).use { raw ->
                val socket = if (secure) secure(raw, host, port, head) else raw
                socket.use { exchange(it, Target(uri, host, port, secure), headers, body, head, end) }
            }
        } catch (error: ProviderException) {
            throw error
        } catch (_: SocketTimeoutException) {
            throw ProviderException(ProviderFailure.PROVIDER_TIMEOUT)
        } catch (_: TooLarge) {
            throw ProviderException(ProviderFailure.PROVIDER_RESPONSE_TOO_LARGE)
        } catch (_: Malformed) {
            throw ProviderException(ProviderFailure.PROVIDER_RESPONSE_INVALID)
        } catch (_: IOException) {
            throw ProviderException(ProviderFailure.PROVIDER_UNREACHABLE)
        }
    }

    @Suppress("SwallowedException")
    private fun lookUp(host: String): List<InetAddress> = try {
        resolve(host)
    } catch (_: UnknownHostException) {
        emptyList()
    } catch (_: SecurityException) {
        emptyList()
    }

    /** The first of the judged addresses that accepts a connection in time. */
    private fun open(addresses: List<InetAddress>, port: Int, deadline: Long): Socket {
        var last: IOException? = null
        for (address in addresses.take(MAX_ADDRESSES)) {
            try {
                val wait = minOf(remaining(deadline), CONNECT_TIMEOUT.toMillis().toInt())
                return connect(InetSocketAddress(address, port), wait)
            } catch (error: IOException) {
                last = error
            }
        }
        throw last ?: IOException("no address")
    }

    /** TLS over the pinned connection, with the certificate checked against the host name. */
    private fun secure(raw: Socket, host: String, port: Int, deadline: Long): Socket {
        val socket = tls().createSocket(raw, host, port, true) as SSLSocket
        val parameters = socket.sslParameters
        parameters.endpointIdentificationAlgorithm = "HTTPS"
        runCatching { SNIHostName(host) }.getOrNull()?.let { parameters.serverNames = listOf(it) }
        socket.sslParameters = parameters
        socket.soTimeout = minOf(remaining(deadline), CONNECT_TIMEOUT.toMillis().toInt())
        socket.startHandshake()
        return socket
    }

    private class Target(val uri: URI, val host: String, val port: Int, val secure: Boolean)

    /** The request, then the answer: its head before [head], its body before [end] (both System.nanoTime). */
    @Suppress("LongParameterList")
    private fun exchange(
        socket: Socket,
        target: Target,
        headers: Map<String, String>,
        body: ByteArray?,
        head: Long,
        end: Long,
    ): Reply {
        val uri = target.uri
        val path = (uri.rawPath?.takeIf(String::isNotEmpty) ?: "/") + (uri.rawQuery?.let { "?$it" } ?: "")
        val authority = (if (target.host.contains(':')) "[${target.host}]" else target.host) +
            (if (target.port == defaultPort(target.secure)) "" else ":${target.port}")
        val request = StringBuilder()
            .append(if (body == null) "GET" else "POST").append(' ').append(path).append(" HTTP/1.1\r\n")
            .append("Host: ").append(authority).append("\r\n")
            .append("Connection: close\r\n")
            .append("Accept-Encoding: identity\r\n")
            .append("User-Agent: Sprintique\r\n")
        headers.forEach { (name, value) -> request.append(name).append(": ").append(value).append("\r\n") }
        if (body != null) request.append("Content-Length: ").append(body.size).append("\r\n")
        request.append("\r\n")
        socket.soTimeout = remaining(head)
        val output = socket.getOutputStream()
        output.write(request.toString().toByteArray(Charsets.ISO_8859_1))
        if (body != null) output.write(body)
        output.flush()
        val input = Deadlined(socket, socket.getInputStream().buffered(), head)
        var status = statusOf(line(input))
        var fields = fields(input)
        // Interim answers (100 Continue, 103 Early Hints) are followed by the real one.
        while (status in INTERIM) {
            status = statusOf(line(input))
            fields = fields(input)
        }
        if (status in REDIRECTS) throw ProviderException(ProviderFailure.PROVIDER_REDIRECT)
        input.deadline = end
        val content = when {
            status == NO_CONTENT || status == NOT_MODIFIED -> ByteArray(0)
            fields["transfer-encoding"]?.lowercase()?.contains("chunked") == true -> chunked(input)
            fields["content-length"] != null -> sized(input, fields.getValue("content-length"))
            else -> untilClose(input)
        }
        return Reply(status, content, fields["retry-after"]?.trim()?.toLongOrNull())
    }

    private fun statusOf(line: String): Int {
        val parts = line.split(' ', limit = 3)
        if (parts.size < 2 || !parts[0].startsWith("HTTP/1.")) throw Malformed()
        return parts[1].toIntOrNull()?.takeIf { it in STATUSES } ?: throw Malformed()
    }

    private fun fields(input: InputStream): Map<String, String> {
        val fields = linkedMapOf<String, String>()
        var total = 0
        while (true) {
            val line = line(input)
            if (line.isEmpty()) return fields
            total += line.length
            if (total > HEADER_LIMIT || fields.size > HEADER_COUNT) throw TooLarge()
            val colon = line.indexOf(':')
            if (colon <= 0) throw Malformed()
            val name = line.substring(0, colon).trim().lowercase()
            val value = line.substring(colon + 1).trim()
            val earlier = fields[name]
            // Two lengths that disagree are refused (RFC 9112); other repeated fields are joined.
            if (name == "content-length" && earlier != null && earlier != value) throw Malformed()
            fields[name] = if (earlier == null || name == "content-length") value else "$earlier, $value"
        }
    }

    private fun sized(input: InputStream, length: String): ByteArray {
        val size = length.toLongOrNull()?.takeIf { it >= 0 } ?: throw Malformed()
        if (size > RESPONSE_LIMIT) throw TooLarge()
        val bytes = input.readNBytes(size.toInt())
        if (bytes.size.toLong() != size) throw Malformed()
        return bytes
    }

    private fun untilClose(input: InputStream): ByteArray {
        val bytes = input.readNBytes(RESPONSE_LIMIT + 1)
        if (bytes.size > RESPONSE_LIMIT) throw TooLarge()
        return bytes
    }

    @Suppress("ThrowsCount")
    private fun chunked(input: InputStream): ByteArray {
        val buffer = ByteArrayOutputStream()
        while (true) {
            val size = line(input).substringBefore(';').trim().toIntOrNull(HEX)?.takeIf { it >= 0 } ?: throw Malformed()
            if (size == 0) break
            if (buffer.size() + size > RESPONSE_LIMIT) throw TooLarge()
            val bytes = input.readNBytes(size)
            if (bytes.size != size) throw Malformed()
            buffer.write(bytes)
            if (line(input).isNotEmpty()) throw Malformed()
        }
        // Trailer fields, if any, end with an empty line.
        var trailers = 0
        while (line(input).isNotEmpty()) if (++trailers > HEADER_COUNT) throw TooLarge()
        return buffer.toByteArray()
    }

    /** One line of the head, without its line end; a line longer than the head limit is refused. */
    private fun line(input: InputStream): String {
        val bytes = ByteArrayOutputStream()
        while (true) {
            val next = input.read()
            if (next == -1) throw Malformed()
            if (next == '\n'.code) break
            bytes.write(next)
            if (bytes.size() > HEADER_LIMIT) throw TooLarge()
        }
        return bytes.toString(Charsets.ISO_8859_1).removeSuffix("\r")
    }

    /** Each read waits at most until the deadline: the one of the head, then the one of the body. */
    private class Deadlined(private val socket: Socket, private val input: InputStream, var deadline: Long) :
        InputStream() {
        override fun read(): Int {
            socket.soTimeout = remaining(deadline)
            return input.read()
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            socket.soTimeout = remaining(deadline)
            return input.read(buffer, offset, length)
        }
    }

    private class TooLarge : IOException("response too large")

    private class Malformed : IOException("malformed response")

    private companion object {
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(10)
        val BODY_GRACE: Duration = Duration.ofSeconds(5)
        const val RESPONSE_LIMIT = 2 * 1024 * 1024
        const val HEADER_LIMIT = 64 * 1024
        const val HEADER_COUNT = 200
        const val MAX_ADDRESSES = 4
        const val HTTPS_PORT = 443
        const val HTTP_PORT = 80
        const val HEX = 16
        const val SPACE = 0x20
        const val DEL = 0x7f
        const val NO_CONTENT = 204
        const val NOT_MODIFIED = 304
        const val NANOS_PER_MILLI = 1_000_000L
        val INTERIM = 100..199
        val REDIRECTS = 300..399
        val STATUSES = 100..599
        val TOKEN = Regex("^[A-Za-z0-9!#$%&'*+.^_`|~-]+$")

        fun defaultPort(secure: Boolean) = if (secure) HTTPS_PORT else HTTP_PORT

        /** Milliseconds left until [deadline] for a socket timeout; at least 1, since 0 would mean forever. */
        fun remaining(deadline: Long): Int {
            val left = (deadline - System.nanoTime()) / NANOS_PER_MILLI
            if (left <= 0) throw SocketTimeoutException("deadline")
            return left.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        }

        fun plainSocket(address: InetSocketAddress, millis: Int): Socket {
            val socket = Socket()
            try {
                socket.connect(address, millis)
            } catch (error: IOException) {
                socket.close()
                throw error
            }
            return socket
        }
    }
}
