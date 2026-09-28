package com.sprintique.configuration

import org.springframework.boot.context.properties.ConfigurationProperties
import java.net.URI

/**
 * Typed runtime configuration. Environment variables use the `SPRINTIQUE_` prefix, for example
 * `SPRINTIQUE_DATABASE_URL` binds to `database.url`.
 */
@ConfigurationProperties("sprintique")
data class SprintiqueProperties(
    val publicOrigin: String = "http://localhost:4311",
    val host: String = "127.0.0.1",
    val port: Int = 4311,
    /** Hop count (for example `1`) or comma-separated proxy addresses; empty means the socket peer is the client. */
    val trustProxy: String = "",
    val database: DatabaseProperties = DatabaseProperties(),
    val oidc: OidcProperties = OidcProperties(),
    val storage: StorageProperties = StorageProperties(),
    val metricsToken: String = "",
    /** Local debugging only: the fixed admin/admin sign-in. Refused in production and on a non-loopback origin. */
    val devLogin: Boolean = false,
    /** Directory with the built interface (`index.html`, `assets/`); empty serves no interface. */
    val webRoot: String = "",
    /** `production` forbids development conveniences; anything else is a development or test environment. */
    val environment: String = "development",
) {
    val isProduction: Boolean get() = environment == "production"
    val isSecureOrigin: Boolean get() = URI(publicOrigin).scheme == "https"
}

data class DatabaseProperties(
    /** libpq-style URL: `postgresql://user:password@host:port/database?host=/socket/directory`. */
    val url: String = "",
    val workerUrl: String = "",
    val migrationUrl: String = "",
    val runtimeRole: String = "",
    val workerRole: String = "",
    val maximumPoolSize: Int = 12,
)

data class OidcProperties(
    val issuer: String = "",
    val clientId: String = "",
    val clientSecret: String = "",
    /**
     * PEM certificates trusted for this provider in addition to the JVM's own, for a provider behind a private
     * certificate authority. Nothing else in the process trusts them.
     */
    val trustFile: String = "",
) {
    val isConfigured: Boolean get() = issuer.isNotEmpty() && clientId.isNotEmpty() && clientSecret.isNotEmpty()
}

data class StorageProperties(
    val endpoint: String = "",
    val region: String = "",
    val bucket: String = "",
    val accessKeyId: String = "",
    val secretAccessKey: String = "",
    /** Keys under this prefix (`restore-drill/…/`): a verification can read a copy without touching live objects. */
    val prefix: String = "",
) {
    val isConfigured: Boolean get() = endpoint.isNotEmpty()
}
