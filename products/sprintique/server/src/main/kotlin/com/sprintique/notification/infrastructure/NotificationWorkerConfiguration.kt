package com.sprintique.notification.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.configuration.StartupChecks
import com.sprintique.database.Database
import com.sprintique.identity.application.MailPort
import com.sprintique.notification.application.BatchWindows
import com.sprintique.notification.application.NotificationDelivery
import com.sprintique.notification.domain.TelegramCallbacks
import com.sprintique.notification.domain.UnsubscribeTokens
import jakarta.mail.internet.InternetAddress
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import java.time.Duration
import java.time.Instant

/**
 * The `worker` command's part of notifications: deadline reminders and the batches for Telegram and e-mail, on the
 * worker role. Telegram needs the bot token; e-mail needs a mail transport and the key of unsubscribe links.
 */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
class NotificationWorkerConfiguration {
    @Bean
    fun notificationDelivery(
        @Qualifier("workerDatabase") workerDatabase: Database,
        properties: SprintiqueProperties,
        mail: ObjectProvider<MailPort>,
    ): NotificationDelivery {
        StartupChecks.requireTelegramValues(properties.telegram)
        StartupChecks.requireSafeNotifications(properties.notifications)
        val telegram = properties.telegram.takeIf { it.canSend }?.let { TelegramBotApi(it.apiBase, it.botToken) }
        val notifications = properties.notifications
        val tokens = notifications.linkSecret.takeIf { notifications.canSignLinks }?.let(::UnsubscribeTokens)
        val domain = runCatching { InternetAddress(properties.mail.from, true).address.substringAfter('@') }
            .getOrNull()?.takeIf { MAIL_DOMAIN.matches(it) } ?: "sprintique.invalid"
        return NotificationDelivery(
            workerDatabase,
            telegram,
            mail.ifAvailable,
            tokens,
            properties.telegram.botToken.takeIf { it.isNotEmpty() }?.let(::TelegramCallbacks),
            properties.publicOrigin,
            BatchWindows(notifications.telegramWindowSeconds, notifications.emailWindowSeconds),
            domain,
        )
    }

    @Bean
    fun notificationLoop(delivery: NotificationDelivery) = NotificationLoop(delivery)

    private companion object {
        val MAIL_DOMAIN = Regex("^[A-Za-z0-9.-]{1,253}$")
    }
}

/**
 * Sends due batches one after another while there are any, and every five minutes raises the deadline reminders
 * that became due. Idle or failed rounds wait a second.
 */
class NotificationLoop(private val delivery: NotificationDelivery) : SmartLifecycle {
    private val log = LoggerFactory.getLogger(NotificationLoop::class.java)

    @Volatile private var running = false
    private var thread: Thread? = null
    private var nextScan: Instant = Instant.EPOCH

    override fun start() {
        running = true
        thread = Thread.ofPlatform().name("notifications").start {
            while (running) {
                val busy = try {
                    scanWhenDue()
                    delivery.deliverOne()
                } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                    log.warn("Notification round unavailable; retrying. error={}", error.javaClass.name)
                    false
                }
                if (!busy) sleep()
            }
        }
    }

    private fun scanWhenDue() {
        if (Instant.now().isBefore(nextScan)) return
        nextScan = Instant.now().plus(SCAN_EVERY)
        val raised = delivery.raiseDeadlines()
        if (raised > 0) log.info("Deadline reminders raised: {}", raised)
    }

    private fun sleep() {
        try {
            Thread.sleep(IDLE)
        } catch (_: InterruptedException) {
            running = false
        }
    }

    override fun stop() {
        running = false
        thread?.interrupt()
        thread?.join(STOP_WAIT.toMillis())
    }

    override fun isRunning() = running

    private companion object {
        val IDLE: Duration = Duration.ofSeconds(1)
        val SCAN_EVERY: Duration = Duration.ofMinutes(5)
        val STOP_WAIT: Duration = Duration.ofSeconds(10)
    }
}
