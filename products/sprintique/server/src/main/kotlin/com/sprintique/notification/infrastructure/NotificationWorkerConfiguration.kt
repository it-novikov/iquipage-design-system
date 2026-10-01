package com.sprintique.notification.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.configuration.StartupChecks
import com.sprintique.database.Database
import com.sprintique.notification.application.TelegramDelivery
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import java.time.Duration
import java.time.Instant

/** The `worker` command's part of notifications: deadline reminders and the Telegram queue, on the worker role. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
class NotificationWorkerConfiguration {
    @Bean
    fun telegramDelivery(
        @Qualifier("workerDatabase") workerDatabase: Database,
        properties: SprintiqueProperties,
    ): TelegramDelivery {
        StartupChecks.requireTelegramValues(properties.telegram)
        val telegram = properties.telegram.takeIf { it.canSend }?.let { TelegramBotApi(it.apiBase, it.botToken) }
        return TelegramDelivery(workerDatabase, telegram, properties.publicOrigin)
    }

    @Bean
    fun notificationLoop(delivery: TelegramDelivery) = NotificationLoop(delivery)
}

/**
 * Sends queued messages one after another while there are any, and every five minutes raises the deadline reminders
 * that became due. Idle or failed rounds wait a second.
 */
class NotificationLoop(private val delivery: TelegramDelivery) : SmartLifecycle {
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
