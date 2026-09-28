package com.sprintique.identity.application

import com.sprintique.identity.domain.EmailAddress

/** A plain-text letter to one person. */
data class MailMessage(val to: EmailAddress, val subject: String, val text: String)

/** Outgoing mail. Exists only when a transport is configured; sign-in by e-mail is offered only then. */
fun interface MailPort {
    /** Throws [MailUnavailableException] when the letter could not be handed over. */
    fun send(message: MailMessage)
}

class MailUnavailableException(cause: Throwable? = null) : RuntimeException("Mail could not be sent", cause)
