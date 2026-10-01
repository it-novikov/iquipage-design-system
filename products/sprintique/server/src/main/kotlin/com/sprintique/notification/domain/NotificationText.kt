package com.sprintique.notification.domain

import java.time.LocalDate
import java.time.format.DateTimeFormatter

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

/** The facts a line is made of: who, which task, and the codes and dates of the notification's detail. */
data class NotificationFacts(
    val kind: NotificationKind,
    val actorName: String?,
    val taskTitle: String,
    val requestKind: String? = null,
    val due: LocalDate? = null,
    val raisedOn: LocalDate? = null,
)

/**
 * The one line a person reads, in the product and in Telegram: «Анна К. назначил(а) вам «Граф связей»». It is made
 * from the task as it is now, so a renamed task reads with its new name; rows keep no text.
 */
object NotificationText {
    private const val TITLE_LIMIT = 80
    private val SHORT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM")

    fun line(facts: NotificationFacts): String {
        val who = shortName(facts.actorName)
        val task = quoted(facts.taskTitle)
        return when (facts.kind) {
            NotificationKind.ASSIGNED -> "$who назначил(а) вам $task"
            NotificationKind.MENTION -> "$who упомянул(а) вас в $task"
            NotificationKind.REQUEST -> "$who просит ${requestVerb(facts.requestKind, task)}"
            NotificationKind.DEADLINE -> "Срок $task — ${dueLabel(facts.due, facts.raisedOn)}"
        }
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

    fun quoted(title: String): String {
        val clean = title.replace(Regex("\\s+"), " ").trim()
        val cut = if (clean.length > TITLE_LIMIT) clean.take(TITLE_LIMIT - 1).trimEnd() + "…" else clean
        return "«$cut»"
    }

    private fun requestVerb(kind: String?, task: String) = when (kind) {
        "review" -> "проверить $task"
        "answer" -> "ответить в $task"
        "decision" -> "принять решение в $task"
        "approval" -> "утвердить план в $task"
        "do" -> "сделать $task"
        else -> "посмотреть $task"
    }

    private fun dueLabel(due: LocalDate?, raisedOn: LocalDate?): String = when {
        due == null -> "скоро"
        raisedOn != null && due == raisedOn -> "сегодня"
        raisedOn != null && due == raisedOn.plusDays(1) -> "завтра"
        else -> due.format(SHORT_DATE)
    }
}
