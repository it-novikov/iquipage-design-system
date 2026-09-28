package com.sprintique.identity.infrastructure

import com.sprintique.configuration.SmtpProperties
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailPort
import com.sprintique.identity.application.MailUnavailableException
import jakarta.mail.Message
import jakarta.mail.MessagingException
import jakarta.mail.Session
import jakarta.mail.Transport
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import java.util.Date
import java.util.Properties

/**
 * Plain-text letters over SMTP, from the configured address in both the header and the envelope. STARTTLS is
 * required, not merely attempted, unless the relay is on loopback; the server certificate is checked against the
 * host name; every step has a ten-second timeout.
 */
class SmtpMailAdapter(private val smtp: SmtpProperties, from: String) : MailPort {
    private val fromAddress = InternetAddress(from, true)
    private val session = Session.getInstance(
        Properties().apply {
            put("mail.smtp.host", smtp.host)
            // The envelope sender is the configured address, never the account name of the process.
            put("mail.smtp.from", fromAddress.address)
            put("mail.smtp.port", smtp.port.toString())
            put("mail.smtp.connectiontimeout", TIMEOUT)
            put("mail.smtp.timeout", TIMEOUT)
            put("mail.smtp.writetimeout", TIMEOUT)
            put("mail.smtp.ssl.checkserveridentity", "true")
            put("mail.smtp.auth", smtp.username.isNotEmpty().toString())
            when (smtp.security) {
                "starttls" -> {
                    put("mail.smtp.starttls.enable", "true")
                    put("mail.smtp.starttls.required", "true")
                }

                "tls" -> put("mail.smtp.ssl.enable", "true")
            }
        },
    )

    override fun send(message: MailMessage) {
        try {
            val letter = MimeMessage(session).apply {
                // Not `sender`: inside this block that name is the message's own Sender header.
                setFrom(fromAddress)
                setRecipient(Message.RecipientType.TO, InternetAddress(message.to.value, true))
                setSubject(message.subject, Charsets.UTF_8.name())
                setText(message.text, Charsets.UTF_8.name())
                sentDate = Date()
            }
            if (smtp.username.isEmpty()) {
                Transport.send(letter)
            } else {
                Transport.send(letter, smtp.username, smtp.password)
            }
        } catch (error: MessagingException) {
            throw MailUnavailableException(error)
        }
    }

    private companion object {
        const val TIMEOUT = "10000"
    }
}
