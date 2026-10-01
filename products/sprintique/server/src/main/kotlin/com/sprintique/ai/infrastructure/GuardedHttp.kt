package com.sprintique.ai.infrastructure

import com.sprintique.ai.domain.AddressPolicy
import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ProviderFailure
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException
import java.nio.ByteBuffer
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ExecutionException
import java.util.concurrent.Flow
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Outgoing HTTP to AI providers, with the guards of docs/decisions/0005-ai-agents.md: the address is checked before
 * every request (AddressPolicy: public HTTPS unless the operator listed the host), redirects are never followed, the
 * whole exchange has a deadline and the answer a size limit. Failures carry a code, never what the provider said.
 */
class GuardedHttp(
    private val allowedHosts: Set<String>,
    private val timeout: Duration,
    private val resolve: (String) -> List<InetAddress> = { host -> InetAddress.getAllByName(host).toList() },
) {
    class Reply(val status: Int, val body: ByteArray, val retryAfterSeconds: Long?)

    private val client: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(CONNECT_TIMEOUT)
        .build()

    // A failure keeps only its code: the cause may carry the address or what the provider said.
    @Suppress("ThrowsCount", "SwallowedException")
    fun send(uri: URI, headers: Map<String, String>, body: ByteArray?): Reply {
        val refused = AddressPolicy.check(uri, allowedHosts) { host ->
            try {
                resolve(host)
            } catch (_: UnknownHostException) {
                emptyList()
            }
        }
        if (refused != null) throw ProviderException(refused)
        val builder = HttpRequest.newBuilder(uri).timeout(timeout)
        headers.forEach(builder::header)
        if (body == null) builder.GET() else builder.POST(HttpRequest.BodyPublishers.ofByteArray(body))
        val future = client.sendAsync(builder.build()) { Limited(RESPONSE_LIMIT) }
        val response = try {
            future.get(timeout.plus(BODY_GRACE).toMillis(), TimeUnit.MILLISECONDS)
        } catch (_: TimeoutException) {
            future.cancel(true)
            throw ProviderException(ProviderFailure.PROVIDER_TIMEOUT)
        } catch (_: InterruptedException) {
            future.cancel(true)
            Thread.currentThread().interrupt()
            throw ProviderException(ProviderFailure.PROVIDER_TIMEOUT)
        } catch (error: ExecutionException) {
            throw ProviderException(failureOf(error.cause))
        }
        if (response.statusCode() in REDIRECTS) throw ProviderException(ProviderFailure.PROVIDER_REDIRECT)
        val retryAfter = response.headers().firstValue("Retry-After").orElse(null)?.trim()?.toLongOrNull()
        return Reply(response.statusCode(), response.body(), retryAfter)
    }

    private fun failureOf(cause: Throwable?): ProviderFailure = when (cause) {
        is TooLarge -> ProviderFailure.PROVIDER_RESPONSE_TOO_LARGE
        is HttpTimeoutException -> ProviderFailure.PROVIDER_TIMEOUT
        is IOException -> ProviderFailure.PROVIDER_UNREACHABLE
        else -> ProviderFailure.PROVIDER_UNREACHABLE
    }

    private class TooLarge : IOException("response too large")

    /** Collects the body up to [limit] bytes and fails beyond it, cancelling the transfer. */
    private class Limited(private val limit: Int) : HttpResponse.BodySubscriber<ByteArray> {
        private val result = CompletableFuture<ByteArray>()
        private val buffer = ByteArrayOutputStream()
        private var subscription: Flow.Subscription? = null

        override fun getBody(): CompletionStage<ByteArray> = result

        override fun onSubscribe(subscription: Flow.Subscription) {
            this.subscription = subscription
            subscription.request(Long.MAX_VALUE)
        }

        override fun onNext(items: List<ByteBuffer>) {
            if (result.isDone) return
            for (item in items) {
                if (buffer.size() + item.remaining() > limit) {
                    subscription?.cancel()
                    result.completeExceptionally(TooLarge())
                    return
                }
                val bytes = ByteArray(item.remaining())
                item.get(bytes)
                buffer.write(bytes)
            }
        }

        override fun onError(throwable: Throwable) {
            result.completeExceptionally(throwable)
        }

        override fun onComplete() {
            result.complete(buffer.toByteArray())
        }
    }

    private companion object {
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(10)
        val BODY_GRACE: Duration = Duration.ofSeconds(5)
        const val RESPONSE_LIMIT = 2 * 1024 * 1024
        val REDIRECTS = 300..399
    }
}
