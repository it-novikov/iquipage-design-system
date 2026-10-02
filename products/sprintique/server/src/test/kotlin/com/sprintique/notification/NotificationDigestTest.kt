package com.sprintique.notification

import com.sprintique.notification.domain.CallbackCheck
import com.sprintique.notification.domain.DigestItem
import com.sprintique.notification.domain.DigestLinks
import com.sprintique.notification.domain.DigestWords
import com.sprintique.notification.domain.EmailDigest
import com.sprintique.notification.domain.NotificationDigest
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.QuickAction
import com.sprintique.notification.domain.TelegramCallbacks
import com.sprintique.notification.domain.TelegramDigest
import com.sprintique.notification.domain.UnsubscribeCheck
import com.sprintique.notification.domain.UnsubscribeTokens
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Base64
import java.util.UUID

/** Batches as people read them: grouping, collapsed duplicates, Telegram parts, the letter, the unsubscribe token. */
class NotificationDigestTest {
    private val today = LocalDate.parse("2026-10-01")
    private val links = DigestLinks("https://sprintique.example")

    private fun item(
        id: String,
        kind: NotificationKind,
        task: String = "PLT-1",
        title: String = "Граф связей: подписи рёбер",
        actor: String? = "Анна Кузнецова",
        project: String = "plt",
        projectName: String = "Платформа",
        due: LocalDate? = null,
        message: String? = null,
        requestKind: String? = null,
    ) = DigestItem(id, kind, actor, task, title, project, projectName, requestKind, due, message)

    private fun deadline(id: String, due: LocalDate) =
        item(id, NotificationKind.DEADLINE, task = "PLT-2", title = "Онбординг", actor = null, due = due)

    private fun one() = NotificationDigest(listOf(item("1", NotificationKind.ASSIGNED)), today)

    private fun decoded(value: String) = String(Base64.getUrlDecoder().decode(value))

    @Test
    fun `updates about one task become one entry with every reason, a repeated reason said once`() {
        val digest = NotificationDigest(
            listOf(
                item("1", NotificationKind.ASSIGNED),
                item("2", NotificationKind.MENTION, actor = "Пётр Волков", message = "@Анна глянь подписи"),
                item("3", NotificationKind.ASSIGNED),
                deadline("4", today.plusDays(1)),
                item(
                    "5", NotificationKind.REQUEST, task = "MKT-7", title = "Лендинг", project = "mkt",
                    projectName = "Маркетинг",
                    actor = "Марина Лис", requestKind = "review",
                ),
            ),
            today,
        )
        assertThat(digest.projects.map { it.name }).containsExactly("Платформа", "Маркетинг")
        val graph = digest.projects[0].tasks[0]
        assertThat(graph.reasons.map { it.text })
            .containsExactly("Вас назначили исполнителем задачи PLT-1", "Вас упомянули в обсуждении задачи PLT-1")
        assertThat(graph.reasons.map { it.author }).containsExactly("Анна К.", "Пётр В.")
        assertThat(graph.reasons[0].deliveryIds).containsExactly("1", "3")
        assertThat(graph.reasons[1].quote).isEqualTo("@Анна глянь подписи")
        assertThat(digest.projects[0].tasks[1].reasons.single().text).isEqualTo("Срок задачи PLT-2 — завтра, 2 октября")
        assertThat(digest.projects[0].tasks[1].reasons.single().author).isNull()
        assertThat(digest.projects[1].tasks.single().reasons.single().text)
            .isEqualTo("Вас попросили проверить задачу MKT-7")
        assertThat(digest.reasonCount).isEqualTo(4)
        assertThat(digest.isSingle).isFalse()
    }

