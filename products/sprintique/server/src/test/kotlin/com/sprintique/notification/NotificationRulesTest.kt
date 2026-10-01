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
    fun `a sentence says what happened with the task's key, in the past tense, and who did it apart`() {
        val assigned = NotificationFacts(NotificationKind.ASSIGNED, "Анна Кузнецова", "SPR-26")
        assertThat(NotificationText.sentence(assigned)).isEqualTo("Вас назначили исполнителем задачи SPR-26")
        assertThat(NotificationText.author(assigned)).isEqualTo("Анна К.")
        assertThat(NotificationText.sentence(assigned.copy(kind = NotificationKind.MENTION)))
            .isEqualTo("Вас упомянули в обсуждении задачи SPR-26")
        val request = assigned.copy(kind = NotificationKind.REQUEST)
        assertThat(NotificationText.sentence(request.copy(requestKind = "review")))
            .isEqualTo("Вас попросили проверить задачу SPR-26")
        assertThat(NotificationText.sentence(request.copy(requestKind = "answer")))
            .isEqualTo("Вас попросили ответить в обсуждении задачи SPR-26")
        assertThat(NotificationText.sentence(request.copy(requestKind = "decision")))
            .isEqualTo("Вас попросили принять решение по задаче SPR-26")
        assertThat(NotificationText.author(assigned.copy(actorName = null))).isEqualTo("Участник")
        // No gendered verb anywhere: «назначил(а)», «назначила», «упомянул» never appear.
        val all = NotificationKind.entries.map { NotificationText.sentence(assigned.copy(kind = it)) }
        assertThat(all).noneMatch { Regex("ил\\(а\\)|ила |нул ").containsMatchIn(it) }
    }

    @Test
    fun `a deadline says today or tomorrow against the person's day, and has no author`() {
        val today = LocalDate.parse("2026-10-01")
        val facts = NotificationFacts(NotificationKind.DEADLINE, null, "SPR-7", due = today.plusDays(1), today = today)
        assertThat(NotificationText.sentence(facts)).isEqualTo("Срок задачи SPR-7 — завтра, 2 октября")
        val on = { due: LocalDate -> NotificationText.sentence(facts.copy(due = due)) }
        assertThat(on(today)).isEqualTo("Срок задачи SPR-7 — сегодня, 1 октября")
        assertThat(on(today.plusDays(5))).isEqualTo("Срок задачи SPR-7 — 6 октября")
        assertThat(on(today.minusDays(1))).isEqualTo("Срок задачи SPR-7 прошёл 30 сентября")
        assertThat(NotificationText.author(facts)).isNull()
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
        assertThat(part.html)
            .isEqualTo("<b>x&lt;y</b>\nВас назначили исполнителем задачи K-1\n<i>A &lt;. · P&amp;L</i>")
        assertThat(TelegramMessages.NOT_LINKED).doesNotContain("<")
    }
}
