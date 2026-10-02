package com.sprintique.ai.infrastructure

import com.sprintique.ai.application.ModelPort
import com.sprintique.ai.domain.AiProvider
import com.sprintique.ai.domain.Endpoint
import com.sprintique.ai.domain.ModelReply
import com.sprintique.ai.domain.ModelRequest
import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ProviderFailure
import com.sprintique.ai.domain.ToolCall
import com.sprintique.ai.domain.Turn
import com.sprintique.ai.domain.Usage
import com.sprintique.configuration.SprintiqueProperties
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.time.Duration
import java.util.UUID

/**
 * Calls providers in their native formats (docs/decisions/0005-ai-agents.md): Anthropic's Messages API with `tools`
 * and `tool_use` blocks; OpenAI's Chat Completions with `tools` and `tool_calls`, which every OpenAI-compatible
 * endpoint shares. A busy or failing provider (429, 5xx, a timeout, a lost connection) is retried twice with a
 * doubling pause, longer when it says Retry-After (at most half a minute). Keys travel only in headers.
 */
@Component
@Profile("api")
class HttpModelClient(private val json: JsonMapper, properties: SprintiqueProperties) : ModelPort {
    private val retryBase = properties.ai.retryBaseMillis
    private val http = GuardedHttp(
        properties.ai.allowedHosts.split(',').map { it.trim().lowercase() }.filter(String::isNotEmpty).toSet(),
        Duration.ofSeconds(properties.ai.timeoutSeconds.toLong()),
    )

    override fun reply(endpoint: Endpoint, request: ModelRequest): ModelReply = retrying { once(endpoint, request) }

    /**
     * A check is made while a person waits: one attempt per call and no pauses, so a busy provider answers «повторите
     * позже» at once instead of holding the request for minutes.
     */
    override fun check(endpoint: Endpoint, probeModel: String?): List<String> {
        try {
            return models(endpoint)
        } catch (error: ProviderException) {
            // Some compatible servers have no list of models: one token of a known model proves the key instead.
            if (error.failure != ProviderFailure.PROVIDER_NOT_FOUND || probeModel == null) throw error
        }
        once(endpoint, ModelRequest(probeModel, "", listOf(Turn.User("ping")), emptyList(), 1))
        return emptyList()
    }

    private fun once(endpoint: Endpoint, request: ModelRequest): ModelReply = when (endpoint.provider) {
        AiProvider.ANTHROPIC -> anthropic(endpoint, request)
        AiProvider.OPENAI, AiProvider.OPENAI_COMPATIBLE -> openAi(endpoint, request)
    }

    private fun models(endpoint: Endpoint): List<String> {
        val anthropic = endpoint.provider == AiProvider.ANTHROPIC
        val path = if (anthropic) anthropicPath(endpoint, "models?limit=100") else "models"
        val body = exchange(endpoint, url(endpoint, path), null)
        return body.path("data").values().mapNotNull { text(it.path("id")) }
            .filter { it.length in 1..MODEL_NAME }.distinct().take(MODEL_LIMIT)
    }

