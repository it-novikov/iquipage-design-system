package com.sprintique.access

import com.sprintique.access.domain.InvitationContent
import com.sprintique.access.domain.InvitationLetter
import com.sprintique.access.domain.WorkspaceRole
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId

/** The invitation letter: the same facts in plain text and HTML, escaped, with one link (section 5). */
class InvitationLetterTest {
    private val content = InvitationContent(
        inviterName = "Анна <Ким>",
        workspaceName = "Ромашка & Co",
        workspaceRole = WorkspaceRole.MEMBER,
        projectNames = listOf("Платформа", "Сайт"),
        presetName = "Редактор",
        presetHint = "Ведёт задачи, карты и релизы.",
        expiresAt = Instant.parse("2026-10-05T11:02:00Z"),
        zone = ZoneId.of("Europe/Moscow"),
        email = "ivan.s@romashka.ru",
        link = "https://sprintique.iqui.page/#invite/invite_" + "A".repeat(43),
    )

    @Test
    fun `the subject names who invites and where`() {
        assertThat(InvitationLetter.render(content).subject)
            .isEqualTo("Анна <Ким> приглашает вас в пространство «Ромашка & Co» — Sprintique")
    }

    @Test
    fun `the plain text carries role, projects with the preset in words, expiry and the link`() {
        val text = InvitationLetter.render(content).text
        assertThat(text).contains("Ваша роль: Участник пространства")
        assertThat(text).contains("Проекты: Платформа, Сайт — как редактор (Ведёт задачи, карты и релизы.)")
        assertThat(text).contains("Срок: до 5 октября 2026, 14:02")
        assertThat(text).contains("Принять приглашение: ${content.link}")
        assertThat(text).contains("Войдите с адресом ivan.s@romashka.ru")
        assertThat(text).contains("sprintique.iqui.page")
    }

    @Test
    fun `the HTML escapes names and links once to the invitation`() {
        val html = InvitationLetter.render(content).html
        assertThat(html).contains("Анна &lt;Ким&gt;").doesNotContain("Анна <Ким>")
        assertThat(html).contains("«Ромашка &amp; Co»")
        assertThat(html).contains("href=\"${content.link}\"")
        assertThat(html).contains("<html lang=\"ru\">")
        assertThat(Regex("href=").findAll(html).count()).isEqualTo(2)
    }

    @Test
    fun `a guest letter says so and an address is masked for strangers`() {
        val guest = InvitationLetter.render(
            content.copy(workspaceRole = WorkspaceRole.GUEST, projectNames = listOf("Сайт")),
        )
        assertThat(guest.text).contains("Ваша роль: Гость: только проекты из приглашения").contains("Проект: Сайт")
        assertThat(InvitationLetter.mask("ivan.s@romashka.ru")).isEqualTo("iv***@romashka.ru")
        assertThat(InvitationLetter.mask("a@b.ru")).isEqualTo("a***@b.ru")
    }
}