    @Test
    fun `Telegram shows a header, projects in italics, bold linked titles and one line per reason, without lists`() {
        val digest = NotificationDigest(
            listOf(
                item("1", NotificationKind.ASSIGNED),
                item("2", NotificationKind.MENTION, actor = "Пётр Волков", message = "Посмотри, @Анна, подписи"),
                deadline("3", today),
            ),
            today,
        )
        val part = TelegramDigest(links).render(digest).single()
        val task = "https://sprintique.example/?project=plt#/task/"
        assertThat(part.html).isEqualTo(
            "<b>Sprintique · 3 новых</b>\n\n<i>Платформа</i>\n" +
                "<a href=\"${task}PLT-1\"><b>Граф связей: подписи рёбер</b></a>\n" +
                "Вас назначили исполнителем задачи PLT-1\n<i>Анна К.</i>\n" +
                "Вас упомянули в обсуждении задачи PLT-1\n" +
                "<blockquote>Посмотри, @Анна, подписи</blockquote>\n<i>Пётр В.</i>\n\n" +
                "<a href=\"${task}PLT-2\"><b>Онбординг</b></a>\nСрок задачи PLT-2 — сегодня, 1 октября",
        )
        assertThat(part.buttons.flatten().map { it.text }).containsExactly("Открыть Sprintique")
        assertThat(part.deliveryIds).containsExactly("1", "2", "3")
        assertThat(part.html).doesNotContain("•", "<li>", "\n- ", "\n1. ")
    }

    @Test
    fun `a batch of one is a single clean message with both buttons`() {
        val part = TelegramDigest(links).render(one()).single()
        assertThat(part.html).isEqualTo(
            "<a href=\"https://sprintique.example/?project=plt#/task/PLT-1\"><b>Граф связей: подписи рёбер</b></a>\n" +
                "Вас назначили исполнителем задачи PLT-1\n<i>Анна К. · Платформа</i>",
        )
        assertThat(part.buttons.flatten().map { it.text }).containsExactly("Открыть задачу", "Открыть Sprintique")
    }

    @Test
    fun `a long batch is split at task boundaries under 4096 characters, each item once, buttons on the last part`() {
        val items = (1..20).map { n ->
            item(
                "$n", NotificationKind.MENTION, task = "PLT-$n",
                title = "Задача номер $n с длинным названием, чтобы сообщение точно вышло за предел " +
                    "одного письма в чате",
                actor = "Человек С Фамилией$n",
                message =
                "Очень длинное сообщение, где упомянули @Анна и попросили посмотреть ещё раз на подписи рёбер " +
                    "графа и на всё остальное, что там есть. ".repeat(3),
            )
        }
        val parts = TelegramDigest(links).render(NotificationDigest(items, today))
        assertThat(parts.size).isGreaterThan(1)
        assertThat(parts).allSatisfy { assertThat(it.html.length).isLessThanOrEqualTo(TelegramDigest.LIMIT) }
        assertThat(parts.flatMap { it.deliveryIds }).containsExactlyElementsOf((1..20).map { "$it" })
        assertThat(parts.dropLast(1)).allSatisfy { assertThat(it.buttons).isEmpty() }
        assertThat(parts.last().buttons).isNotEmpty()
        // Each later part starts with the project it continues, then a whole task.
        assertThat(parts.drop(1)).allSatisfy { assertThat(it.html).startsWith("<i>Платформа</i>\n<a href=") }
        assertThat(parts[0].html).startsWith("<b>Sprintique · 20 новых</b>")
        // Never mid-task: every part ends with a reason line, never with a title.
        assertThat(parts).allSatisfy { assertThat(it.html.lines().last()).startsWith("<i>Человек С.") }
    }

    @Test
    fun `a task too long for one message continues its reasons under its title`() {
        val items = (1..6).map { n ->
            item(
                "$n", NotificationKind.MENTION, actor = "Автор$n",
                message =
                "x".repeat(80) + n,
            )
        }
        val parts = TelegramDigest(links, limit = 700).render(NotificationDigest(items, today))
        assertThat(parts.size).isGreaterThan(1)
        assertThat(parts).allSatisfy { assertThat(it.html.length).isLessThanOrEqualTo(700) }
        assertThat(parts.flatMap { it.deliveryIds }).containsExactly("1", "2", "3", "4", "5", "6")
    }

