package com.sprintique.notification.application

import com.sprintique.database.Database
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailPort
import com.sprintique.identity.application.MailUnavailableException
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.notification.domain.DigestItem
import com.sprintique.notification.domain.DigestLinks
import com.sprintique.notification.domain.EmailDigest
import com.sprintique.notification.domain.LinkButton
import com.sprintique.notification.domain.NotificationDigest
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.TelegramDigest
import com.sprintique.notification.domain.UnsubscribeTokens
import org.slf4j.LoggerFactory
import tools.jackson.databind.JsonNode
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException

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

/** Sends one message to a chat: HTML text and buttons that open links. */
fun interface TelegramPort {
    fun send(chatId: Long, html: String, buttons: List<LinkButton>): SendResult
}

/** How long a channel's first waiting item waits for others, in seconds. */
data class BatchWindows(val telegramSeconds: Int, val emailSeconds: Int)

/**
 * The worker's side of notifications (docs/decisions/0007-notification-channels.md): raises deadline reminders and
 * sends batches, one message (split when long) or one letter per person and channel. The worker role only calls the
 * queue functions; the database decides what may still be sent, to which chat or address, and settles it. Logs carry
 * outcomes and codes, never chats, addresses, names or text.
 */
class NotificationDelivery(
    private val database: Database,
    private val telegram: TelegramPort?,
    private val mail: MailPort?,
    private val tokens: UnsubscribeTokens?,
    origin: String,
    private val windows: BatchWindows,
    private val mailDomain: String,
) {
    private val log = LoggerFactory.getLogger(NotificationDelivery::class.java)
    private val links = DigestLinks(origin)

    /** Telegram takes only HTTPS links in buttons and text links; without them the message is plain. */
    private val telegramLinks = links.takeIf { URI(origin).scheme == "https" }

    /** The channels this worker can send: Telegram with a bot token; e-mail with a transport and a link key. */
    val channels: List<String> = buildList {
        if (telegram != null) add(TELEGRAM)
        if (mail != null && tokens != null) add(EMAIL)
    }

    fun raiseDeadlines(): Int = database.transaction { tx ->
        tx.row("SELECT work.raise_due_notifications() AS raised")!!.int("raised")
    }

    /** Sends one batch; false when none was due. */
    fun deliverOne(): Boolean {
        if (channels.isEmpty()) return false
        val claimed = database.transaction { tx ->
            tx.row(
                "SELECT work.claim_notification_batch($1::text[], $2, $3) AS claimed",
                channels,
                windows.telegramSeconds,
                windows.emailSeconds,
            )!!.json("claimed")
        }
        if (claimed == null || claimed.isNull) return false
        val digest = NotificationDigest(items(claimed.path("items")), date(claimed.path("today").asString()))
        val outcome = when {
            digest.tasks.isEmpty() -> Outcome("failed", "NOTHING_LEFT")
            claimed.path("channel").asString() == TELEGRAM -> sendTelegram(claimed, digest)
            else -> sendEmail(claimed, digest)
        }
        val settled = database.transaction { tx ->
            tx.row(
                "SELECT work.settle_notification_batch($1, $2, $3, $4, $5, $6::uuid[]) AS ok",
                claimed.path("id").asString(),
                claimed.path("leaseToken").asString(),
                outcome.result,
                outcome.code,
                outcome.retryAfter,
                outcome.delivered,
            )!!.boolean("ok")
        }
        log.info(
            "Notification batch: channel={} items={} outcome={} code={} attempt={} settled={}",
            claimed.path("channel").asString(),
            claimed.path("items").size(),
            outcome.result,
            outcome.code,
            claimed.path("attempts").asInt(),
            settled,
        )
        return true
    }

    /** How an attempt ended, as the settle function takes it. */
    private data class Outcome(
        val result: String,
        val code: String? = null,
        val retryAfter: Int? = null,
        val delivered: List<String> = emptyList(),
    )

    /** The parts in order; a part Telegram accepted is settled as sent even when a later one fails. */
    private fun sendTelegram(claimed: JsonNode, digest: NotificationDigest): Outcome {
        val port = requireNotNull(telegram)
        val chat = claimed.path("chatId").asString().toLongOrNull() ?: return Outcome("failed", "NOT_LINKED")
        val delivered = mutableListOf<String>()
        for (part in TelegramDigest(telegramLinks).render(digest)) {
            val result = try {
                port.send(chat, part.html, part.buttons)
            } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
                SendResult.Unavailable(error.javaClass.simpleName.take(CODE_LIMIT))
            }
            stopped(result, delivered)?.let { return it }
            delivered += part.deliveryIds
        }
        return Outcome("sent", delivered = delivered)
    }

    /** How a part that Telegram did not accept ends the attempt; null when it was sent. */
    private fun stopped(result: SendResult, delivered: List<String>): Outcome? = when (result) {
        SendResult.Sent -> null
        SendResult.Blocked -> Outcome("blocked", "BOT_BLOCKED", delivered = delivered)
        is SendResult.RetryAfter -> Outcome("retry", "RATE_LIMITED", result.seconds, delivered)
        is SendResult.Rejected -> Outcome("failed", result.code, delivered = delivered)
        is SendResult.Unavailable -> Outcome("retry", result.code, delivered = delivered)
    }

    /**
     * One letter. Its Message-ID is the batch's, so a retry of the same batch is the same letter to the receiver;
     * the unsubscribe link is signed for this person (RFC 8058: List-Unsubscribe with One-Click).
     */
    private fun sendEmail(claimed: JsonNode, digest: NotificationDigest): Outcome {
        val port = requireNotNull(mail)
        val address = claimed.get("email")?.takeIf { it.isString }?.asString()?.let(EmailAddress::parse)
            ?: return Outcome("failed", "NO_ADDRESS")
        val token = requireNotNull(tokens).issue(claimed.path("recipientId").asString(), Instant.now())
        val unsubscribe = "${links.product}api/v1/notifications/unsubscribe?token=$token"
        val letter = EmailDigest(links, unsubscribe, windows.emailSeconds).render(digest)
        val message = MailMessage(
            to = address,
            subject = letter.subject,
            text = letter.text,
            html = letter.html,
            headers = mapOf(
                "List-Unsubscribe" to "<$unsubscribe>",
                "List-Unsubscribe-Post" to "List-Unsubscribe=One-Click",
                "X-Auto-Response-Suppress" to "All",
            ),
            messageId = "<notifications.${claimed.path("id").asString()}@$mailDomain>",
        )
        return try {
            port.send(message)
            Outcome("sent")
        } catch (error: MailUnavailableException) {
            if (error.permanent) Outcome("failed", "SMTP_REJECTED") else Outcome("retry", "SMTP_UNAVAILABLE")
        }
    }

    private fun items(nodes: JsonNode): List<DigestItem> = nodes.values().mapNotNull { node ->
        val kind = NotificationKind.fromWire(node.path("kind").asString()) ?: return@mapNotNull null
        val detail = node.path("detail")
        DigestItem(
            deliveryId = node.path("id").asString(),
            kind = kind,
            actorName = node.text("actorName"),
            taskKey = node.path("taskKey").asString(),
            taskTitle = node.path("taskTitle").asString(),
            projectSlug = node.path("projectSlug").asString(),
            projectName = node.path("projectName").asString(),
            requestKind = detail.text("requestKind"),
            due = detail.text("due")?.let(::dateOrNull),
            message = node.text("quote"),
        )
    }.toList()

    private fun JsonNode.text(name: String): String? = get(name)?.takeIf { it.isString }?.asString()

    private fun dateOrNull(value: String): LocalDate? = try {
        LocalDate.parse(value)
    } catch (_: DateTimeParseException) {
        null
    }

    private fun date(value: String): LocalDate = dateOrNull(value) ?: LocalDate.now()

    companion object {
        const val TELEGRAM = "telegram"
        const val EMAIL = "email"
        private const val CODE_LIMIT = 80
    }
}