    private fun anthropic(endpoint: Endpoint, request: ModelRequest): ModelReply {
        val messages = request.turns.map { turn ->
            when (turn) {
                is Turn.User -> mapOf("role" to "user", "content" to turn.text)

                is Turn.Assistant -> mapOf(
                    "role" to "assistant",
                    "content" to buildList {
                        if (turn.text.isNotBlank() || turn.calls.isEmpty()) {
                            add(mapOf("type" to "text", "text" to turn.text.ifBlank { "…" }))
                        }
                        turn.calls.forEach {
                            add(
                                mapOf(
                                    "type" to "tool_use", "id" to it.id, "name" to it.name,
                                    "input" to arguments(it),
                                ),
                            )
                        }
                    },
                )

                is Turn.Tools -> mapOf(
                    "role" to "user",
                    "content" to turn.results.map {
                        mapOf(
                            "type" to "tool_result", "tool_use_id" to it.callId, "content" to it.content,
                            "is_error" to it.error,
                        )
                    },
                )
            }
        }
        val body = linkedMapOf<String, Any?>(
            "model" to request.model, "max_tokens" to request.maxOutputTokens,
            "messages" to messages,
        )
        if (request.system.isNotEmpty()) body["system"] = request.system
        if (request.tools.isNotEmpty()) {
            body["tools"] =
                request.tools.map {
                    mapOf(
                        "name" to it.name, "description" to it.description,
                        "input_schema" to it.schema,
                    )
                }
        }
        val answer = exchange(endpoint, url(endpoint, anthropicPath(endpoint, "messages")), body)
        val content = answer.path("content")
        if (!content.isArray) throw ProviderException(ProviderFailure.PROVIDER_RESPONSE_INVALID)
        val text = content.values().filter { text(it.path("type")) == "text" }.mapNotNull { text(it.path("text")) }
        val calls = content.values().filter { text(it.path("type")) == "tool_use" }.map {
            val input = json.writeValueAsString(it.path("input"))
            ToolCall(text(it.path("id")) ?: newId(), text(it.path("name")) ?: "", input)
        }
        val usage = answer.path("usage")
        val tokens = Usage(count(usage.path("input_tokens")), count(usage.path("output_tokens")), null)
        return ModelReply(text.joinToString("\n"), calls, tokens)
    }

    private fun openAi(endpoint: Endpoint, request: ModelRequest): ModelReply {
        val messages = buildList {
            if (request.system.isNotEmpty()) add(mapOf("role" to "system", "content" to request.system))
            for (turn in request.turns) {
                when (turn) {
                    is Turn.User -> add(mapOf("role" to "user", "content" to turn.text))

                    is Turn.Assistant -> add(
                        linkedMapOf<String, Any?>(
                            "role" to "assistant",
                            "content" to turn.text.ifEmpty {
                                null
                            },
                        ).apply {
                            if (turn.calls.isNotEmpty()) {
                                put(
                                    "tool_calls",
                                    turn.calls.map {
                                        mapOf(
                                            "id" to it.id, "type" to "function",
                                            "function" to mapOf("name" to it.name, "arguments" to it.arguments),
                                        )
                                    },
                                )
                            }
                        },
                    )

                    is Turn.Tools -> turn.results.forEach {
                        add(
                            mapOf(
                                "role" to "tool", "tool_call_id" to it.callId,
                                "content" to it.content,
                            ),
                        )
                    }
                }
            }
        }
        // OpenAI's own API wants max_completion_tokens (its reasoning models refuse max_tokens); compatible servers
        // know max_tokens.
        val limit = if (endpoint.provider == AiProvider.OPENAI) "max_completion_tokens" else "max_tokens"
        val body = linkedMapOf<String, Any?>(
            "model" to request.model, "messages" to messages,
            limit to request.maxOutputTokens,
        )
        if (request.tools.isNotEmpty()) {
            body["tools"] = request.tools.map {
                mapOf(
                    "type" to "function",
                    "function" to mapOf("name" to it.name, "description" to it.description, "parameters" to it.schema),
                )
            }
        }
        val answer = exchange(endpoint, url(endpoint, "chat/completions"), body)
        val message = answer.path("choices").path(0).path("message")
        if (!message.isObject) throw ProviderException(ProviderFailure.PROVIDER_RESPONSE_INVALID)
        val calls = message.path("tool_calls").values().map { call ->
            val function = call.path("function")
            val arguments = function.path("arguments")
            ToolCall(
                text(call.path("id")) ?: newId(),
                text(function.path("name")) ?: "",
                text(arguments) ?: if (arguments.isObject) json.writeValueAsString(arguments) else "{}",
            )
        }
        val usage = answer.path("usage")
        // OpenRouter reports the cost of the call in dollars (credits).
        val cost = usage.path("cost").takeIf {
            it.isNumber
        }?.doubleValue()?.takeIf { it >= 0 }?.let { (it * MICROS).toLong() }
        val tokens = Usage(count(usage.path("prompt_tokens")), count(usage.path("completion_tokens")), cost)
        return ModelReply(text(message.path("content")) ?: "", calls, tokens)
    }

