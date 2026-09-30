package com.sprintique.identity.application

import com.sprintique.identity.domain.EmailAddress

/** A letter to one person: plain text, and optionally the same message as HTML (sent as multipart/alternative). */
data class MailMessage(val to: EmailAddress, val subject: String, val text: String, val html: String? = null)

/** Outgoing mail. Exists only when a transport is configured; sign-in by e-mail is offered only then. */
fun interface MailPort {
    /** Throws [MailUnavailableException] when the letter could not be handed over. */
    fun send(message: MailMessage)
}

class MailUnavailableException(cause: Throwable? = null) : RuntimeException("Mail could not be sent", cause)
