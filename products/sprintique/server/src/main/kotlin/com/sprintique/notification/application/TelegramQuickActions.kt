package com.sprintique.notification.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.notification.domain.CallbackCheck
import com.sprintique.notification.domain.InlineButton
import com.sprintique.notification.domain.QuickAction
import com.sprintique.notification.domain.TelegramCallbacks
import com.sprintique.notification.domain.TelegramMessages
import com.sprintique.notification.infrastructure.TelegramBotApi
import com.sprintique.problem.ProblemException
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * Buttons under the bot's messages and replies to them (docs/decisions/0007-notification-channels.md). A press is
 * honoured only when its signed data is intact and fresh, the chat is still linked to an enabled person, and that
 * person may still do it ([NotificationActions] checks rights and state as for any of their writes). The same press
 * twice gives the first result. After an action the message's buttons show what was done. A reply to a message about
 * a mention becomes a message in that thread, from the linked person. Logs carry outcomes only.
 */
@Component
@Profile("api")
class TelegramQuickActions(
    private val properties: SprintiqueProperties,
    private val database: Database,
    private val actions: NotificationActions,
    private val channels: NotificationChannels,
) {
    private val log = LoggerFactory.getLogger(TelegramQuickActions::class.java)
    private val telegram get() = properties.telegram
    private val callbacks = telegram.botToken.takeIf { telegram.isConfigured }?.let(::TelegramCallbacks)
    private val editor: TelegramEditor? =
        telegram.botToken.takeIf { telegram.isConfigured }?.let { TelegramBotApi(telegram.apiBase, it) }

    /** The «Отключить почту» button for a person who just linked a chat and still gets letters, or null. */
    fun mailOffButton(tx: Transaction, chat: Long): List<List<InlineButton>>? {
        val signer = callbacks ?: return null
        if (!channels.emailAvailable) return null
        val person = personOf(tx, chat) ?: return null
        val id = runCatching { UUID.fromString(person) }.getOrNull() ?: return null
        actAs(tx, person)
        val gets = tx.row(
            """
            SELECT p.email IS NOT NULL AND coalesce(n.email_enabled, true) AS gets
            FROM auth.principals p LEFT JOIN app.notification_preferences n ON n.principal_id = p.id WHERE p.id = $1
            """.trimIndent(),
            person,
        )?.boolean("gets") == true
        if (!gets) return null
        return listOf(listOf(InlineButton(TelegramMessages.MAIL_OFF, data = signer.sign(null, id, Instant.now()))))
    }

    /** A button press: the answer Telegram shows (answerCallbackQuery); the buttons change after an action. */
    fun press(callback: JsonNode): Map<String, Any?>? {
        val queryId = callback.get("id")?.takeIf { it.isString }?.asString() ?: return null
        val message = callback.get("message")?.takeIf { it.isObject }
        val chat = message?.get("chat")?.takeIf { it.get("type")?.asString() == "private" }
            ?.get("id")?.takeIf { it.isIntegralNumber }?.asLong()
        val data = callback.get("data")?.takeIf { it.isString }?.asString()
        if (chat == null || data == TelegramCallbacks.NOTHING) return answer(queryId, null)
        val signer = callbacks ?: return answer(queryId, TelegramMessages.BUTTON_INVALID)
        val (text, done) = when (val check = signer.check(data, Instant.now())) {
            CallbackCheck.Invalid -> TelegramMessages.BUTTON_INVALID to false
            CallbackCheck.Expired -> TelegramMessages.BUTTON_EXPIRED to false
            is CallbackCheck.Valid -> act(chat, check)
        }
        log.info("Telegram button: done={}", done)
        if (done) {
            val messageId = message.get("message_id")?.takeIf { it.isIntegralNumber }?.asLong()
            if (messageId != null) editor?.editButtons(chat, messageId, resultRows(message, "$text ✓"))
        }
        return answer(queryId, if (done) "$text ✓" else text)
    }

    /**
     * A text that replies to one of the bot's messages: when that message carried a «Ответить» button of a mention,
     * the text goes into the mention's thread. The answer is a message for the chat, or null when it was no reply.
     */
    fun reply(chat: Long, message: JsonNode, text: String): String? {
        val original = message.get("reply_to_message")?.takeIf { it.isObject } ?: return null
        val signer = callbacks ?: return null
        val now = Instant.now()
        val target = buttonsOf(original).mapNotNull { it.get("callback_data")?.takeIf(JsonNode::isString)?.asString() }
            .map { signer.check(it, now) }
            .filterIsInstance<CallbackCheck.Valid>()
            .firstOrNull { it.action == QuickAction.REPLY } ?: return TelegramMessages.REPLY_NOWHERE
        val messageId = message.get("message_id")?.takeIf { it.isIntegralNumber }?.asLong() ?: return null
        val input = QuickActionInput(text = text)
        val (answer, done) = perform(chat, target.subject, QuickAction.REPLY, input, "tg-r-$chat-$messageId")
        log.info("Telegram reply: done={}", done)
        return if (done) TelegramMessages.REPLY_SENT else answer
    }

    private fun act(chat: Long, check: CallbackCheck.Valid): Pair<String, Boolean> {
        val action = check.action
        if (action == QuickAction.REPLY) return TelegramMessages.REPLY_HINT to false
        if (action == null) {
            return database.transaction { tx ->
                val person = personOf(tx, chat)
                when {
                    person == null -> TelegramMessages.NOT_LINKED to false

                    person != check.subject.toString() -> TelegramMessages.BUTTON_FOREIGN to false

                    else -> {
                        tx.row("SELECT app.turn_off_email_notifications($1) AS done", person)
                        TelegramMessages.MAIL_OFF_DONE to true
                    }
                }
            }
        }
        return perform(chat, check.subject, action, QuickActionInput(), "tg-${action.code}-${check.subject}")
    }

    /** One action as the linked person, in its own transaction: a refusal rolls back whatever it began. */
    private fun perform(
        chat: Long,
        notification: UUID,
        action: QuickAction,
        input: QuickActionInput,
        key: String,
    ): Pair<String, Boolean> = try {
        database.transaction { tx ->
            val person = personOf(tx, chat) ?: return@transaction TelegramMessages.NOT_LINKED to false
            val name = tx.row("SELECT name FROM auth.principals WHERE id = $1", person)!!.string("name")
            actAs(tx, person)
            val actor = Actor(
                id = person,
                name = name,
                kind = PrincipalKind.HUMAN,
                credentialId = ProjectAccess.TELEGRAM_PREFIX + chat,
                csrf = null,
                projectId = null,
                capabilities = emptySet(),
                initiatorId = person,
                credentialKind = CredentialKind.TELEGRAM,
            )

            @Suppress("UNCHECKED_CAST")
            val result = actions.perform(tx, actor, notification.toString(), action, input, key) as Map<String, Any?>
            (result["result"] as? String ?: "Готово") to true
        }
    } catch (refused: ProblemException) {
        (refused.message ?: TelegramMessages.BUTTON_INVALID) to false
    }

    private fun personOf(tx: Transaction, chat: Long): String? =
        tx.row("SELECT app.telegram_chat_person($1) AS person", chat)?.stringOrNull("person")

    /** Rows of the request run as the linked person, like a signed-in request (row security reads the actor). */
    private fun actAs(tx: Transaction, person: String) {
        tx.row(
            """
            SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', '', true),
                   set_config('app.initiator_id', $1, true)
            """.trimIndent(),
            person,
        )
    }

    private fun buttonsOf(message: JsonNode): List<JsonNode> =
        message.path("reply_markup").path("inline_keyboard").values().flatMap { it.values() }.toList()

    /** The message's link buttons stay; the buttons that acted become one line that says what was done. */
    private fun resultRows(message: JsonNode, text: String): List<List<InlineButton>> {
        val links = message.path("reply_markup").path("inline_keyboard").values().map { row ->
            row.values().mapNotNull { button ->
                button.get("url")?.takeIf {
                    it.isString
                }?.asString()?.let { InlineButton(button.path("text").asString(), url = it) }
            }
        }.filter { it.isNotEmpty() }.toList()
        return listOf(listOf(InlineButton(text, data = TelegramCallbacks.NOTHING))) + links
    }

    private fun answer(queryId: String, text: String?): Map<String, Any?> =
        linkedMapOf<String, Any?>("method" to "answerCallbackQuery", "callback_query_id" to queryId).apply {
            if (text != null) put("text", text)
        }
}
