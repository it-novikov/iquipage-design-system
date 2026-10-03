package com.sprintique.notification.domain

import java.time.LocalDate

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
    val notificationId: String = deliveryId,
    /** What the person may do about it in one click, checked as them when the batch was claimed. */
    val actions: List<QuickAction> = emptyList(),
)

/**
 * Why a task is in the batch: one sentence with the task's key («Вас назначили исполнителем задачи SPR-26»), who did
 * it on a quieter line, and the quoted words of a mention.
 */
data class DigestReason(val text: String, val author: String?, val quote: String?, val deliveryIds: List<String>)

/** A quick action offered for a task, bound to the notification it answers. */
data class DigestAction(val action: QuickAction, val notificationId: String, val label: String)

/** A task once, with every reason the batch holds for it and what can be done about it at once. */
data class DigestTask(
    val key: String,
    val title: String,
    val projectSlug: String,
    val reasons: List<DigestReason>,
    val actions: List<DigestAction> = emptyList(),
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
        val reasons = items
            .groupBy { reason(it) }
            .map { (said, same) -> DigestReason(said.first, said.second, said.third, same.map(DigestItem::deliveryId)) }
        // One button per kind of answer, bound to the newest notification that offers it.
        val actions = items.reversed().flatMap { item -> item.actions.map { it to item } }
            .distinctBy { it.first }
            .sortedBy { it.first.ordinal }
            .map { (action, item) ->
                DigestAction(action, item.notificationId, QuickActionText.label(action, item.due, today))
            }
        return DigestTask(first.taskKey, title(first.taskTitle), first.projectSlug, reasons, actions)
    }

    private fun reason(item: DigestItem): Triple<String, String?, String?> {
        val facts = NotificationFacts(item.kind, item.actorName, item.taskKey, item.requestKind, item.due, today)
        val quote = item.message?.takeIf { item.kind == NotificationKind.MENTION }?.let(DigestWords::quote)
        return Triple(NotificationText.sentence(facts), NotificationText.author(facts), quote)
    }

    private fun title(value: String): String = DigestWords.cut(value.replace(WHITESPACE, " ").trim(), TITLE_LIMIT)

    private companion object {
        const val TITLE_LIMIT = 120
        val WHITESPACE = Regex("\\s+")
    }
}

/** The small pieces of wording a digest is made of: counts, dates and quotes, in Russian. */
object DigestWords {
    private const val QUOTE_LIMIT = 90
    private const val QUOTE_LEAD = 24
    private val CODE_BLOCK = Regex("```[\\s\\S]*?(```|$)")
    private val INLINE_CODE = Regex("`[^`]*`")
    private val LINK = Regex("\\[([^\\]]*)]\\([^)]*\\)")
    private val MARKUP = Regex("[*_~#>|]+")
    private val SPACES = Regex("\\s+")

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
