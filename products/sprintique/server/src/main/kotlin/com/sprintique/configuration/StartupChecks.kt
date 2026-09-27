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
 * Refuses to serve with unsafe configuration: an origin with a path, plain HTTP outside loopback, an issuer without
 * HTTPS, a malformed metrics token, a database role that could bypass row security, or a schema that differs from
 * the artifact. An unreachable database is not fatal: readiness reports it until it comes back.
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

        fun requireSafeConfiguration(properties: SprintiqueProperties) {
            val origin = URI(properties.publicOrigin)
            require("${origin.scheme}://${origin.authority}" == properties.publicOrigin) {
                "SPRINTIQUE_PUBLIC_ORIGIN must have no path or trailing slash"
            }
            require(origin.scheme == "https" || origin.host in LOOPBACK) { "HTTPS is required outside loopback" }
            val issuer = properties.oidc.issuer
            require(issuer.isEmpty() || issuer.startsWith("https://")) { "OIDC issuer must use HTTPS" }
            require(!properties.isProduction || properties.oidc.isConfigured) { "Production requires an OIDC provider" }
            val token = properties.metricsToken
            require(token.isEmpty() || token.length in METRICS_TOKEN_MINIMUM..METRICS_TOKEN_MAXIMUM) {
                "Metrics token must contain 32–256 characters."
            }
        }
    }
}
