package com.sprintique.identity

import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import com.sprintique.access.domain.InvitationContent
import com.sprintique.access.domain.InvitationLetter
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.configuration.SmtpProperties
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailUnavailableException
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.identity.infrastructure.SmtpMailAdapter
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMultipart
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId

/** The SMTP adapter against a real SMTP server on loopback: authentication, UTF-8 and a refused relay. */
class SmtpMailIntegrationTest {
    private val server = GreenMail(ServerSetup(0, "127.0.0.1", ServerSetup.PROTOCOL_SMTP).dynamicPort())

    @BeforeEach
    fun start() {
        server.start()
        server.setUser("relay@sprintique.test", "relay", "relay-secret")
    }

    @AfterEach
    fun stop() = server.stop()

    private fun adapter(password: String = "relay-secret") = SmtpMailAdapter(
        SmtpProperties("127.0.0.1", server.smtp.port, "relay", password, "none"),
        "Sprintique <no-reply@sprintique.test>",
    )

    @Test
    fun `a letter reaches the relay intact`() {
        val anna = EmailAddress.parse("anna@example.org")!!
        adapter().send(MailMessage(anna, "Код для входа: 123456", "Ваш код: 123456"))
        val letter = server.receivedMessages.single()
        assertThat(letter.subject).isEqualTo("Код для входа: 123456")
        assertThat((letter.from.single() as InternetAddress).address).isEqualTo("no-reply@sprintique.test")
        assertThat(letter.getHeader("Return-Path").single()).isEqualTo("<no-reply@sprintique.test>")
        assertThat(letter.allRecipients.map { (it as InternetAddress).address }).containsExactly("anna@example.org")
        assertThat((letter.content as String).trim()).isEqualTo("Ваш код: 123456")
    }

    @Test
    fun `an invitation letter leaves as multipart alternative with plain text and HTML`() {
        val ivan = EmailAddress.parse("ivan@example.org")!!
        val letter = InvitationLetter.render(
            InvitationContent(
                inviterName = "Анна Ким",
                workspaceName = "Ромашка",
                workspaceRole = WorkspaceRole.MEMBER,
                projectNames = listOf("Платформа"),
                presetName = "Редактор",
                presetHint = "Ведёт задачи.",
                expiresAt = Instant.parse("2026-10-07T09:00:00Z"),
                zone = ZoneId.of("Europe/Moscow"),
                email = ivan.value,
                link = "https://sprintique.iqui.page/#invite/invite_" + "B".repeat(43),
            ),
        )
        adapter().send(MailMessage(ivan, letter.subject, letter.text, letter.html))
        val received = server.receivedMessages.single()
        assertThat(received.subject).isEqualTo("Анна Ким приглашает вас в пространство «Ромашка» — Sprintique")
        assertThat(received.getHeader("Auto-Submitted").single()).isEqualTo("auto-generated")
        assertThat(received.contentType).startsWith("multipart/alternative")
        val parts = received.content as MimeMultipart
        assertThat(parts.count).isEqualTo(2)
        assertThat(parts.getBodyPart(0).contentType).startsWith("text/plain").contains("UTF-8")
        assertThat(parts.getBodyPart(1).contentType).startsWith("text/html").contains("UTF-8")
        assertThat(parts.getBodyPart(0).content as String)
            .contains("Принять приглашение: https://sprintique.iqui.page/#invite/")
        assertThat(parts.getBodyPart(1).content as String).contains("href=\"https://sprintique.iqui.page/#invite/")
    }

    @Test
    fun `a refused relay is reported as unavailable mail`() {
        val adapter = adapter()
        server.stop()
        assertThatThrownBy {
            adapter.send(MailMessage(EmailAddress.parse("anna@example.org")!!, "Код", "Текст"))
        }.isInstanceOf(MailUnavailableException::class.java)
    }
}