    @Test
    fun `a batch about one task carries its quick actions as signed buttons, more tasks only open Sprintique`() {
        val callbacks = TelegramCallbacks("123456789:" + "A".repeat(35))
        val now = Instant.parse("2026-10-01T10:00:00Z")
        val notification = "6f1c3c1e-6c2b-4a39-9a51-3f6f7d0a2b11"
        val sign = { action: QuickAction, id: String -> callbacks.sign(action, UUID.fromString(id), now) }
        val taken = item("1", NotificationKind.ASSIGNED)
            .copy(notificationId = notification, actions = listOf(QuickAction.TAKE))
        val part = TelegramDigest(links, sign = sign).render(NotificationDigest(listOf(taken), today)).single()
        assertThat(part.buttons).hasSize(2)
        val button = part.buttons[0].single()
        assertThat(button.text).isEqualTo("Взять в работу")
        assertThat(button.data!!.length).isLessThanOrEqualTo(64)
        assertThat(callbacks.check(button.data, now))
            .isEqualTo(CallbackCheck.Valid(QuickAction.TAKE, UUID.fromString(notification)))
        val other = item("2", NotificationKind.ASSIGNED, task = "PLT-9").copy(actions = listOf(QuickAction.TAKE))
        val many = TelegramDigest(links, sign = sign).render(NotificationDigest(listOf(taken, other), today)).single()
        assertThat(many.buttons.flatten().map { it.text }).containsExactly("Открыть Sprintique")
    }

    @Test
    fun `a button's data is refused when forged, expired, signed with another bot or for another action`() {
        val callbacks = TelegramCallbacks("123456789:" + "A".repeat(35))
        val now = Instant.parse("2026-10-01T10:00:00Z")
        val id = UUID.randomUUID()
        val data = callbacks.sign(QuickAction.ACCEPT, id, now)
        assertThat(callbacks.check(data, now.plusSeconds(60))).isEqualTo(CallbackCheck.Valid(QuickAction.ACCEPT, id))
        val late = now.plus(TelegramCallbacks.VALIDITY).plusSeconds(60)
        assertThat(callbacks.check(data, late)).isEqualTo(CallbackCheck.Expired)
        assertThat(callbacks.check(data.replaceFirst(".a.", ".t."), now)).isEqualTo(CallbackCheck.Invalid)
        assertThat(TelegramCallbacks("987654321:" + "B".repeat(35)).check(data, now)).isEqualTo(CallbackCheck.Invalid)
        val made = "q1.t.AAAAAAAAAAAAAAAAAAAAAA.zzzzzz.AAAAAAAAAAAAAAAA"
        assertThat(callbacks.check(made, now)).isEqualTo(CallbackCheck.Invalid)
        assertThat(callbacks.check(null, now)).isEqualTo(CallbackCheck.Invalid)
        val mail = callbacks.sign(null, id, now)
        assertThat(callbacks.check(mail, now)).isEqualTo(CallbackCheck.Valid(null, id))
    }

    @Test
    fun `without an HTTPS interface Telegram gets no links and no buttons`() {
        val part = TelegramDigest(null).render(one()).single()
        assertThat(part.html).doesNotContain("<a ")
        assertThat(part.buttons).isEmpty()
    }

    @Test
    fun `the letter has a short subject, a preheader, the same grouping, a button per task and the footer`() {
        val email = EmailDigest(links, "https://sprintique.example/api/v1/notifications/unsubscribe?token=t.s", 900)
        val single = email.render(NotificationDigest(listOf(item("1", NotificationKind.ASSIGNED)), today))
        assertThat(single.subject).isEqualTo("Вас назначили исполнителем задачи PLT-1")
        assertThat(single.preheader).isEqualTo("«Граф связей: подписи рёбер». Анна К.")
        val many = email.render(
            NotificationDigest(
                listOf(
                    item("1", NotificationKind.ASSIGNED),
                    deadline("2", today.plusDays(1)),
                ),
                today,
            ),
        )
        assertThat(many.subject).isEqualTo("2 задачи требуют внимания · Sprintique")
        assertThat(many.preheader).isEqualTo(
            "«Граф связей: подписи рёбер»: Вас назначили исполнителем задачи PLT-1. " +
                "«Онбординг»: Срок задачи PLT-2 — завтра, 2 октября.",
        )
        assertThat(many.html.split("Открыть задачу").size - 1).isEqualTo(2)
        assertThat(many.html).contains(
            "Платформа", "Срок задачи PLT-2 — завтра, 2 октября", "Анна К.", "Настроить уведомления",
            "Отключить письма",
            "href=\"https://sprintique.example/#settings/notifications\"",
            "Всё, что набралось за 15 минут, приходит одним письмом.", "Четверг, 1 октября",
            "prefers-color-scheme:dark",
        )
        assertThat(many.html).doesNotContain("<ul", "<ol", "<li", "<img", "<script", "http://")
        assertThat(many.text).contains(
            "Граф связей: подписи рёбер (PLT-1)",
            "Открыть задачу: https://sprintique.example/?project=plt#/task/PLT-1",
            "Отключить письма: https://sprintique.example/api/v1/notifications/unsubscribe?token=t.s",
        )
        assertThat(many.text.lines()).noneMatch {
            it.startsWith("- ") || it.startsWith("• ") ||
                it.matches(Regex("^\\d+\\. .*"))
        }
    }

