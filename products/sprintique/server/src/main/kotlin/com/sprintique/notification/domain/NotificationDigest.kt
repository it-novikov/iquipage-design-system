package com.sprintique.notification.domain

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One item of a batch as the worker received it: the notification's codes and the task as it is now. */
data class DigestItem(
    val deliveryId: String,
    val kind: NotificationKind,
    val actorName: String?,
    val taskKey: String,
    val taskTitle: String,
    val projectSlug: String,
    val projectName: String,
    val requestKind: String? = null,
    val due: LocalDate? = null,
    /** The message a mention was made in, as written (Markdown); the reason quotes a short piece of it. */
    val message: String? = null,
)

/**
 * Why a task is in the batch: one short sentence under the task's title, the quoted words of a mention, and the same
 * reason as a headline that names the task («Аня К. назначает вам «…»»), for a batch of one.
 */
data class DigestReason(val text: String, val quote: String?, val headline: String, val deliveryIds: List<String>)

/** A task once, with every reason the batch holds for it. */
data class DigestTask(
    val key: String,
    val title: String,
    val projectSlug: String,
    val reasons: List<DigestReason>,
)

data class DigestProject(val name: String, val tasks: List<DigestTask>)

/**
 * A batch of notifications for one person, grouped by project and then by task in the order they happened. Several
 * updates about one task become one entry with all its reasons; a reason repeated word for word is said once
 * (docs/decisions/0007-notification-channels.md). Dates are read against [today] in the person's time zone.
 */
class NotificationDigest(items: List<DigestItem>, val today: LocalDate) {
    val projects: List<DigestProject> = items
        .groupBy { it.projectSlug }
        .map { (_, inProject) ->
            DigestProject(
                inProject.first().projectName,
                inProject.groupBy { it.taskKey }.map { (_, inTask) -> task(inTask) },
            )
        }

    val tasks: List<DigestTask> get() = projects.flatMap { it.tasks }

    /** The number of distinct reasons: what «5 новых» counts. */
    val reasonCount: Int get() = tasks.sumOf { it.reasons.size }

    /** One task with one reason: it reads as a single message. */
    val isSingle: Boolean get() = reasonCount == 1

    private fun task(items: List<DigestItem>): DigestTask {
        val first = items.first()
        val title = title(first.taskTitle)
        val reasons = items
            .groupBy { reason(it) }
            .map { (said, same) ->
                DigestReason(said.first, said.second, headline(same.first(), title), same.map(DigestItem::deliveryId))
            }
        return DigestTask(first.taskKey, title, first.projectSlug, reasons)
    }

    private fun headline(item: DigestItem, title: String): String {
        val who = NotificationText.shortName(item.actorName)
        val task = "«${DigestWords.cut(title, HEADLINE_TITLE)}»"
        return when (item.kind) {
            NotificationKind.ASSIGNED -> "$who назначает вам $task"
            NotificationKind.MENTION -> "$who упоминает вас в $task"
            NotificationKind.REQUEST -> "$who просит ${requestAbout(item.requestKind)} $task"
            NotificationKind.DEADLINE -> "Срок $task — ${DigestWords.dueWord(item.due, today)}"
        }
    }

    private fun reason(item: DigestItem): Pair<String, String?> {
        val who = NotificationText.shortName(item.actorName)
        return when (item.kind) {
            NotificationKind.ASSIGNED -> "$who назначает вас исполнителем" to null
            NotificationKind.MENTION -> "$who упоминает вас" to item.message?.let(DigestWords::quote)
            NotificationKind.REQUEST -> "$who просит ${requestVerb(item.requestKind)}" to null
            NotificationKind.DEADLINE -> DigestWords.deadline(item.due, today) to null
        }
    }

    private fun requestVerb(kind: String?) = when (kind) {
        "review" -> "проверить"
        "answer" -> "ответить"
        "decision" -> "принять решение"
        "approval" -> "утвердить план"
        "do" -> "сделать задачу"
        else -> "посмотреть задачу"
    }

