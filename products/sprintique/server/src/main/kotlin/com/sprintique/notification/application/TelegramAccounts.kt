package com.sprintique.notification.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.TelegramCommand
import com.sprintique.notification.domain.TelegramMessages
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode

/** Per kind: whether it goes to Telegram. */
data class TelegramChoice(val assigned: Boolean, val mention: Boolean, val request: Boolean, val deadline: Boolean) {
    val muted: List<String>
        get() = buildList {
            if (!assigned) add(NotificationKind.ASSIGNED.wire)
            if (!mention) add(NotificationKind.MENTION.wire)
            if (!request) add(NotificationKind.REQUEST.wire)
            if (!deadline) add(NotificationKind.DEADLINE.wire)
        }
}

/**
 * A person's Telegram: their notification settings, the one-time link that opens the bot, unlinking, the project
 * switch, and the bot's webhook (docs/decisions/0006-notifications-telegram.md). Without configuration the feature
 * does not exist: the settings say so and every command that needs the bot answers 404.
 */
@Component
@Profile("api")
class TelegramAccounts(private val properties: SprintiqueProperties, private val database: Database) {
    private val log = LoggerFactory.getLogger(TelegramAccounts::class.java)
    private val telegram get() = properties.telegram

    val isAvailable: Boolean get() = telegram.isConfigured

    fun settings(tx: Transaction, actor: Actor): Map<String, Any?> {
        Notifications.requireHuman(actor)
        val connection = tx.row(
            "SELECT username, linked_at AS \"linkedAt\" FROM app.telegram_connections WHERE principal_id = $1",
            actor.id,
        )
        val muted = tx.row(
            "SELECT telegram_muted AS muted FROM app.notification_preferences WHERE principal_id = $1",
            actor.id,
        )?.strings("muted").orEmpty()
        return linkedMapOf(
            "telegram" to linkedMapOf(
                "available" to isAvailable,
                "botUsername" to telegram.botUsername.takeIf { isAvailable },
                "connection" to connection?.takeIf { isAvailable }?.let {
                    linkedMapOf(
                        "username" to it.stringOrNull("username"),
                        "linkedAt" to it.instant("linkedAt").toString(),
                    )
                },
            ),
            "preferences" to linkedMapOf(
                "telegram" to NotificationKind.entries.associate { it.wire to (it.wire !in muted) },
            ),
        )
    }

    fun changePreferences(tx: Transaction, actor: Actor, choice: TelegramChoice): Map<String, Any?> {
        Notifications.requireHuman(actor)
        ProjectAccess.requireActiveCredential(tx, actor)
        tx.update(
            """
            INSERT INTO app.notification_preferences(principal_id, telegram_muted) VALUES ($1, $2::text[])
            ON CONFLICT (principal_id) DO UPDATE SET telegram_muted = EXCLUDED.telegram_muted,
                revision = app.notification_preferences.revision + 1, updated_at = clock_timestamp()
            """.trimIndent(),
            actor.id,
            choice.muted,
        )
        return settings(tx, actor)
    }

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
            INSERT INTO app.telegram_link_tokens(token_sha256, principal_id, expires_at)
            VALUES ($1, $2, clock_timestamp() + interval '15 minutes') RETURNING expires_at AS "expiresAt"
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
        return settings(tx, actor)
    }

    fun project(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> =
        Notifications.projectTelegram(tx, actor, projectId, isAvailable)

    /** The project switch, with the project settings permission and the revision the person saw. */
    fun changeProject(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        enabled: Boolean,
        baseRevision: Long,
    ): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.PROJECT_SETTINGS)
        val current = tx.row("SELECT revision FROM app.telegram_project_settings WHERE project_id = $1", projectId)
        requireCondition((current?.long("revision") ?: 0L) == baseRevision, 409, "CONFLICT", "Настройка уже изменена.")
        tx.update(
            """
            INSERT INTO app.telegram_project_settings(project_id, enabled, updated_by) VALUES ($1, $2, $3)
            ON CONFLICT (project_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by,
                revision = app.telegram_project_settings.revision + 1, updated_at = clock_timestamp()
            """.trimIndent(),
            projectId,
            enabled,
            actor.id,
        )
        return project(tx, actor, projectId)
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
