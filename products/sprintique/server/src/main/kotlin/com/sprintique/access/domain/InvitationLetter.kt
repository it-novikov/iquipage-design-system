package com.sprintique.access.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** What a letter of invitation says; names are the ones copied into the invitation when it was made. */
data class InvitationContent(
    val inviterName: String,
    val workspaceName: String,
    val workspaceRole: WorkspaceRole,
    val projectNames: List<String>,
    val presetName: String?,
    val presetHint: String?,
    val expiresAt: Instant,
    val zone: ZoneId,
    val email: String,
    val link: String,
)

/** A rendered letter: the subject and the same message as plain text and as HTML (multipart/alternative). */
data class RenderedLetter(val subject: String, val text: String, val html: String)

/**
 * The invitation letter (docs/access/access-and-invitations.md, section 5): from Sprintique, naming who invites, the
 * role in the workspace, the projects with the preset in words, the expiry, one link, and what to do with an
 * unexpected letter. No personal message: the letter carries only what the invitation holds.
 */
object InvitationLetter {
    private val RUSSIAN = Locale.forLanguageTag("ru")
    private val DATE = DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm", RUSSIAN)

    fun render(content: InvitationContent): RenderedLetter {
        val subject = "${content.inviterName} приглашает вас в пространство «${content.workspaceName}» — Sprintique"
        val facts = facts(content)
        val text = buildString {
            appendLine("Вас пригласили в пространство «${content.workspaceName}»")
            appendLine()
            appendLine(
                "${content.inviterName} приглашает вас работать в Sprintique: " +
                    "задачи, релизы и карты идей команды в одном месте.",
            )
            appendLine()
            facts.forEach { (label, value) -> appendLine("$label: $value") }
            appendLine()
            appendLine("Принять приглашение: ${content.link}")
            appendLine()
            appendLine(
                "Войдите с адресом ${content.email} — по коду из письма, через Google или Apple. " +
                    "Ссылка работает один раз.",
            )
            appendLine()
            appendLine(
                "Не ждали этого письма? Просто удалите его: без входа с вашего адреса доступ никто не получит. " +
                    "Отменить приглашение может тот, кто его отправил, или администратор пространства.",
            )
            appendLine()
            appendLine("—")
            appendLine("Sprintique · ${host(content.link)}")
            append("Письмо отправлено автоматически, отвечать на него не нужно.")
        }
        return RenderedLetter(subject, text, html(content, facts))
    }

    fun facts(content: InvitationContent): List<Pair<String, String>> = buildList {
        add("Ваша роль" to roleTitle(content.workspaceRole))
        if (content.projectNames.isNotEmpty()) {
            val preset = content.presetName?.let { name ->
                " — как ${name.lowercase(RUSSIAN)}" +
                    (content.presetHint?.takeIf(String::isNotBlank)?.let { " ($it)" } ?: "")
            }.orEmpty()
            add(
                (if (content.projectNames.size == 1) "Проект" else "Проекты") to
                    content.projectNames.joinToString(", ") + preset,
            )
        }
        add("Срок" to "до ${expiry(content.expiresAt, content.zone)}")
    }

    fun roleTitle(role: WorkspaceRole): String = when (role) {
        WorkspaceRole.OWNER, WorkspaceRole.ADMIN -> "Администратор пространства"
        WorkspaceRole.MEMBER -> "Участник пространства"
        WorkspaceRole.GUEST -> "Гость: только проекты из приглашения"
    }

    fun expiry(at: Instant, zone: ZoneId): String =
        DATE.format(at.atZone(zone)) + " (" + zone.getDisplayName(TextStyle.SHORT, RUSSIAN) + ")"

    /** `iv***@romashka.ru`: enough for the owner of the address to recognise it, not enough to learn it. */
    fun mask(email: String): String {
        val local = email.substringBefore('@')
        return local.take(2) + "***@" + email.substringAfter('@')
    }

    private fun host(link: String): String = link.substringAfter("://").substringBefore('/')

    private fun escape(value: String): String = buildString(value.length) {
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

    /** Table layout with inline styles: mail clients ignore style sheets and most modern CSS. */
    private fun html(content: InvitationContent, facts: List<Pair<String, String>>): String {
        val link = escape(content.link)
        val rows = facts.joinToString("") { (label, value) ->
            "<tr><td style=\"padding:10px 14px;color:#6b6b73;width:34%;\">${escape(label)}</td>" +
                "<td style=\"padding:10px 14px;color:#1d1d20;\">${escape(value)}</td></tr>"
        }
        return """
            <!doctype html>
            <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
            <meta name="color-scheme" content="light only"><title>${escape("Приглашение в Sprintique")}</title></head>
            <body style="margin:0;padding:0;background:#f4f4f6;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px;">
            <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e3e3e8;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1d1d20;">
            <tr><td style="padding:32px 32px 8px;font-weight:600;">Sprintique</td></tr>
            <tr><td style="padding:8px 32px 0;"><h1 style="margin:0;font-size:24px;line-height:1.3;">Вас пригласили в пространство «${escape(content.workspaceName)}»</h1></td></tr>
            <tr><td style="padding:12px 32px 0;">${escape(content.inviterName)} приглашает вас работать в Sprintique: задачи, релизы и карты идей команды в одном месте.</td></tr>
            <tr><td style="padding:20px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;border-radius:10px;">$rows</table></td></tr>
            <tr><td style="padding:24px 32px 0;"><a href="$link" style="display:inline-block;background:#1d1d20;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Принять приглашение</a></td></tr>
            <tr><td style="padding:20px 32px 0;">Войдите с адресом <b>${escape(content.email)}</b> — по коду из письма, через Google или Apple. Ссылка работает один раз.</td></tr>
            <tr><td style="padding:16px 32px 0;color:#6b6b73;font-size:14px;">Если кнопка не открывается, скопируйте адрес в браузер:<br><a href="$link" style="color:#2450d8;word-break:break-all;">$link</a></td></tr>
            <tr><td style="padding:16px 32px 24px;color:#6b6b73;font-size:14px;">Не ждали этого письма? Просто удалите его: без входа с вашего адреса доступ никто не получит. Отменить приглашение может тот, кто его отправил, или администратор пространства.</td></tr>
            <tr><td style="padding:16px 32px 28px;border-top:1px solid #e3e3e8;color:#6b6b73;font-size:13px;">Sprintique · ${escape(host(content.link))}<br>Письмо отправлено автоматически, отвечать на него не нужно.</td></tr>
            </table></td></tr></table></body></html>
        """.trimIndent()
    }
}
