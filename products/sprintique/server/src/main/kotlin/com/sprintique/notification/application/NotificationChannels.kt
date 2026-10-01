package com.sprintique.notification.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.application.MailPort
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.UnsubscribeCheck
import com.sprintique.notification.domain.UnsubscribeTokens
import com.sprintique.problem.requireCondition
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant

/** A person's choice: which external channels are on, and which kinds go to them. */
data class ChannelChoice(val email: Boolean, val telegram: Boolean, val kinds: Map<NotificationKind, Boolean>) {
    val muted: List<String> get() = NotificationKind.entries.filter { kinds[it] == false }.map { it.wire }
}

/**
 * Where a person's notifications go outside the product (docs/decisions/0007-notification-channels.md): the e-mail
 * of their account and Telegram, the kinds for both, the project switch «Внешние уведомления», and the one-click
 * unsubscribe of a letter. E-mail exists when the server has a mail transport and the key of unsubscribe links, and
 * the person has an address; Telegram when the bot is configured. The bell in the product always shows everything.
 */
@Component
@Profile("api")
class NotificationChannels(
    private val properties: SprintiqueProperties,
    private val database: Database,
    private val mail: ObjectProvider<MailPort>,
) {
    private val log = LoggerFactory.getLogger(NotificationChannels::class.java)
    private val tokens = properties.notifications.linkSecret
        .takeIf { properties.notifications.canSignLinks }?.let(::UnsubscribeTokens)

    /** Whether the server can send notification letters at all. */
    val emailAvailable: Boolean get() = tokens != null && mail.ifAvailable != null

    val telegramAvailable: Boolean get() = properties.telegram.isConfigured

    fun settings(tx: Transaction, actor: Actor): Map<String, Any?> {
        Notifications.requireHuman(actor)
        val person = tx.row(
            """
            SELECT p.email, n.muted_kinds AS muted, n.email_enabled AS "emailEnabled",
                   n.telegram_enabled AS "telegramEnabled", c.username, c.linked_at AS "linkedAt"
            FROM auth.principals p
            LEFT JOIN app.notification_preferences n ON n.principal_id = p.id
            LEFT JOIN app.telegram_connections c ON c.principal_id = p.id
            WHERE p.id = $1
            """.trimIndent(),
            actor.id,
        )
        val muted = person?.strings("muted").orEmpty()
        val address = person?.stringOrNull("email")
        val linked = person?.instantOrNull("linkedAt")
        return linkedMapOf(
            "email" to linkedMapOf(
                "available" to (emailAvailable && address != null),
                "address" to address?.takeIf { emailAvailable },
            ),
            "telegram" to linkedMapOf(
                "available" to telegramAvailable,
                "botUsername" to properties.telegram.botUsername.takeIf { telegramAvailable },
                "connection" to linked?.takeIf { telegramAvailable }?.let {
                    linkedMapOf("username" to person.stringOrNull("username"), "linkedAt" to it.toString())
                },
            ),
            "preferences" to linkedMapOf(
                "channels" to linkedMapOf(
                    "email" to (person?.get("emailEnabled") as? Boolean ?: false),
                    "telegram" to (person?.get("telegramEnabled") as? Boolean ?: true),
                ),
                "kinds" to NotificationKind.entries.associate { it.wire to (it.wire !in muted) },
            ),
        )
    }

    /** Saves the whole choice at once; e-mail can be turned on only where it exists for the person. */
    fun change(tx: Transaction, actor: Actor, choice: ChannelChoice): Map<String, Any?> {
        Notifications.requireHuman(actor)
        ProjectAccess.requireActiveCredential(tx, actor)
        if (choice.email) {
            val address = tx.row("SELECT email FROM auth.principals WHERE id = $1", actor.id)?.stringOrNull("email")
            requireCondition(
                emailAvailable && address != null,
                409,
                "EMAIL_UNAVAILABLE",
                "Уведомления на почту сейчас недоступны.",
            )
        }
        tx.update(
            """
            INSERT INTO app.notification_preferences(principal_id, muted_kinds, email_enabled, telegram_enabled)
            VALUES ($1, $2::text[], $3, $4)
            ON CONFLICT (principal_id) DO UPDATE SET muted_kinds = EXCLUDED.muted_kinds,
                email_enabled = EXCLUDED.email_enabled, telegram_enabled = EXCLUDED.telegram_enabled,
                revision = app.notification_preferences.revision + 1, updated_at = clock_timestamp()
            """.trimIndent(),
            actor.id,
            choice.muted,
            choice.email,
            choice.telegram,
        )
        return settings(tx, actor)
    }

    fun project(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> =
        Notifications.projectSwitch(tx, actor, projectId, emailAvailable || telegramAvailable)

    /** The project switch, with the project settings permission and the revision the person saw. */
    fun changeProject(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        enabled: Boolean,
        baseRevision: Long,
    ): Map<String, Any?> {
        ProjectAccess.requireInteractive(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.PROJECT_SETTINGS)
        val current = tx.row("SELECT revision FROM app.project_notification_settings WHERE project_id = $1", projectId)
        requireCondition((current?.long("revision") ?: 0L) == baseRevision, 409, "CONFLICT", "Настройка уже изменена.")
        tx.update(
            """
            INSERT INTO app.project_notification_settings(project_id, enabled, updated_by) VALUES ($1, $2, $3)
            ON CONFLICT (project_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by,
                revision = app.project_notification_settings.revision + 1, updated_at = clock_timestamp()
            """.trimIndent(),
            projectId,
            enabled,
            actor.id,
        )
        return project(tx, actor, projectId)
    }

    /** What an unsubscribe link holds, without changing anything (the page a person opens before confirming). */
    fun checkUnsubscribe(token: String?): UnsubscribeCheck =
        tokens?.check(token, Instant.now()) ?: UnsubscribeCheck.Invalid

    /**
     * One-click unsubscribe (RFC 8058): a valid link turns e-mail off for its person, whoever follows it and without
     * a session; repeating it changes nothing. Logs say only the outcome.
     */
    fun unsubscribe(token: String?): UnsubscribeCheck {
        val check = checkUnsubscribe(token)
        if (check is UnsubscribeCheck.Valid) {
            database.transaction { tx ->
                tx.row("SELECT app.turn_off_email_notifications($1) AS done", check.principalId)
            }
        }
        log.info("E-mail unsubscribe: {}", check.javaClass.simpleName.lowercase())
        return check
    }
}
