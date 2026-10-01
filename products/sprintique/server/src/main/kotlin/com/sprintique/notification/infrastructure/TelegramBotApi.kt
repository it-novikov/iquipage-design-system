package com.sprintique.notification.infrastructure

import com.sprintique.notification.application.SendResult
import com.sprintique.notification.application.TelegramPort
import tools.jackson.core.JacksonException
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * `sendMessage` of the Telegram Bot API over HTTPS. The token is part of the request path, so neither the URL nor an
 * exception message ever leaves this class; results carry status codes only.
 */
class TelegramBotApi(apiBase: String, private val token: String) : TelegramPort {
    private val base = apiBase.removeSuffix("/")
    private val json = JsonMapper.builder().build()
    private val client = HttpClient.newBuilder()
        .connectTimeout(TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()

    override fun send(chatId: Long, html: String, button: Pair<String, String>?): SendResult {
        val body = linkedMapOf<String, Any>(
            "chat_id" to chatId,
            "text" to html,
            "parse_mode" to "HTML",
            "link_preview_options" to mapOf("is_disabled" to true),
        )
        if (button != null) {
            body["reply_markup"] =
                mapOf("inline_keyboard" to listOf(listOf(mapOf("text" to button.first, "url" to button.second))))
        }
        val request = HttpRequest.newBuilder(URI("$base/bot$token/sendMessage"))
            .timeout(TIMEOUT)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
            .build()
        val response = try {
            client.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (_: IOException) {
            return SendResult.Unavailable("NETWORK")
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            return SendResult.Unavailable("INTERRUPTED")
        }
        return resultOf(response.statusCode(), response.body())
    }

    private fun resultOf(status: Int, text: String): SendResult {
        val answer = try {
            json.readTree(text)
        } catch (_: JacksonException) {
            null
        }
        return when {
            status == OK && answer?.path("ok")?.asBoolean() == true -> SendResult.Sent

            status == TOO_MANY -> SendResult.RetryAfter(
                answer?.path("parameters")?.path("retry_after")?.asInt(DEFAULT_WAIT)?.coerceIn(1, MAX_WAIT)
                    ?: DEFAULT_WAIT,
            )

            status == FORBIDDEN -> SendResult.Blocked

            status >= SERVER_ERROR -> SendResult.Unavailable("TELEGRAM_$status")

            else -> SendResult.Rejected("TELEGRAM_$status")
        }
    }

    override fun toString(): String = "TelegramBotApi($base)"

    private companion object {
        val TIMEOUT: Duration = Duration.ofSeconds(10)
        const val OK = 200
        const val FORBIDDEN = 403
        const val TOO_MANY = 429
        const val SERVER_ERROR = 500
        const val DEFAULT_WAIT = 30
        const val MAX_WAIT = 3600
    }
}