    /** One request: the provider's answer as JSON, or a coded failure; nothing of an error body is kept. */
    private fun exchange(endpoint: Endpoint, uri: URI, body: Map<String, Any?>?): JsonNode {
        val headers = linkedMapOf("Accept" to "application/json")
        if (body != null) headers["Content-Type"] = "application/json"
        if (endpoint.provider == AiProvider.ANTHROPIC) {
            headers["x-api-key"] = endpoint.apiKey
            headers["anthropic-version"] = ANTHROPIC_VERSION
        } else {
            headers["Authorization"] = "Bearer ${endpoint.apiKey}"
        }
        val reply = http.send(uri, headers, body?.let(json::writeValueAsBytes))
        failureOf(reply.status)?.let { throw ProviderException(it, reply.retryAfterSeconds) }
        return runCatching { json.readTree(reply.body) }.getOrNull()?.takeIf { it.isObject }
            ?: throw ProviderException(ProviderFailure.PROVIDER_RESPONSE_INVALID)
    }

    /** What an HTTP status means for the caller; null for success. */
    private fun failureOf(status: Int): ProviderFailure? = when (status) {
        in SUCCESS -> null
        401, 403 -> ProviderFailure.PROVIDER_AUTH
        404 -> ProviderFailure.PROVIDER_NOT_FOUND
        REQUEST_TIMEOUT -> ProviderFailure.PROVIDER_TIMEOUT
        429 -> ProviderFailure.PROVIDER_RATE_LIMIT
        in SERVER_ERRORS -> ProviderFailure.PROVIDER_UNAVAILABLE
        else -> ProviderFailure.PROVIDER_REJECTED
    }

    private fun <T> retrying(block: () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (error: ProviderException) {
                attempt++
                if (!error.failure.retryable || attempt >= ATTEMPTS) throw error
                val doubling = retryBase shl (attempt - 1)
                val asked = (error.retryAfterSeconds ?: 0).coerceAtMost(MAX_RETRY_AFTER) * MILLIS
                try {
                    Thread.sleep(maxOf(doubling, asked))
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw error
                }
            }
        }
    }

    private fun url(endpoint: Endpoint, path: String): URI = URI(endpoint.baseUrl.trimEnd('/') + "/" + path)

    /** Anthropic's base address is the host (`https://api.anthropic.com`); one that already ends in /v1 is accepted. */
    private fun anthropicPath(
        endpoint: Endpoint,
        path: String,
    ) = if (endpoint.baseUrl.trimEnd('/').endsWith("/v1")) path else "v1/$path"

    private fun arguments(call: ToolCall): JsonNode =
        runCatching { json.readTree(call.arguments) }.getOrNull()?.takeIf { it.isObject } ?: json.createObjectNode()

    private fun text(node: JsonNode): String? = if (node.isString) node.asString() else null

    private fun count(node: JsonNode): Int =
        if (node.isIntegralNumber) node.longValue().coerceIn(0, Int.MAX_VALUE.toLong()).toInt() else 0

    private fun newId() = "call_" + UUID.randomUUID().toString().replace("-", "")

    private companion object {
        const val ANTHROPIC_VERSION = "2023-06-01"
        const val REQUEST_TIMEOUT = 408
        val SUCCESS = 200..299
        val SERVER_ERRORS = 500..599
        const val ATTEMPTS = 3
        const val MAX_RETRY_AFTER = 30L
        const val MILLIS = 1000L
        const val MICROS = 1_000_000.0
        const val MODEL_NAME = 200
        const val MODEL_LIMIT = 200
    }
}
