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
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import jakarta.mail.internet.MimeUtility
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException
import org.eclipse.angus.mail.smtp.SMTPSendFailedException
import java.util.Date
import java.util.Properties

/**
 * Letters over SMTP (plain text, or multipart/alternative with an HTML part), from the configured address in both the
 * header and the envelope. STARTTLS is
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
            val letter = object : MimeMessage(session) {
                // The sender's own Message-ID when it gave one: the same letter keeps it on every retry.
                override fun updateMessageID() {
                    val id = message.messageId
                    if (id == null) super.updateMessageID() else setHeader("Message-ID", id)
                }
            }.apply {
                // Not `sender`: inside this block that name is the message's own Sender header.
                setFrom(fromAddress)
                setRecipient(Message.RecipientType.TO, InternetAddress(message.to.value, true))
                setSubject(message.subject, Charsets.UTF_8.name())
                // Transactional mail, never a reply target for autoresponders (RFC 3834).
                setHeader("Auto-Submitted", "auto-generated")
                // Composed by the sender: printable ASCII on one line each, checked by MailMessage.
                message.headers.forEach { (name, value) -> setHeader(name, MimeUtility.fold(name.length + 2, value)) }
                val html = message.html
                if (html == null) {
                    setText(message.text, Charsets.UTF_8.name())
                } else {
                    setContent(
                        MimeMultipart("alternative").apply {
                            addBodyPart(MimeBodyPart().apply { setText(message.text, Charsets.UTF_8.name(), "plain") })
                            addBodyPart(MimeBodyPart().apply { setText(html, Charsets.UTF_8.name(), "html") })
                        },
                    )
                }
                sentDate = Date()
            }
            if (smtp.username.isEmpty()) {
                Transport.send(letter)
            } else {
                Transport.send(letter, smtp.username, smtp.password)
            }
        } catch (error: MessagingException) {
            throw MailUnavailableException(error, permanent = refusedForGood(error))
        }
    }

    /** A 5xx answer of the relay (a rejected recipient or letter); 4xx and network failures are worth a retry. */
    private fun refusedForGood(error: MessagingException): Boolean =
        generateSequence<Throwable>(error) { (it as? MessagingException)?.nextException ?: it.cause }
            .take(DEPTH)
            .any { replyCode(it) in PERMANENT }

    private fun replyCode(error: Throwable): Int = when (error) {
        is SMTPAddressFailedException -> error.returnCode
        is SMTPSendFailedException -> error.returnCode
        else -> 0
    }

    private companion object {
        const val TIMEOUT = "10000"
        const val DEPTH = 8
        val PERMANENT = 500..599
    }
}
