package com.sprintique.identity.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.identity.application.MailPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile

/**
 * SMTP exists only when a host is configured; without any transport, sign-in by e-mail is not offered. The worker
 * sends notification letters through the same adapter (docs/decisions/0007-notification-channels.md).
 */
@Configuration(proxyBeanMethods = false)
@Profile("api", "worker")
@ConditionalOnExpression("'\${sprintique.mail.smtp.host:}' != ''")
class MailConfiguration {
    @Bean
    fun smtpMail(
        properties: SprintiqueProperties,
    ): MailPort = SmtpMailAdapter(properties.mail.smtp, properties.mail.from)
}
