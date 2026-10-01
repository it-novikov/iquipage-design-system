package com.sprintique.notification.domain

/** A command a person sent to the bot in a private chat. */
sealed interface TelegramCommand {
    /** `/start <token>` from the link in Sprintique; the token is null when the chat was opened without one. */
    data class Start(val token: String?) : TelegramCommand

    data object Stop : TelegramCommand

    data object Other : TelegramCommand

    companion object {
        private val START = Regex("^/start(?:@[A-Za-z0-9_]{1,64})?(?:\\s+(\\S{1,128}))?\\s*$")
        private val STOP = Regex("^/stop(?:@[A-Za-z0-9_]{1,64})?\\s*$")

        fun parse(text: String?): TelegramCommand {
            val value = text?.trim().orEmpty()
            START.matchEntire(value)?.let { return Start(it.groupValues[1].ifEmpty { null }) }
            return if (STOP.matches(value)) Stop else Other
        }
    }
}

/** The bot's own answers to commands. Notifications themselves are [TelegramDigest]. */
object TelegramMessages {
    private const val SETTINGS = "Sprintique → Настройки → Уведомления"
    const val LINKED = "Готово: уведомления Sprintique будут приходить сюда."
    const val EXPIRED = "Ссылка устарела. Откройте $SETTINGS и подключите Telegram снова."
    const val INVALID = "Ссылка недействительна. Откройте $SETTINGS и подключите Telegram снова."
    const val HELLO = "Это бот уведомлений Sprintique. Чтобы подключить его, откройте $SETTINGS."
    const val STOPPED = "Уведомления Sprintique отключены. Подключить снова можно в $SETTINGS."
    const val NOT_LINKED = "Этот чат не подключён к Sprintique."

    /** After linking, when letters go to the account's address too: one button turns them off. */
    const val LINKED_WITH_MAIL = "Готово: уведомления Sprintique будут приходить сюда. Письма на почту тоже " +
        "продолжат приходить. Если Telegram достаточно, отключите их кнопкой ниже."
    const val MAIL_OFF = "Отключить почту"
    const val MAIL_OFF_DONE = "Письма отключены"
    const val BUTTON_INVALID = "Кнопка недействительна."
    const val BUTTON_EXPIRED = "Кнопка устарела. Откройте задачу в Sprintique."
    const val BUTTON_FOREIGN = "Эта кнопка не для аккаунта, подключённого к этому чату."
    const val REPLY_HINT = "Ответьте на это сообщение, и ответ появится в обсуждении задачи."
    const val REPLY_SENT = "Ответ отправлен в обсуждение."
    const val REPLY_NOWHERE = "Ответить в обсуждение можно на сообщение об упоминании."
}
