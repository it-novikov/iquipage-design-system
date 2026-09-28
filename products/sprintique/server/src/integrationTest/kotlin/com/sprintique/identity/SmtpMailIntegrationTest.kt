package com.sprintique.identity

import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import com.sprintique.configuration.SmtpProperties
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailUnavailableException
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.identity.infrastructure.SmtpMailAdapter
import jakarta.mail.internet.InternetAddress
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

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
    fun `a refused relay is reported as unavailable mail`() {
        val adapter = adapter()
        server.stop()
        assertThatThrownBy {
            adapter.send(MailMessage(EmailAddress.parse("anna@example.org")!!, "Код", "Текст"))
        }.isInstanceOf(MailUnavailableException::class.java)
    }
}
