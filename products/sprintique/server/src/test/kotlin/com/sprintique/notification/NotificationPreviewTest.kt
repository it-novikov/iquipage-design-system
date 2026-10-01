package com.sprintique.notification

import com.sprintique.notification.domain.DigestItem
import com.sprintique.notification.domain.DigestLinks
import com.sprintique.notification.domain.EmailDigest
import com.sprintique.notification.domain.NotificationDigest
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.TelegramDigest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate

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
        val telegram = TelegramDigest(links).render(NotificationDigest(sample, today))
        val single = TelegramDigest(links).render(NotificationDigest(sample.take(1), today))
        assertThat(many.subject).isEqualTo("3 задачи требуют внимания · Sprintique")
        assertThat(telegram).hasSize(1)
        val directory = System.getenv("SPRINTIQUE_PREVIEW_DIR")?.let(Path::of) ?: return
        Files.createDirectories(directory)
        Files.writeString(directory.resolve("email-batch.html"), many.html)
        Files.writeString(directory.resolve("email-batch.txt"), "${many.subject}\n${many.preheader}\n\n${many.text}")
        Files.writeString(directory.resolve("email-single.html"), one.html)
        Files.writeString(directory.resolve("email-single.txt"), "${one.subject}\n${one.preheader}\n\n${one.text}")
        val parts = (telegram + single).joinToString("\n\u0000\n") { part ->
            part.html + "\n\u0001\n" + part.buttons.joinToString("\n") { "${it.text}\t${it.url}" }
        }
        Files.writeString(directory.resolve("telegram-parts.txt"), parts)
    }
}