    @Test
    fun `a letter escapes what people wrote and keeps the subject on one line`() {
        val email = EmailDigest(links, "https://sprintique.example/u?token=a.b", 900)
        val letter = email.render(
            NotificationDigest(
                listOf(
                    item(
                        "1", NotificationKind.ASSIGNED, title = "<script>alert(1)</script>\r\nBcc: x@evil",
                        actor = "Ева\r\nBcc: y@evil",
                    ),
                ),
                today,
            ),
        )
        assertThat(letter.subject).doesNotContain("\r", "\n")
        assertThat(letter.html).doesNotContain("<script>").contains("&lt;script&gt;")
        assertThat(EmailDigest.oneLine("a\r\nb c\td")).isEqualTo("a b c d")
    }

    @Test
    fun `quotes are short plain words around the mention, dates are relative to the person's today`() {
        assertThat(DigestWords.quote("**Смотри** `код` [ссылку](https://x) @Анна")).isEqualTo("Смотри ссылку @Анна")
        val long =
            "Начало длинного сообщения, где много слов до упоминания и после него. ".repeat(3) + "@Анна вот здесь " +
                "и ещё очень много текста после упоминания, который в цитату не войдёт целиком никак"
        val quote = DigestWords.quote(long)!!
        assertThat(quote).startsWith("…").endsWith("…").contains("@Анна")
        assertThat(quote.length).isLessThanOrEqualTo(92)
        assertThat(DigestWords.quote("```\nкод\n```")).isNull()
        assertThat(DigestWords.newCount(21)).isEqualTo("21 новое")
        assertThat(DigestWords.tasksNeedAttention(5)).isEqualTo("5 задач требуют внимания")
    }

    @Test
    fun `an unsubscribe token is valid for its person, refused when expired, changed or signed with another key`() {
        val tokens = UnsubscribeTokens("k".repeat(40))
        val now = Instant.parse("2026-10-01T10:00:00Z")
        val token = tokens.issue("person-1", now)
        assertThat(tokens.check(token, now.plusSeconds(3600))).isEqualTo(UnsubscribeCheck.Valid("person-1"))
        assertThat(tokens.check(token, now.plus(UnsubscribeTokens.VALIDITY))).isEqualTo(UnsubscribeCheck.Expired)
        val (payload, signature) = token.split('.')
        val forged = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(decoded(payload).replace("person-1", "person-2").toByteArray())
        assertThat(tokens.check("$forged.$signature", now)).isEqualTo(UnsubscribeCheck.Invalid)
        val flipped = signature.substring(0, 10) + (if (signature[10] == 'A') 'B' else 'A') + signature.substring(11)
        assertThat(tokens.check("$payload.$flipped", now)).isEqualTo(UnsubscribeCheck.Invalid)
        assertThat(UnsubscribeTokens("z".repeat(40)).check(token, now)).isEqualTo(UnsubscribeCheck.Invalid)
        assertThat(tokens.check(null, now)).isEqualTo(UnsubscribeCheck.Invalid)
        assertThat(tokens.check("not a token", now)).isEqualTo(UnsubscribeCheck.Invalid)
        assertThat(decoded(payload)).doesNotContain("@")
    }
}
