package com.sprintique.notification.domain

/** A button under a message: its words, and the HTTPS link it opens or the signed data of a quick action. */
data class InlineButton(val text: String, val url: String? = null, val data: String? = null)

/**
 * One `sendMessage`: Telegram HTML, the items it carries (settled as sent once Telegram accepts it), its rows of
 * buttons.
 */
data class TelegramPart(val html: String, val deliveryIds: List<String>, val buttons: List<List<InlineButton>>)

/**
 * A batch as Telegram messages (docs/decisions/0007-notification-channels.md). No lists: a one-line header, then each
 * project in italics, each task as a bold link, under it each reason as a sentence with who did it on a quieter line
 * and a mention's words as a quote, a blank line between tasks. A batch of one reason is one clean message without
 * the header. Too long for one message (4096 characters), it is split between tasks, each later part repeating the
 * project it continues; the buttons ride on the last part. A batch about one task gets its quick actions as buttons
 * ([sign] makes their data); more tasks get only «Открыть Sprintique». Every value is escaped; links are left out
 * when the interface has no HTTPS origin, which Telegram requires.
 */
class TelegramDigest(
    private val links: DigestLinks?,
    private val limit: Int = LIMIT,
    private val sign: ((QuickAction, String) -> String?)? = null,
) {
    fun render(digest: NotificationDigest): List<TelegramPart> {
        if (digest.isSingle) return listOf(single(digest))
        val parts = mutableListOf<TelegramPart>()
        var text = StringBuilder("<b>Sprintique · ${DigestWords.newCount(digest.reasonCount)}</b>")
        var ids = mutableListOf<String>()
        var project: String? = null
        fun flush() {
            parts += TelegramPart(text.toString(), ids, emptyList())
            text = StringBuilder()
            ids = mutableListOf()
            project = null
        }
        for (group in digest.projects) {
            val heading = "<i>${escape(group.name)}</i>\n"
            for (task in group.tasks) {
                for ((block, blockIds) in blocks(task)) {
                    var addition = SEPARATOR + (if (project == group.name) "" else heading) + block
                    if (text.length + addition.length > limit) {
                        flush()
                        addition = heading + block
                    }
                    text.append(addition)
                    ids += blockIds
                    project = group.name
                }
            }
        }
        if (text.isNotEmpty()) flush()
        return parts.mapIndexed { index, part ->
            if (index == parts.lastIndex) part.copy(buttons = buttons(digest)) else part
        }
    }

    private fun single(digest: NotificationDigest): TelegramPart {
        val group = digest.projects.single()
        val task = group.tasks.single()
        val reason = task.reasons.single()
        val quiet = listOfNotNull(reason.author, group.name).joinToString(" · ")
        val html = "${title(task)}\n${escape(reason.text)}${quote(reason)}\n<i>${escape(quiet)}</i>"
        return TelegramPart(html, reason.deliveryIds, buttons(digest))
    }

    /**
     * A task's lines: its title and its reasons. Should a task alone not fit one message, its reasons continue in
     * the next part under the title again; each block carries the items whose reasons it holds.
     */
    private fun blocks(task: DigestTask): List<Pair<String, List<String>>> {
        val head = title(task)
        val whole = head + task.reasons.joinToString("") { "\n" + reasonLine(it) }
        if (whole.length <= limit - ROOM) return listOf(whole to task.reasons.flatMap(DigestReason::deliveryIds))
        val blocks = mutableListOf<Pair<String, List<String>>>()
        var text = StringBuilder(head)
        var ids = mutableListOf<String>()
        for (reason in task.reasons) {
            val line = "\n" + reasonLine(reason)
            if (ids.isNotEmpty() && text.length + line.length > limit - ROOM) {
                blocks += text.toString() to ids
                text = StringBuilder(head)
                ids = mutableListOf()
            }
            text.append(line)
            ids += reason.deliveryIds
        }
        blocks += text.toString() to ids
        return blocks
    }

    private fun title(task: DigestTask): String {
        val bold = "<b>${escape(task.title)}</b>"
        val link = links?.task(task.projectSlug, task.key) ?: return bold
        return "<a href=\"${escapeAttribute(link)}\">$bold</a>"
    }

    /** A reason: its sentence, a mention's words as a quote, then who did it, quieter. */
    private fun reasonLine(reason: DigestReason): String =
        escape(reason.text) + quote(reason) + (reason.author?.let { "\n<i>${escape(it)}</i>" } ?: "")

    private fun quote(reason: DigestReason): String =
        reason.quote?.let { "\n<blockquote>${escape(it)}</blockquote>" } ?: ""

    private fun buttons(digest: NotificationDigest): List<List<InlineButton>> {
        val tasks = digest.tasks
        val actions = tasks.singleOrNull()?.actions.orEmpty().mapNotNull { action ->
            sign?.invoke(action.action, action.notificationId)?.let { InlineButton(action.label, data = it) }
        }
        val links = links ?: return listOfNotNull(actions.takeIf { it.isNotEmpty() })
        val open = InlineButton(OPEN_PRODUCT, url = links.product)
        val navigation = if (tasks.size == 1) {
            listOf(InlineButton(OPEN_TASK, url = links.task(tasks[0].projectSlug, tasks[0].key)), open)
        } else {
            listOf(open)
        }
        return listOfNotNull(actions.takeIf { it.isNotEmpty() }, navigation)
    }

    companion object {
        /** Telegram's limit for the text of one message. */
        const val LIMIT = 4096
        const val OPEN_TASK = "Открыть задачу"
        const val OPEN_PRODUCT = "Открыть Sprintique"
        private const val SEPARATOR = "\n\n"

        /** Room left in a part for a project heading and the separator before a task. */
        private const val ROOM = 300

        fun escape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        fun escapeAttribute(value: String): String = escape(value).replace("\"", "&quot;")
    }
}

/** Where the messages point: the product and a task in its project. Values are full HTTPS links. */
class DigestLinks(private val origin: String) {
    val product: String get() = "$origin/"

    val settings: String get() = "$origin/#settings/notifications"

    fun task(projectSlug: String, taskKey: String): String =
        "$origin/?project=${encode(projectSlug)}#/task/${encode(taskKey)}"

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8)
}
