package com.sprintique.access.application

import com.sprintique.access.domain.InvitationLetter
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailPort
import com.sprintique.identity.application.MailUnavailableException
import com.sprintique.problem.ProblemException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * Sends the letters of committed invitations through the same transport as sign-in codes, then records for each
 * whether the relay accepted it. A letter is sent only after its invitation is committed, so a letter never points
 * to an invitation that does not exist; a letter the relay refused leaves the invitation «Не отправлено».
 */
@Component
@Profile("api")
class InvitationMail(
    private val database: Database,
    private val mail: ObjectProvider<MailPort>,
    private val properties: SprintiqueProperties,
) {
    private val log = LoggerFactory.getLogger(InvitationMail::class.java)

    val origin: String get() = properties.publicOrigin

    /** Letters need a transport; without one, a link without a letter is the way to invite. */
    fun requireAvailable() {
        if (mail.ifAvailable == null) {
            throw ProblemException(
                503,
                "MAIL_UNAVAILABLE",
                "Почта для приглашений не настроена. Создайте ссылку без письма.",
            )
        }
    }

    /** Sends every letter and returns the invitations with their final delivery state. */
    fun deliver(batch: InvitationBatch): List<Map<String, Any?>> {
        val transport = mail.ifAvailable
        val outcomes = batch.letters.associate { letter ->
            val rendered = InvitationLetter.render(letter.content)
            val sent = try {
                transport?.send(MailMessage(letter.email, rendered.subject, rendered.text, rendered.html)) != null
            } catch (error: MailUnavailableException) {
                log.warn("Invitation letter could not be sent: {}", error.cause?.javaClass?.simpleName)
                false
            }
            letter.invitationId to sent
        }
        if (outcomes.isEmpty()) return batch.invitations
        database.transaction { tx -> outcomes.forEach { (id, sent) -> Invitations.recordDelivery(tx, id, sent) } }
        return batch.invitations.map { invitation ->
            val sent = outcomes[invitation["id"]] ?: return@map invitation
            LinkedHashMap(invitation).apply {
                put("delivery", if (sent) "sent" else "failed")
                if (!sent) put("deliveryError", "Письмо не ушло: почтовый сервер не ответил.")
            }
        }
    }
}
