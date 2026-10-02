package com.sprintique.notification.domain

import java.time.LocalDate

/**
 * One-click answers to a notification, in the bell and under a Telegram message
 * (docs/decisions/0007-notification-channels.md). Each is an ordinary write of the person (tasks, requests,
 * discussions), with the same permission checks; [code] is its letter in a Telegram button's signed data.
 */
enum class QuickAction(val wire: String, val code: Char) {
    /** An assignment: the task moves to «В работе». */
    TAKE("take", 't'),

    /** A review request: resolved as accepted. */
    ACCEPT("accept", 'a'),

    /** A review request: the task goes back to «В работе» and the request is resolved. */
    RETURN("return", 'b'),

    /** A deadline: the due date moves a day on, or to the chosen date. */
    POSTPONE("postpone", 'p'),

    /** A mention: a reply in the same thread. */
    REPLY("reply", 'r'),
    ;

    companion object {
        fun fromWire(value: String?): QuickAction? = entries.firstOrNull { it.wire == value }

        fun fromCode(value: Char): QuickAction? = entries.firstOrNull { it.code == value }

        /** The date «Перенести» moves to: the day after today, or after the due date when that is later. */
        fun postponed(due: LocalDate?, today: LocalDate): LocalDate =
            if (due == null || !due.isAfter(today)) today.plusDays(1) else due.plusDays(1)
    }
}

/** The words of quick actions: button labels and the result shown after one. */
object QuickActionText {
    fun label(action: QuickAction, due: LocalDate? = null, today: LocalDate? = null): String = when (action) {
        QuickAction.TAKE -> "Взять в работу"

        QuickAction.ACCEPT -> "Принять"

        QuickAction.RETURN -> "Вернуть"

        QuickAction.REPLY -> "Ответить"

        QuickAction.POSTPONE -> {
            val target = today?.let { QuickAction.postponed(due, it) }
            if (target == null || target == today.plusDays(1)) {
                "Перенести на завтра"
            } else {
                "Перенести на ${NotificationText.dayMonth(target)}"
            }
        }
    }

    fun done(action: QuickAction, due: LocalDate? = null): String = when (action) {
        QuickAction.TAKE -> "Взято в работу"
        QuickAction.ACCEPT -> "Принято"
        QuickAction.RETURN -> "Возвращено в работу"
        QuickAction.REPLY -> "Ответ отправлен"
        QuickAction.POSTPONE -> due?.let { "Срок перенесён на ${NotificationText.dayMonth(it)}" } ?: "Срок перенесён"
    }
}
