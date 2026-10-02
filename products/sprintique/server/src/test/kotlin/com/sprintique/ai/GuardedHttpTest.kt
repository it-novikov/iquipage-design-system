package com.sprintique.ai

import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ProviderFailure
import com.sprintique.ai.infrastructure.GuardedHttp
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.ConnectException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

class GuardedHttpTest {
    private val servers = mutableListOf<ServerSocket>()

    @AfterEach
    fun close() = servers.forEach(ServerSocket::close)

    private fun failure(block: () -> Unit) =
        assertThatThrownBy(block).isInstanceOf(ProviderException::class.java)
            .extracting { (it as ProviderException).failure }

    @Test
    fun `the address that was judged is the one connected to, so a rebinding name cannot lead inside`() {
        val lookups = CopyOnWriteArrayList<String>()
        val connected = CopyOnWriteArrayList<InetSocketAddress>()
        // A hostile name server: public on the first answer, loopback on every later one.
        val resolve = { host: String ->
            lookups += host
            listOf(InetAddress.getByName(if (lookups.size == 1) "93.184.216.34" else "127.0.0.1"))
        }
        val http = GuardedHttp(emptySet(), Duration.ofSeconds(2), resolve, connect = { address, _ ->
            connected += address
            throw ConnectException("refused")
        })
        failure { http.send(URI("https://rebind.example/v1/models"), emptyMap(), null) }
            .isEqualTo(ProviderFailure.PROVIDER_UNREACHABLE)
        assertThat(lookups).containsExactly("rebind.example")
        assertThat(connected.map { it.address.hostAddress to it.port }).containsExactly("93.184.216.34" to 443)
    }

    @Test
    fun `a name with one private address is refused before any connection`() {
        val connected = CopyOnWriteArrayList<InetSocketAddress>()
        val resolve = { _: String ->
            listOf(InetAddress.getByName("8.8.8.8"), InetAddress.getByName("169.254.169.254"))
        }
        val http = GuardedHttp(emptySet(), Duration.ofSeconds(2), resolve, connect = { address, _ ->
            connected += address
            Socket()
        })
        failure { http.send(URI("https://metadata.example/v1"), emptyMap(), null) }
            .isEqualTo(ProviderFailure.PROVIDER_ADDRESS_BLOCKED)
        failure { http.send(URI("https://[::ffff:a9fe:a9fe]/v1"), emptyMap(), null) }
            .isEqualTo(ProviderFailure.PROVIDER_ADDRESS_BLOCKED)
        assertThat(connected).isEmpty()
    }

    @Test
    fun `answers are read by length or in chunks, and the request carries its headers and body`() {
        val seen = CopyOnWriteArrayList<String>()
        val url = serve(seen) { request ->
            if (request.contains("/sized")) {
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"a\":\"bcd\"}"
            } else {
                "HTTP/1.1 100 Continue\r\n\r\n" +
                    "HTTP/1.1 429 Too Many\r\nRetry-After: 7\r\nTransfer-Encoding: chunked\r\n\r\n" +
                    "4\r\n{\"a\"\r\n6;x=y\r\n:\"bcd\"\r\n1\r\n}\r\n0\r\nTrailer: z\r\n\r\n"
            }
        }
        val http = GuardedHttp(setOf("127.0.0.1"), Duration.ofSeconds(2))
        val sized = http.send(URI("$url/sized"), mapOf("x-api-key" to "sk-test-1"), "{}".toByteArray())
        assertThat(sized.status).isEqualTo(200)
        assertThat(String(sized.body)).isEqualTo("{\"a\":\"bcd\"}")
        assertThat(seen.single()).startsWith("POST /sized HTTP/1.1\r\n").contains("\r\nx-api-key: sk-test-1\r\n")
            .contains("\r\nContent-Length: 2\r\n").endsWith("\r\n\r\n{}")
        val chunked = http.send(URI("$url/chunked?limit=1"), emptyMap(), null)
        assertThat(chunked.status).isEqualTo(429)
        assertThat(chunked.retryAfterSeconds).isEqualTo(7)
        assertThat(String(chunked.body)).isEqualTo("{\"a\":\"bcd\"}")
        assertThat(seen.last()).startsWith("GET /chunked?limit=1 HTTP/1.1\r\n")
    }

    @Test
    fun `a redirect, an oversized answer and a silent server end with their codes`() {
        val url = serve { request ->
            when {
                request.contains("/moved") -> "HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/\r\n\r\n"
                request.contains("/huge") -> "HTTP/1.1 200 OK\r\nContent-Length: 3000000\r\n\r\n"
                request.contains("/endless") -> "HTTP/1.1 200 OK\r\n\r\n" + "x".repeat(2 * 1024 * 1024 + 10)
                else -> null
            }
        }
        val http = GuardedHttp(setOf("127.0.0.1"), Duration.ofMillis(700))
        failure { http.send(URI("$url/moved"), emptyMap(), null) }.isEqualTo(ProviderFailure.PROVIDER_REDIRECT)
        failure { http.send(URI("$url/huge"), emptyMap(), null) }
            .isEqualTo(ProviderFailure.PROVIDER_RESPONSE_TOO_LARGE)
        failure { http.send(URI("$url/endless"), emptyMap(), null) }
            .isEqualTo(ProviderFailure.PROVIDER_RESPONSE_TOO_LARGE)
        val started = System.nanoTime()
        failure { http.send(URI("$url/silent"), emptyMap(), null) }.isEqualTo(ProviderFailure.PROVIDER_TIMEOUT)
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(3))
    }

    @Test
    fun `a header that could split the request is never sent`() {
        val http = GuardedHttp(setOf("127.0.0.1"), Duration.ofSeconds(1), connect = { _, _ -> error("not reached") })
        failure { http.send(URI("http://127.0.0.1:9/v1"), mapOf("x-api-key" to "sk\r\nHost: evil"), null) }
            .isEqualTo(ProviderFailure.PROVIDER_REJECTED)
    }

    /** A loopback server that answers each request with what [answer] says, or stays silent for null. */
    private fun serve(seen: MutableList<String> = mutableListOf(), answer: (String) -> String?): String {
        val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        servers += server
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val socket = try {
                    server.accept()
                } catch (_: IOException) {
                    break
                }
                thread(isDaemon = true) { socket.use { respond(it, seen, answer) } }
            }
        }
        return "http://127.0.0.1:${server.localPort}"
    }

    private fun respond(socket: Socket, seen: MutableList<String>, answer: (String) -> String?) {
        val input = socket.getInputStream()
        val head = StringBuilder()
        while (!head.endsWith("\r\n\r\n")) head.append(input.read().takeIf { it >= 0 }?.toChar() ?: return)
        val length = Regex("(?i)\r\ncontent-length: (\\d+)").find(head)?.groupValues?.get(1)?.toInt() ?: 0
        val request = head.toString() + String(input.readNBytes(length))
        seen += request
        val reply = answer(request)
        if (reply == null) {
            Thread.sleep(5_000)
            return
        }
        runCatching {
            socket.getOutputStream().write(reply.toByteArray(Charsets.ISO_8859_1))
            socket.getOutputStream().flush()
        }
    }
}