    private fun requestAbout(kind: String?) = when (kind) {
        "review" -> "проверить"
        "answer" -> "ответить в"
        "decision" -> "принять решение в"
        "approval" -> "утвердить план в"
        "do" -> "сделать"
        else -> "посмотреть"
    }

    private fun title(value: String): String = DigestWords.cut(value.replace(WHITESPACE, " ").trim(), TITLE_LIMIT)

    private companion object {
        const val TITLE_LIMIT = 120
        const val HEADLINE_TITLE = 60
        val WHITESPACE = Regex("\\s+")
    }
}

/** The small pieces of wording a digest is made of: counts, dates and quotes, in Russian. */
object DigestWords {
    private val RUSSIAN = Locale.forLanguageTag("ru")
    private val DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMMM", RUSSIAN)
    private const val QUOTE_LIMIT = 90
    private const val QUOTE_LEAD = 24
    private val CODE_BLOCK = Regex("```[\\s\\S]*?(```|$)")
    private val INLINE_CODE = Regex("`[^`]*`")
    private val LINK = Regex("\\[([^\\]]*)]\\([^)]*\\)")
    private val MARKUP = Regex("[*_~#>|]+")
    private val SPACES = Regex("\\s+")

    /** «Срок завтра, 2 октября»; a date that passed while the batch waited says so. */
    fun deadline(due: LocalDate?, today: LocalDate): String = when {
        due == null -> "Срок скоро"
        due == today -> "Срок сегодня, ${DAY_MONTH.format(due)}"
        due == today.plusDays(1) -> "Срок завтра, ${DAY_MONTH.format(due)}"
        due.isBefore(today) -> "Срок прошёл ${DAY_MONTH.format(due)}"
        else -> "Срок ${DAY_MONTH.format(due)}"
    }

    /** «сегодня», «завтра», «2 октября»: the due date in a headline. */
    fun dueWord(due: LocalDate?, today: LocalDate): String = when {
        due == null -> "скоро"
        due == today -> "сегодня"
        due == today.plusDays(1) -> "завтра"
        else -> DAY_MONTH.format(due)
    }

    /**
     * A short piece of a discussion message around the first mention, as plain words: code, links and Markdown
     * marks are left out, the cut ends on a word and says so with an ellipsis. Null when nothing readable is left.
     */
    fun quote(message: String): String? {
        val plain = message.replace(CODE_BLOCK, " ").replace(INLINE_CODE, " ").replace(LINK, "$1")
            .replace(MARKUP, " ").replace(SPACES, " ").trim()
        if (plain.isEmpty()) return null
        if (plain.length <= QUOTE_LIMIT) return plain
        val at = plain.indexOf('@').coerceAtLeast(0)
        var start = (at - QUOTE_LEAD).coerceAtLeast(0)
        if (start > 0) start = plain.indexOf(' ', start).let { if (it in start until at) it + 1 else start }
        val window = plain.substring(start)
        val body = cut(window, QUOTE_LIMIT)
        return (if (start > 0) "…" else "") + body
    }

    /** At most [limit] characters, cut at a word with an ellipsis. */
    fun cut(value: String, limit: Int): String {
        if (value.length <= limit) return value
        val head = value.take(limit - 1)
        val space = head.lastIndexOf(' ')
        return (if (space > limit / 2) head.take(space) else head).trimEnd(' ', ',', '.', ':', ';', '—', '-') + "…"
    }

    /** «1 новое», «3 новых», «21 новое». */
    fun newCount(count: Int): String = "$count ${plural(count, "новое", "новых", "новых")}"

    /** «1 задача требует внимания», «2 задачи требуют внимания», «5 задач требуют внимания». */
    fun tasksNeedAttention(count: Int): String =
        "$count ${plural(count, "задача требует", "задачи требуют", "задач требуют")} внимания"

    fun plural(count: Int, one: String, few: String, many: String): String {
        val tens = count % HUNDRED
        val units = count % TEN
        return when {
            tens in TEENS -> many
            units == 1 -> one
            units in FEW -> few
            else -> many
        }
    }

    private const val HUNDRED = 100
    private const val TEN = 10
    private val TEENS = 11..14
    private val FEW = 2..4
}
