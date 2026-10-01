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
}
