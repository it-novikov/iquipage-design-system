package com.sprintique.identity.application

import com.sprintique.identity.domain.EmailAddress

/**
 * A letter to one person: plain text, and optionally the same message as HTML (sent as multipart/alternative).
 * [headers] are extra header fields the sender composed (`List-Unsubscribe`); a value never holds a line break.
 * [messageId] keeps one `Message-ID` across retries of the same letter, so a receiver can tell a repeat.
 */
data class MailMessage(
    val to: EmailAddress,
    val subject: String,
    val text: String,
    val html: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val messageId: String? = null,
) {
    init {
        require(headers.all { (name, value) -> HEADER_NAME.matches(name) && value.all { it.code in PRINTABLE } }) {
            "A mail header must be one line of printable ASCII"
        }
        require(messageId == null || MESSAGE_ID.matches(messageId)) { "Message-ID must be <local@domain>" }
    }

    private companion object {
        val HEADER_NAME = Regex("^[A-Za-z][A-Za-z0-9-]{0,62}$")
        val PRINTABLE = 0x20..0x7e
        val MESSAGE_ID = Regex("^<[A-Za-z0-9._-]{1,128}@[A-Za-z0-9.-]{1,253}>$")
    }
}

/** Outgoing mail. Exists only when a transport is configured; sign-in by e-mail is offered only then. */
fun interface MailPort {
    /** Throws [MailUnavailableException] when the letter could not be handed over. */
    fun send(message: MailMessage)
}

/** The letter was not handed over. [permanent]: the relay refused it for good (a 5xx answer), so a retry is useless. */
class MailUnavailableException(cause: Throwable? = null, val permanent: Boolean = false) :
    RuntimeException("Mail could not be sent", cause)
