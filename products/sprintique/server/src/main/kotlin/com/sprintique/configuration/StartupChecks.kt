package com.sprintique.configuration

import com.sprintique.database.Database
import com.sprintique.database.SchemaMigrations
import com.sprintique.problem.ProblemException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.net.URI
import java.sql.SQLException

/**
 * Refuses to serve with unsafe configuration: an origin (interface or API) with a path, plain HTTP outside loopback,
 * a sign-in provider without HTTPS, production without SMTP, a malformed metrics token, a database role that could
 * bypass row security, or a schema that differs from the artifact. An unreachable database is not fatal: readiness
 * reports it until it comes back.
 *
 * The checks run once every bean exists and before the web server starts, so no request is ever served by a process
 * that is about to refuse its configuration.
 */
@Component
@Profile("api")
class StartupChecks(
    private val properties: SprintiqueProperties,
    private val database: Database,
) : SmartInitializingSingleton {
    private val log = LoggerFactory.getLogger(StartupChecks::class.java)

    override fun afterSingletonsInstantiated() {
        requireSafeConfiguration(properties)
        try {
            database.requireSafeRuntimeRole()
            SchemaMigrations.requireCurrent(database.dataSource)
        } catch (error: ProblemException) {
            throw IllegalStateException(error.message, error)
        } catch (error: SQLException) {
            log.warn("Database unavailable at start, readiness will report it: {}", error.sqlState)
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            if (generateSequence<Throwable>(error) { it.cause }.none { it is SQLException }) throw error
            log.warn("Database unavailable at start, readiness will report it")
        }
    }

    companion object {
        private val LOOPBACK = setOf("localhost", "127.0.0.1")
        private const val METRICS_TOKEN_MINIMUM = 32
        private const val METRICS_TOKEN_MAXIMUM = 256
        private val SMTP_SECURITY = setOf("starttls", "tls", "none")
        private val BOT_TOKEN = Regex("^[0-9]{3,20}:[A-Za-z0-9_-]{30,100}$")
        private val BOT_USERNAME = Regex("^[A-Za-z][A-Za-z0-9_]{3,31}$")
        private val WEBHOOK_SECRET = Regex("^[A-Za-z0-9_-]{16,256}$")
        private val SENDER = Regex("^([^<>\\r\\n]{1,100} )?<?[^\\s@<>]{1,64}@[^\\s@<>]{1,255}>?$")

        fun requireSafeConfiguration(properties: SprintiqueProperties) {
            val origin = URI(properties.publicOrigin)
            require("${origin.scheme}://${origin.authority}" == properties.publicOrigin) {
                "SPRINTIQUE_PUBLIC_ORIGIN must have no path or trailing slash"
            }
            require(origin.scheme == "https" || origin.host in LOOPBACK) { "HTTPS is required outside loopback" }
            if (properties.apiOrigin.isNotEmpty()) {
                val api = URI(properties.apiOrigin)
                require("${api.scheme}://${api.authority}" == properties.apiOrigin) {
                    "SPRINTIQUE_API_ORIGIN must have no path or trailing slash"
                }
                require(api.scheme == "https" || api.host in LOOPBACK) {
                    "HTTPS is required for the API outside loopback"
                }
            }
            requireSafeSignIn(properties)
            requireSafeTelegram(properties.telegram)
            val token = properties.metricsToken
            require(token.isEmpty() || token.length in METRICS_TOKEN_MINIMUM..METRICS_TOKEN_MAXIMUM) {
                "Metrics token must contain 32–256 characters."
            }
        }

        /**
         * Telegram is all or nothing for people (token, username, secret), with well-formed values, so a typo does
         * not show a link that never works; the Bot API is reached over HTTPS except on loopback (a test fake).
         */
        fun requireSafeTelegram(telegram: TelegramProperties) {
            val parts = listOf(telegram.botToken, telegram.botUsername, telegram.webhookSecret)
            require(parts.all(String::isEmpty) || parts.none(String::isEmpty)) {
                "Telegram needs SPRINTIQUE_TELEGRAM_BOT_TOKEN, SPRINTIQUE_TELEGRAM_BOT_USERNAME and " +
                    "SPRINTIQUE_TELEGRAM_WEBHOOK_SECRET together"
            }
            requireTelegramValues(telegram)
        }

        /** The worker's part of the check: it sends with the token alone. */
        fun requireTelegramValues(telegram: TelegramProperties) {
            require(telegram.botToken.isEmpty() || BOT_TOKEN.matches(telegram.botToken)) {
                "SPRINTIQUE_TELEGRAM_BOT_TOKEN is not a bot token"
            }
            require(telegram.botUsername.isEmpty() || BOT_USERNAME.matches(telegram.botUsername)) {
                "SPRINTIQUE_TELEGRAM_BOT_USERNAME must be the bot's username without @"
            }
            require(telegram.webhookSecret.isEmpty() || WEBHOOK_SECRET.matches(telegram.webhookSecret)) {
                "SPRINTIQUE_TELEGRAM_WEBHOOK_SECRET must be 16–256 characters A–Z, a–z, 0–9, _ or -"
            }
            val api = URI(telegram.apiBase)
            require("${api.scheme}://${api.authority}" == telegram.apiBase.removeSuffix("/")) {
                "SPRINTIQUE_TELEGRAM_API_BASE must be an origin"
            }
            require(api.scheme == "https" || api.host in LOOPBACK) { "The Telegram Bot API needs HTTPS" }
        }

        /** Providers over HTTPS; codes by SMTP in production, with a sender; the mail drop only off production. */
        private fun requireSafeSignIn(properties: SprintiqueProperties) {
            val google = properties.signIn.google
            val apple = properties.signIn.apple
            require(!google.isConfigured || google.issuer.startsWith("https://")) { "Google issuer must use HTTPS" }
            require(!apple.isConfigured || apple.issuer.startsWith("https://")) { "Apple issuer must use HTTPS" }
            val mail = properties.mail
            val smtp = mail.smtp
            require(!properties.isProduction || smtp.isConfigured) { "Production requires SMTP for sign-in codes" }
            require(!properties.isProduction || mail.drop.isEmpty()) { "The mail drop is never used in production" }
            require(!(smtp.isConfigured && mail.drop.isNotEmpty())) { "Configure either SMTP or the mail drop" }
            require(smtp.security in SMTP_SECURITY) { "SMTP security must be starttls, tls or none" }
            require(!smtp.isConfigured || smtp.security != "none" || smtp.host in LOOPBACK) {
                "SMTP without TLS is allowed only to a loopback relay"
            }
            require(!(smtp.isConfigured || mail.drop.isNotEmpty()) || SENDER.matches(mail.from)) {
                "SPRINTIQUE_MAIL_FROM must be an address, optionally with a name: Sprintique <no-reply@example.com>"
            }
        }
    }
}
