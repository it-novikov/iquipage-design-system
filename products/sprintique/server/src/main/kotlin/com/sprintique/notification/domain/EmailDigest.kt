package com.sprintique.notification.domain

import java.time.format.DateTimeFormatter
import java.util.Locale

/** A notification letter: subject, the preview line, and the same message as plain text and as HTML. */
data class NotificationLetter(val subject: String, val preheader: String, val text: String, val html: String)

/**
 * A batch as a letter (docs/decisions/0007-notification-channels.md). Calm and readable at a glance: a headline that
 * says what needs attention, then each project and its tasks, each task with its reasons and one button, then why the
 * letter came and how to change that. No lists, no images, no tracking; table layout with inline styles, which every
 * mail client keeps, and a small style block that only darkens it where the client honours dark mode.
 */
class EmailDigest(private val links: DigestLinks, private val unsubscribe: String, private val windowSeconds: Int) {
    fun render(digest: NotificationDigest): NotificationLetter {
        val subject = subject(digest)
        val preheader = preheader(digest)
        return NotificationLetter(subject, preheader, text(digest), html(digest, subject, preheader))
    }

    private fun subject(digest: NotificationDigest): String {
        val tasks = digest.tasks
        val line = when {
            digest.isSingle -> tasks[0].reasons[0].headline

            tasks.size == 1 ->
                "${DigestWords.newCount(digest.reasonCount).replaceFirstChar(Char::uppercase)} по задаче " +
                    "«${DigestWords.cut(tasks[0].title, SUBJECT_TITLE)}»"

            else -> "${DigestWords.tasksNeedAttention(tasks.size)} · Sprintique"
        }
        return oneLine(line)
    }

    /** The line mail clients show after the subject: the first reasons in words. */
    private fun preheader(digest: NotificationDigest): String {
        val reasons = digest.tasks.flatMap { task -> task.reasons.map { it to task } }
        if (digest.isSingle) {
            val reason = reasons[0].first
            return oneLine(reason.quote?.let { "${reason.text}: “$it”" } ?: "${reason.text}.")
        }
        val shown = reasons.take(2).joinToString(" ") { (reason, task) ->
            "${reason.text} — «${DigestWords.cut(task.title, PREVIEW_TITLE)}»."
        }
        val more = reasons.size - 2
        return oneLine(if (more > 0) "$shown И ещё ${DigestWords.newCount(more)}." else shown)
    }

    private fun headline(digest: NotificationDigest): String = when {
        digest.isSingle -> digest.tasks[0].reasons[0].headline

        digest.tasks.size == 1 -> DigestWords.newCount(digest.reasonCount).replaceFirstChar(Char::uppercase) +
            " по задаче"

        else -> DigestWords.tasksNeedAttention(digest.tasks.size).replaceFirstChar(Char::uppercase)
    }

    /** «5 новых в 2 проектах»: said only when it adds to the headline. */
    private fun summary(digest: NotificationDigest): String? {
        if (digest.isSingle) return null
        val projects = digest.projects.size
        val count = DigestWords.newCount(digest.reasonCount).takeIf { digest.reasonCount != digest.tasks.size }
        val where = if (projects >
            1
        ) {
            "в $projects ${DigestWords.plural(projects, "проекте", "проектах", "проектах")}"
        } else {
            null
        }
        return listOfNotNull(count, where).joinToString(" ").ifEmpty { null }?.replaceFirstChar(Char::uppercase)
    }

    private fun why(): String {
        val minutes = windowSeconds / SECONDS_IN_MINUTE
        val batch = if (minutes > 0) {
            " Всё, что набралось за $minutes ${DigestWords.plural(minutes, "минуту", "минуты", "минут")}, приходит одним письмом."
        } else {
            ""
        }
        return "Вы получили это письмо, потому что включили уведомления на почту в Sprintique.$batch"
    }

    private fun text(digest: NotificationDigest): String = buildString {
        appendLine(headline(digest))
        summary(digest)?.let(::appendLine)
        for (project in digest.projects) {
            appendLine()
            appendLine(project.name)
            for (task in project.tasks) {
                appendLine()
                appendLine("${task.title} (${task.key})")
                for (reason in task.reasons) {
                    appendLine(reason.quote?.let { "${reason.text}: “$it”" } ?: reason.text)
                }
                appendLine("Открыть задачу: ${links.task(task.projectSlug, task.key)}")
            }
        }
        appendLine()
        appendLine("—")
        appendLine(why())
        appendLine("Настроить уведомления: ${links.settings}")
        appendLine("Отключить письма: $unsubscribe")
        appendLine()
        append("Sprintique · ${host()}")
    }

