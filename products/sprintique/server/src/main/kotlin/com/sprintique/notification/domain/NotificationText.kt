package com.sprintique.notification.domain

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** What a notification is about. The wire names are the database's and the preferences'. */
enum class NotificationKind(val wire: String) {
    ASSIGNED("assigned"),
    MENTION("mention"),
    REQUEST("request"),
    DEADLINE("deadline"),
    ;

    companion object {
        fun fromWire(value: String): NotificationKind? = entries.firstOrNull { it.wire == value }
    }
}

/** The facts a sentence is made of: the kind, the task's key, the codes and dates of the notification's detail. */
data class NotificationFacts(
    val kind: NotificationKind,
    val actorName: String?,
    val taskKey: String,
    val requestKind: String? = null,
    val due: LocalDate? = null,
    /** The day the sentence is read against: «сегодня», «завтра». */
    val today: LocalDate? = null,
)

/**
 * The sentence a person reads, in the bell, in letters and in Telegram (docs/decisions/0007-notification-channels.md):
 * written like a colleague would say it, in the past tense and without a gendered verb, with the task's key in it —
 * «Вас назначили исполнителем задачи SPR-26». Who did it is shown apart, on a quieter line ([author]). Rows keep no
 * text, so the sentence is made when it is shown.
 */
object NotificationText {
    private val RUSSIAN = Locale.forLanguageTag("ru")
    private val DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMMM", RUSSIAN)

    fun sentence(facts: NotificationFacts): String {
        val key = facts.taskKey
        return when (facts.kind) {
            NotificationKind.ASSIGNED -> "Вас назначили исполнителем задачи $key"
            NotificationKind.MENTION -> "Вас упомянули в обсуждении задачи $key"
            NotificationKind.REQUEST -> "Вас попросили ${request(facts.requestKind, key)}"
            NotificationKind.DEADLINE -> deadline(key, facts.due, facts.today)
        }
    }

    /** Who caused it, short («Анна К.»); none for a deadline. */
    fun author(facts: NotificationFacts): String? =
        if (facts.kind == NotificationKind.DEADLINE) null else shortName(facts.actorName)

    private fun request(kind: String?, key: String) = when (kind) {
        "review" -> "проверить задачу $key"
        "answer" -> "ответить в обсуждении задачи $key"
        "decision" -> "принять решение по задаче $key"
        "approval" -> "утвердить план задачи $key"
        "do" -> "сделать задачу $key"
        else -> "посмотреть задачу $key"
    }

    private fun deadline(key: String, due: LocalDate?, today: LocalDate?): String = when {
        due == null -> "Срок задачи $key скоро"
        today == null -> "Срок задачи $key — ${DAY_MONTH.format(due)}"
        due == today -> "Срок задачи $key — сегодня, ${DAY_MONTH.format(due)}"
        due == today.plusDays(1) -> "Срок задачи $key — завтра, ${DAY_MONTH.format(due)}"
        due.isBefore(today) -> "Срок задачи $key прошёл ${DAY_MONTH.format(due)}"
        else -> "Срок задачи $key — ${DAY_MONTH.format(due)}"
    }

    /** «Анна Кузнецова» reads «Анна К.»; one word stays as it is. */
    fun shortName(name: String?): String {
        val words = name.orEmpty().trim().split(Regex("\\s+")).filter(String::isNotEmpty)
        return when {
            words.isEmpty() -> "Участник"
            words.size == 1 -> words[0]
            else -> "${words[0]} ${words[1].first()}."
        }
    }

    fun dayMonth(date: LocalDate): String = DAY_MONTH.format(date)
}
