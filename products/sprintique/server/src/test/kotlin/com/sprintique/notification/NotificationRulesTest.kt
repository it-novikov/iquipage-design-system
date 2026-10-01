package com.sprintique.notification

import com.sprintique.notification.domain.DigestItem
import com.sprintique.notification.domain.MentionCandidate
import com.sprintique.notification.domain.Mentions
import com.sprintique.notification.domain.NotificationDigest
import com.sprintique.notification.domain.NotificationFacts
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.NotificationText
import com.sprintique.notification.domain.TelegramCommand
import com.sprintique.notification.domain.TelegramDigest
import com.sprintique.notification.domain.TelegramMessages
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate

class NotificationRulesTest {
    private val anna = MentionCandidate("a", "Анна Кузнецова")
    private val annaToo = MentionCandidate("a2", "Анна Петрова")
    private val boris = MentionCandidate("b", "Борис")

    @Test
    fun `a line names who, what and which task, with a short name and a bounded title`() {
        val assigned = NotificationFacts(NotificationKind.ASSIGNED, "Анна Кузнецова", "Граф связей: подписи рёбер")
        assertThat(NotificationText.line(assigned)).isEqualTo("Анна К. назначил(а) вам «Граф связей: подписи рёбер»")
        assertThat(NotificationText.line(assigned.copy(kind = NotificationKind.MENTION, actorName = "Борис")))
            .isEqualTo("Борис упомянул(а) вас в «Граф связей: подписи рёбер»")
        assertThat(NotificationText.line(assigned.copy(kind = NotificationKind.REQUEST, requestKind = "review")))
            .isEqualTo("Анна К. просит проверить «Граф связей: подписи рёбер»")
        assertThat(NotificationText.line(assigned.copy(actorName = null))).startsWith("Участник назначил(а)")
        assertThat(NotificationText.quoted("x".repeat(200))).hasSize(82).endsWith("…»")
    }

    @Test
    fun `a deadline says tomorrow or today against the day it was raised`() {
        val on = LocalDate.parse("2026-10-01")
        val facts = NotificationFacts(NotificationKind.DEADLINE, null, "Релиз", due = on.plusDays(1), raisedOn = on)
        assertThat(NotificationText.line(facts)).isEqualTo("Срок «Релиз» — завтра")
        assertThat(NotificationText.line(facts.copy(due = on))).isEqualTo("Срок «Релиз» — сегодня")
        assertThat(NotificationText.line(facts.copy(due = on.plusDays(5)))).isEqualTo("Срок «Релиз» — 06.10")
    }

    @Test
    fun `mentions match a full name or a unique first name, without case, standing alone`() {
        val people = listOf(anna, boris)
        assertThat(Mentions.find("@анна, глянь", people)).containsExactly("a")
        assertThat(Mentions.find("@АННА КУЗНЕЦОВА и @борис", people)).containsExactly("a", "b")
        assertThat(Mentions.find("@Аннабель", people)).isEmpty()
        assertThat(Mentions.find("пиши на mail@Борис или `@Борис`", people)).isEmpty()
        assertThat(Mentions.find("```\n@Борис\n```", people)).isEmpty()
        // Two Анна: the first name alone is ambiguous, the full name is not.
        assertThat(Mentions.find("@Анна", listOf(anna, annaToo))).isEmpty()
        assertThat(Mentions.find("@Анна Петрова", listOf(anna, annaToo))).containsExactly("a2")
    }

    @Test
    fun `the bot reads start with a token, start alone, stop, and nothing else`() {
        assertThat(TelegramCommand.parse("/start abc_DEF-123")).isEqualTo(TelegramCommand.Start("abc_DEF-123"))
        assertThat(TelegramCommand.parse("/start@sprintique_bot abc")).isEqualTo(TelegramCommand.Start("abc"))
        assertThat(TelegramCommand.parse("/start")).isEqualTo(TelegramCommand.Start(null))
        assertThat(TelegramCommand.parse("/stop")).isEqualTo(TelegramCommand.Stop)
        assertThat(TelegramCommand.parse("/start a b")).isEqualTo(TelegramCommand.Other)
        assertThat(TelegramCommand.parse(null)).isEqualTo(TelegramCommand.Other)
    }

    @Test
    fun `a Telegram message escapes every value`() {
        val item = DigestItem("d1", NotificationKind.ASSIGNED, "A <b> & c", "K-1", "x<y", "p", "P&L")
        val part = TelegramDigest(null).render(NotificationDigest(listOf(item), LocalDate.parse("2026-10-01"))).single()
        assertThat(part.html).isEqualTo("<b>x&lt;y</b>\nA &lt;. назначает вас исполнителем\n<i>P&amp;L · K-1</i>")
        assertThat(TelegramMessages.NOT_LINKED).doesNotContain("<")
    }
}
