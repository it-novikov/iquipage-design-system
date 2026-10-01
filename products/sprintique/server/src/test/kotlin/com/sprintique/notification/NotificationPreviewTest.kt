package com.sprintique.notification

import com.sprintique.notification.domain.DigestItem
import com.sprintique.notification.domain.DigestLinks
import com.sprintique.notification.domain.EmailDigest
import com.sprintique.notification.domain.NotificationDigest
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.QuickAction
import com.sprintique.notification.domain.TelegramCallbacks
import com.sprintique.notification.domain.TelegramDigest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * A sample batch rendered by the real templates. With SPRINTIQUE_PREVIEW_DIR set, the letters and the Telegram parts
 * are written there for design review (docs/decisions/0007-notification-channels.md); otherwise only rendered.
 */
class NotificationPreviewTest {
    private val today = LocalDate.parse("2026-10-01")
    private val links = DigestLinks("https://sprintique.iqui.page")
    private val sample = listOf(
        DigestItem(
            "1", NotificationKind.ASSIGNED, "Аня Ковалёва", "SPR-41", "Граф связей: подписи рёбер", "sprintique",
            "Sprintique",
        ),
        DigestItem(
            "2", NotificationKind.MENTION, "Пётр Волков", "SPR-41", "Граф связей: подписи рёбер", "sprintique",
            "Sprintique",
            message = "@Аня, глянь подписи на рёбрах: кажется, «блокирует» читается лучше, чем «зависит».",
        ),
        DigestItem(
            "3", NotificationKind.DEADLINE, null, "SPR-38", "Онбординг новых участников", "sprintique", "Sprintique",
            due = today.plusDays(1),
        ),
        DigestItem(
            "4", NotificationKind.REQUEST, "Марина Лебедева", "MKT-7", "Лендинг осеннего релиза", "marketing",
            "Маркетинг", requestKind = "review",
        ),
    )

    @Test
    fun `the sample batch renders as a letter and as Telegram messages`() {
        val email =
            EmailDigest(links, "https://sprintique.iqui.page/api/v1/notifications/unsubscribe?token=preview", 900)
        val many = email.render(NotificationDigest(sample, today))
        val one = email.render(NotificationDigest(sample.take(1), today))
        val callbacks = TelegramCallbacks("123456789:" + "A".repeat(35))
        val sign = { action: QuickAction, id: String -> callbacks.sign(action, UUID.fromString(id), Instant.now()) }
        val telegram = TelegramDigest(links, sign = sign).render(NotificationDigest(sample, today))
        // One task, two reasons: an assignment to take and a mention to answer.
        val taken = sample.take(2).mapIndexed { index, item ->
            item.copy(
                notificationId = UUID.nameUUIDFromBytes(byteArrayOf(index.toByte())).toString(),
                actions = listOf(if (index == 0) QuickAction.TAKE else QuickAction.REPLY),
            )
        }
        val single = TelegramDigest(links, sign = sign).render(NotificationDigest(taken, today))
        assertThat(many.subject).isEqualTo("3 задачи требуют внимания · Sprintique")
        assertThat(telegram).hasSize(1)
        val directory = System.getenv("SPRINTIQUE_PREVIEW_DIR")?.let(Path::of) ?: return
        Files.createDirectories(directory)
        Files.writeString(directory.resolve("email-batch.html"), many.html)
        Files.writeString(directory.resolve("email-batch.txt"), "${many.subject}\n${many.preheader}\n\n${many.text}")
        Files.writeString(directory.resolve("email-single.html"), one.html)
        Files.writeString(directory.resolve("email-single.txt"), "${one.subject}\n${one.preheader}\n\n${one.text}")
        val parts = (telegram + single).joinToString("\n\u0000\n") { part ->
            part.html + "\n\u0001\n" + part.buttons.joinToString("\n") { row -> row.joinToString("\t") { it.text } }
        }
        Files.writeString(directory.resolve("telegram-parts.txt"), parts)
    }
}
