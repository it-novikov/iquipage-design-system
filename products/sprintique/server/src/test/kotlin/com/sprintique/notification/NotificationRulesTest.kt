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
    fun `a token names a member by id, whatever its label, and counts once before typed names`() {
        val robot = MentionCandidate("sa_1", "Робот релизов", service = true)
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
    fun `a service account is named in full and never makes a person's first name ambiguous`() {
        val helper = MentionCandidate("sa_2", "Анна Помощник", service = true)
        assertThat(Mentions.find("@Анна, глянь", listOf(anna, helper))).containsExactly("a")
        assertThat(Mentions.find("@анна помощник", listOf(anna, helper))).contains("sa_2")
        assertThat(Mentions.find("@Робот", listOf(MentionCandidate("sa_1", "Робот релизов", service = true)))).isEmpty()
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
            .isEqualTo("@Анна Кузнецова, Бывший и `@[Аня](user:a)`")
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
