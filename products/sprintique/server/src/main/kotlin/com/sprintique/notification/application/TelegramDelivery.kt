package com.sprintique.notification.application

import com.sprintique.database.Database
import com.sprintique.notification.domain.NotificationFacts
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.NotificationText
import com.sprintique.notification.domain.TelegramMessages
import org.slf4j.LoggerFactory
import tools.jackson.databind.JsonNode
import java.net.URI
import java.net.URLEncoder
import java.time.LocalDate

/** What the Bot API said to one `sendMessage`. */
sealed interface SendResult {
    data object Sent : SendResult

    /** 429: wait at least this long. */
    data class RetryAfter(val seconds: Int) : SendResult

    /** 403 from a person who blocked the bot (or deleted the chat). */
    data object Blocked : SendResult

    /** A refusal that will not change on retry (400, 401, 404): the code is kept, never the text. */
    data class Rejected(val code: String) : SendResult

    /** A network failure or a server error: worth another attempt. */
    data class Unavailable(val code: String) : SendResult
}

/** Sends one message to a chat: HTML text and an optional button that opens a link. */
fun interface TelegramPort {
    fun send(chatId: Long, html: String, button: Pair<String, String>?): SendResult
}

/**
 * The worker's side of notifications: raises deadline reminders and sends queued Telegram messages. The worker role
 * only calls the queue functions; the database decides what may still be sent and to which chat
 * (docs/decisions/0006-notifications-telegram.md). Logs carry outcomes and codes, never chats, names or text.
 */
class TelegramDelivery(
    private val database: Database,
    private val telegram: TelegramPort?,
    private val origin: String,
) {
    private val log = LoggerFactory.getLogger(TelegramDelivery::class.java)

    fun raiseDeadlines(): Int = database.transaction { tx ->
        tx.row("SELECT work.raise_due_notifications() AS raised")!!.int("raised")
    }

    /** Sends one queued message; false when nothing was due (or Telegram is not configured for the worker). */
    fun deliverOne(): Boolean {
        val port = telegram ?: return false
        val claimed = database.transaction { tx ->
            tx.row("SELECT work.claim_telegram_delivery() AS claimed")!!.json("claimed")
        }
        if (claimed == null || claimed.isNull) return false
        val id = claimed.path("id").asString()
        val token = claimed.path("leaseToken").asString()
        val result = try {
            port.send(claimed.path("chatId").asString().toLong(), html(claimed), button(claimed))
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            SendResult.Unavailable(error.javaClass.simpleName.take(CODE_LIMIT))
        }
        val (outcome, code, retryAfter) = when (result) {
            SendResult.Sent -> Triple("sent", null, null)
            SendResult.Blocked -> Triple("blocked", "BOT_BLOCKED", null)
            is SendResult.RetryAfter -> Triple("retry", "RATE_LIMITED", result.seconds)
            is SendResult.Rejected -> Triple("failed", result.code, null)
            is SendResult.Unavailable -> Triple("retry", result.code, null)
        }
        val settled = database.transaction { tx ->
            tx.row(
                "SELECT work.settle_telegram_delivery($1, $2, $3, $4, $5) AS ok",
                id,
                token,
                outcome,
                code,
                retryAfter,
            )!!.boolean("ok")
        }
        val attempt = claimed.path("attempts").asInt()
        log.info("Telegram delivery: outcome={} code={} attempt={} settled={}", outcome, code, attempt, settled)
        return true
    }

    private fun html(claimed: JsonNode): String {
        val detail = claimed.path("detail")
        val facts = NotificationFacts(
            kind = requireNotNull(NotificationKind.fromWire(claimed.path("kind").asString())),
            actorName = claimed.get("actorName")?.takeIf { it.isString }?.asString(),
            taskTitle = claimed.path("taskTitle").asString(),
            requestKind = detail.get("requestKind")?.takeIf { it.isString }?.asString(),
            due = detail.get("due")?.takeIf { it.isString }?.asString()?.let(LocalDate::parse),
            raisedOn = detail.get("on")?.takeIf { it.isString }?.asString()?.let(LocalDate::parse),
        )
        return TelegramMessages.notification(
            NotificationText.line(facts),
            claimed.path("projectName").asString(),
            claimed.path("taskKey").asString(),
        )
    }

    /** «Открыть задачу» opens the task in its project; Telegram accepts only HTTPS links in buttons. */
    private fun button(claimed: JsonNode): Pair<String, String>? {
        if (URI(origin).scheme != "https") return null
        val slug = URLEncoder.encode(claimed.path("projectSlug").asString(), Charsets.UTF_8)
        val key = URLEncoder.encode(claimed.path("taskKey").asString(), Charsets.UTF_8)
        return TelegramMessages.OPEN_TASK to "$origin/?project=$slug#/task/$key"
    }

    private companion object {
        const val CODE_LIMIT = 80
    }
}
