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
    /**
     * The origin of the programmatic API and the MCP server (`https://api.iqui.page`), served by the same process.
     * Empty means the interface origin. Session cookies never authorize a request addressed to it.
     */
    val apiOrigin: String = "",
    val host: String = "127.0.0.1",
    val port: Int = 4311,
    /** Hop count (for example `1`) or comma-separated proxy addresses; empty means the socket peer is the client. */
    val trustProxy: String = "",
    val database: DatabaseProperties = DatabaseProperties(),
    val signIn: SignInProperties = SignInProperties(),
    val mail: MailProperties = MailProperties(),
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

    /** The API origin in effect: also the OAuth issuer and the resource identifier of the whole API (RFC 8707). */
    val apiBase: String get() = apiOrigin.ifEmpty { publicOrigin }

    /** The resource identifier of the MCP server. */
    val mcpResource: String get() = "$apiBase/mcp"
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

/** Ways into the product besides e-mail codes: each exists only when fully configured. */
data class SignInProperties(
    val google: GoogleProperties = GoogleProperties(),
    val apple: AppleProperties = AppleProperties(),
    /**
     * PEM certificates trusted for the sign-in providers in addition to the JVM's own, for a provider behind a
     * private certificate authority (a local or test stand). Nothing else in the process trusts them.
     */
    val trustFile: String = "",
)

data class GoogleProperties(
    val issuer: String = "https://accounts.google.com",
    val clientId: String = "",
    val clientSecret: String = "",
) {
    val isConfigured: Boolean get() = clientId.isNotEmpty() && clientSecret.isNotEmpty()
}

/** Sign in with Apple: a Services ID, and the team's private key that signs the short-lived client secret. */
data class AppleProperties(
    val issuer: String = "https://appleid.apple.com",
    val clientId: String = "",
    val teamId: String = "",
    val keyId: String = "",
    /** PKCS#8 PEM file with the key downloaded from Apple (`AuthKey_<keyId>.p8`). */
    val privateKeyFile: String = "",
) {
    val isConfigured: Boolean
        get() = clientId.isNotEmpty() && teamId.isNotEmpty() && keyId.isNotEmpty() && privateKeyFile.isNotEmpty()
}

/** Outgoing mail: sign-in codes. SMTP in production; a local stand may drop messages into a directory instead. */
data class MailProperties(
    /** `Sprintique <no-reply@example.com>`. */
    val from: String = "",
    val smtp: SmtpProperties = SmtpProperties(),
    /** Local stand only: write messages as files into this directory. Refused in production. */
    val drop: String = "",
)

data class SmtpProperties(
    val host: String = "",
    val port: Int = 587,
    val username: String = "",
    val password: String = "",
    /** `starttls` (required upgrade, port 587), `tls` (implicit TLS, port 465) or `none` (loopback relay only). */
    val security: String = "starttls",
) {
    val isConfigured: Boolean get() = host.isNotEmpty()
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
