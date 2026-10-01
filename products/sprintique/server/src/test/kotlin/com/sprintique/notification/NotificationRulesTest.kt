package com.sprintique.notification

import com.sprintique.notification.domain.MentionCandidate
import com.sprintique.notification.domain.Mentions
import com.sprintique.notification.domain.NotificationFacts
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.NotificationText
import com.sprintique.notification.domain.TelegramCommand
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
    fun `a token names a member by id, whatever its label, and counts once before typed names`() {
        val robot = MentionCandidate("sa_1", "Робот релизов")
        val people = listOf(anna, boris, robot)
        // Renamed since the token was written: the id still finds Анна; a forged label names nobody else.
        assertThat(Mentions.find("@[Аня Старое](user:a), глянь", people)).containsExactly("a")
        assertThat(Mentions.find("@[Борис](user:a)", people)).containsExactly("a")
        assertThat(Mentions.find("@[Робот](user:sa_1) и @борис", people)).containsExactly("sa_1", "b")
        // Not a member, not a token, in code or inside a word: nobody.
        assertThat(Mentions.find("@[Чужой](user:zz) @[x](mailto:a) `@[A](user:a)` mail@[A](user:a)", people)).isEmpty()
        assertThat(Mentions.find("```\n@[A](user:a)\n```", people)).isEmpty()
        assertThat(Mentions.find("``@[A](user:a)``", people)).isEmpty()
        assertThat(Mentions.find("@[A](user:a) @[A](user:a) @Анна", people)).containsExactly("a")
        // A label with brackets or a line break is not a token; an id outside [A-Za-z0-9_-] neither.
        assertThat(Mentions.find("@[A]](user:a) @[A\nB](user:a) @[A](user:a\"b)", people)).isEmpty()
    }

    @Test
    fun `one message notifies at most twenty members, tokens first`() {
        val many = (1..30).map { MentionCandidate("p$it", "Участник$it Фамилия") }
        val body = many.joinToString(" ") { "@[${it.name}](user:${it.id})" }
        assertThat(Mentions.find(body, many)).hasSize(Mentions.LIMIT).startsWith("p1", "p2")
    }

    @Test
    fun `a quote shows tokens as current names and leaves code alone`() {
        val names = mapOf("a" to "Анна Кузнецова")
        assertThat(Mentions.plainText("@[Аня](user:a), @[Бывший](user:x) и `@[Аня](user:a)`", names))
            .isEqualTo("@Анна Кузнецова, @Бывший и `@[Аня](user:a)`")
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
        assertThat(TelegramMessages.notification("A <b> & c", "P&L", "K-1"))
            .isEqualTo("A &lt;b&gt; &amp; c\n<i>P&amp;L · K-1</i>")
    }
}