    @Suppress("LongMethod")
    private fun html(digest: NotificationDigest, subject: String, preheader: String): String {
        val single = digest.isSingle
        val body = StringBuilder()
        for (project in digest.projects) {
            body.append(
                """
                <tr><td style="padding:28px 32px 10px;"><p class="sq-muted" style="margin:0;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:$MUTED;">${e(project.name)}</p></td></tr>
                """.trimIndent(),
            )
            for (task in project.tasks) body.append(taskBlock(task, primary = single))
        }
        val date = DATE.format(digest.today).replaceFirstChar(Char::uppercase)
        val summary = summary(digest)?.let {
            """
            <tr><td style="padding:6px 32px 0;"><p class="sq-muted" style="margin:0;font-size:15px;line-height:22px;color:$MUTED;">${e(it)}</p></td></tr>
            """.trimIndent()
        }.orEmpty()
        return """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(subject)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
a{text-decoration:none;}
@media (prefers-color-scheme:dark){$DARK}
[data-ogsc] .sq-bg{background:$DARK_BED !important;}[data-ogsc] .sq-card{background:$DARK_CARD !important;border-color:$DARK_LINE !important;}[data-ogsc] .sq-task{background:$DARK_TASK !important;border-color:$DARK_LINE !important;}[data-ogsc] .sq-ink{color:$DARK_INK !important;}[data-ogsc] .sq-muted{color:$DARK_MUTED !important;}
</style>
</head>
<body class="sq-bg" style="margin:0;padding:0;background:$BED;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:$BED;">${e(preheader)}$SPACER</div>
<table role="presentation" class="sq-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:$BED;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="sq-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:$CARD;border:1px solid $LINE;border-radius:16px;font-family:$FONT;color:$INK;">
<tr><td style="padding:26px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="sq-ink" style="font-size:15px;line-height:20px;font-weight:700;letter-spacing:-.01em;color:$INK;">Sprintique</td>
<td class="sq-muted" align="right" style="font-size:13px;line-height:20px;color:$MUTED;">${e(date)}</td>
</tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><h1 class="sq-ink" style="margin:0;font-size:24px;line-height:31px;font-weight:600;letter-spacing:-.015em;color:$INK;">${e(headline(digest))}</h1></td></tr>
$summary$body
<tr><td style="padding:28px 32px 0;"><div class="sq-line" style="border-top:1px solid $LINE;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:20px 32px 28px;">
<p class="sq-muted" style="margin:0;font-size:13px;line-height:20px;color:$MUTED;">${e(why())}</p>
<p style="margin:12px 0 0;font-size:13px;line-height:20px;"><a class="sq-link" href="${a(links.settings)}" style="color:$ACCENT;text-decoration:none;">Настроить уведомления</a><span class="sq-muted" style="color:$MUTED;">&nbsp;&nbsp;·&nbsp;&nbsp;</span><a class="sq-link" href="${a(unsubscribe)}" style="color:$ACCENT;text-decoration:none;">Отключить письма</a></p>
<p class="sq-muted" style="margin:16px 0 0;font-size:12px;line-height:18px;color:$MUTED;">Sprintique · ${e(host())}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""
    }

    /** A task as a quiet card: the title as a link, its reasons as short lines, a mention's words set off, a button. */
    private fun taskBlock(task: DigestTask, primary: Boolean): String {
        val link = a(links.task(task.projectSlug, task.key))
        val reasons = task.reasons.joinToString("") { reason ->
            val quote = reason.quote?.let {
                """
                <p class="sq-quote sq-muted" style="margin:6px 0 0;padding:0 0 0 12px;border-left:2px solid $QUOTE_LINE;font-size:14px;line-height:21px;color:$MUTED;">${e(it)}</p>
                """.trimIndent()
            }.orEmpty()
            """<p class="sq-ink" style="margin:8px 0 0;font-size:15px;line-height:22px;color:$INK;">${e(reason.text)}</p>$quote"""
        }
        val button = if (primary) {
            """<a class="sq-btn" href="$link" style="display:inline-block;background:$INK;color:$CARD;font-size:14px;line-height:20px;font-weight:600;padding:10px 18px;border-radius:9px;text-decoration:none;">Открыть задачу</a>"""
        } else {
            """<a class="sq-btn2 sq-ink" href="$link" style="display:inline-block;background:$CARD;color:$INK;border:1px solid $BUTTON_LINE;font-size:13px;line-height:18px;font-weight:600;padding:8px 14px;border-radius:9px;text-decoration:none;">Открыть задачу</a>"""
        }
        return """<tr><td style="padding:0 32px 12px;"><table role="presentation" class="sq-task" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:$TASK;border:1px solid $TASK_LINE;border-radius:12px;"><tr><td style="padding:18px 20px 20px;">
<p class="sq-muted" style="margin:0;font-size:12px;line-height:16px;color:$MUTED;">${e(task.key)}</p>
<p style="margin:4px 0 0;font-size:17px;line-height:24px;font-weight:600;letter-spacing:-.01em;"><a class="sq-ink" href="$link" style="color:$INK;text-decoration:none;">${e(task.title)}</a></p>
$reasons
<p style="margin:16px 0 0;">$button</p>
</td></tr></table></td></tr>
"""
    }

    private fun host(): String = links.product.substringAfter("://").substringBefore('/')

    companion object {
        private val RUSSIAN = Locale.forLanguageTag("ru")
        private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, d MMMM", RUSSIAN)
        private const val SUBJECT_TITLE = 60
        private const val PREVIEW_TITLE = 40
        private const val SECONDS_IN_MINUTE = 60
        private val CONTROL = Regex("[\\p{Cntrl}\\u2028\\u2029]+")
        private val SPACES = Regex("\\s+")

        // IQUIPAGE colours (tokens/semantic.json): light canvas, surface, ink, muted, line, accent; dark counterparts.
        private const val FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
        private const val BED = "#F5F5F7"
        private const val CARD = "#FFFFFF"
        private const val TASK = "#FAFAFB"
        private const val INK = "#1D1D1F"
        private const val MUTED = "#62646B"
        private const val LINE = "#E6E7EA"
        private const val TASK_LINE = "#E6E7EA"
        private const val BUTTON_LINE = "#D6D9E0"
        private const val QUOTE_LINE = "#D6D9E0"
        private const val ACCENT = "#2453CC"
        private const val DARK_BED = "#0D0D0F"
        private const val DARK_CARD = "#161618"
        private const val DARK_TASK = "#202023"
        private const val DARK_INK = "#F5F5F7"
        private const val DARK_MUTED = "#B1B1B9"
        private const val DARK_LINE = "#343438"
        private const val DARK =
            ".sq-bg{background:$DARK_BED !important;}" +
                ".sq-card{background:$DARK_CARD !important;border-color:$DARK_LINE !important;}" +
                ".sq-task{background:$DARK_TASK !important;border-color:$DARK_LINE !important;}" +
                ".sq-ink{color:$DARK_INK !important;}.sq-muted{color:$DARK_MUTED !important;}" +
                ".sq-quote{border-color:#4A4A50 !important;}.sq-line{border-color:$DARK_LINE !important;}" +
                ".sq-link{color:#A9C1FF !important;}" +
                ".sq-btn{background:#F4F4F6 !important;color:#151518 !important;}" +
                ".sq-btn2{background:$DARK_TASK !important;border-color:#4A4A50 !important;}"

        /** Keeps the preview to the preheader: mail clients would otherwise run on into the letter's text. */
        private val SPACER = "&#8199;&#65279;&#847;".repeat(40)

        /** One line for a header: no control characters, no line breaks (header injection), single spaces. */
        fun oneLine(value: String): String = value.replace(CONTROL, " ").replace(SPACES, " ").trim()

        private fun e(value: String): String = buildString(value.length) {
            for (character in value) {
                when (character) {
                    '&' -> append("&amp;")
                    '<' -> append("&lt;")
                    '>' -> append("&gt;")
                    '"' -> append("&quot;")
                    '\'' -> append("&#39;")
                    else -> append(character)
                }
            }
        }

        private fun a(value: String): String = e(value)
    }
}
