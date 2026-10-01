package com.sprintique.notification.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.notification.domain.TelegramCommand
import com.sprintique.notification.domain.TelegramMessages
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode

/**
 * A person's Telegram: the one-time link that opens the bot, unlinking, and the bot's webhook
 * (docs/decisions/0006-notifications-telegram.md). Without configuration the feature does not exist: the settings
 * say so and every command that needs the bot answers 404. What goes where is [NotificationChannels].
 */
@Component
@Profile("api")
class TelegramAccounts(
    private val properties: SprintiqueProperties,
    private val database: Database,
    private val channels: NotificationChannels,
) {
    private val log = LoggerFactory.getLogger(TelegramAccounts::class.java)
    private val telegram get() = properties.telegram

    val isAvailable: Boolean get() = telegram.isConfigured

    /**
     * A one-time link to the bot: `https://t.me/<bot>?start=<token>`. Only the token's SHA-256 is stored, for 15
     * minutes; at most five links a quarter of an hour per person.
     */
    fun startLink(tx: Transaction, actor: Actor): Map<String, Any?> {
        Notifications.requireHuman(actor)
        ProjectAccess.requireInteractive(actor)
        requireAvailable()
        ProjectAccess.requireActiveCredential(tx, actor)
        val recent = tx.row(
            """
            SELECT count(*)::int AS count FROM app.telegram_link_tokens
            WHERE principal_id = $1 AND created_at > clock_timestamp() - interval '15 minutes'
            """.trimIndent(),
            actor.id,
        )!!.int("count")
        requireCondition(
            recent < LINKS_PER_WINDOW,
            429,
            "TELEGRAM_LINK_LIMIT",
            "Слишком много ссылок. Повторите позже.",
        )
        val token = Tokens.random()
        val expiresAt = tx.row(
            """
            WITH moment AS (SELECT clock_timestamp() AS at)
            INSERT INTO app.telegram_link_tokens(token_sha256, principal_id, created_at, expires_at)
            SELECT $1, $2, at, at + interval '15 minutes' FROM moment RETURNING expires_at AS "expiresAt"
            """.trimIndent(),
            Tokens.sha256Hex(token),
            actor.id,
        )!!.instant("expiresAt")
        return linkedMapOf(
            "url" to "https://t.me/${telegram.botUsername}?start=$token",
            "expiresAt" to expiresAt.toString(),
        )
    }

    fun disconnect(tx: Transaction, actor: Actor): Map<String, Any?> {
        Notifications.requireHuman(actor)
        ProjectAccess.requireActiveCredential(tx, actor)
        tx.update("DELETE FROM app.telegram_connections WHERE principal_id = $1", actor.id)
        return channels.settings(tx, actor)
    }

    /** Whether a webhook request carries the configured secret; compared in constant time. */
    fun acceptsSecret(header: String?): Boolean =
        isAvailable && header != null && Tokens.equalsInConstantTime(header, telegram.webhookSecret)

    /**
     * One update from Telegram, once per `update_id`. Only private text messages matter: `/start <token>` links the
     * chat, `/stop` unlinks it. The answer is a Bot API method for Telegram to perform (a reply), or null.
     */
    fun handle(update: JsonNode): Map<String, Any?>? {
        val id = update.get("update_id")?.takeIf { it.isIntegralNumber }?.asLong() ?: return null
        val message = update.get("message")?.takeIf { it.isObject } ?: return null
        val chat = message.get("chat")?.takeIf { it.isObject } ?: return null
        val chatId = chat.get("id")?.takeIf { it.isIntegralNumber }?.asLong() ?: return null
        if (chat.get("type")?.asString() != "private") return null
        val text = message.get("text")?.takeIf { it.isString }?.asString()
        val handle = message.get("from")?.get("username")?.takeIf { it.isString }?.asString()?.takeIf(USERNAME::matches)
        val reply = database.transaction { tx ->
            val fresh = tx.row("SELECT app.telegram_accept_update($1) AS fresh", id)!!.boolean("fresh")
            if (!fresh) return@transaction null
            when (val command = TelegramCommand.parse(text)) {
                is TelegramCommand.Start -> link(tx, command.token, chatId, handle)

                TelegramCommand.Stop -> {
                    val removed = tx.row("SELECT app.telegram_unlink_chat($1) AS removed", chatId)!!.boolean("removed")
                    if (removed) TelegramMessages.STOPPED else TelegramMessages.NOT_LINKED
                }

                TelegramCommand.Other -> null
            }
        } ?: return null
        return linkedMapOf("method" to "sendMessage", "chat_id" to chatId, "text" to reply)
    }

    private fun link(tx: Transaction, token: String?, chatId: Long, handle: String?): String {
        if (token == null) return TelegramMessages.HELLO
        if (!TOKEN.matches(token)) return TelegramMessages.INVALID
        val outcome = tx.row(
            "SELECT app.telegram_link_chat($1, $2, $3) AS outcome",
            Tokens.sha256Hex(token),
            chatId,
            handle,
        )!!.string("outcome")
        // The outcome only: never the token, the chat or the person.
        log.info("Telegram link: {}", outcome)
        return when (outcome) {
            "linked" -> TelegramMessages.LINKED
            "expired" -> TelegramMessages.EXPIRED
            else -> TelegramMessages.INVALID
        }
    }

    private fun requireAvailable() =
        requireCondition(isAvailable, 404, "TELEGRAM_UNAVAILABLE", "Уведомления в Telegram не настроены.")

    private companion object {
        const val LINKS_PER_WINDOW = 5
        val TOKEN = Regex("^[A-Za-z0-9_-]{43}$")
        val USERNAME = Regex("^[A-Za-z0-9_]{1,64}$")
    }
}
