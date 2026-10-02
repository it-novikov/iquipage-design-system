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
    /**
     * Enabled product features: a comma-separated list of names, `all` or `none`. Empty means `all` outside
     * production and `none` in production, so a feature reaches production only when it is named there.
     */
    val features: String = "",
    val workbench: WorkbenchProperties = WorkbenchProperties(),
    val ai: AiProperties = AiProperties(),
    val telegram: TelegramProperties = TelegramProperties(),
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

/** The Workbench projection (docs/adr W4). */
data class WorkbenchProperties(
    /**
     * HMAC key of the page cursors, 32+ characters. Empty: a random key per process, so cursors do not survive a
     * restart and several API processes need one shared value.
     */
    val cursorSecret: String = "",
)

/**
 * AI connections and service-account agents (docs/decisions/0005-ai-agents.md). Without [secretsKey] connections
 * cannot be saved or used and the interface says so.
 */
data class AiProperties(
    /** Base64 of 32 random bytes: the AES-256-GCM key that seals the API keys of AI connections. */
    val secretsKey: String = "",
    /** The version stored with every key sealed by [secretsKey]; raise it when the key is replaced. */
    val secretsKeyVersion: Int = 1,
    /** Earlier keys still needed to open keys sealed before a rotation: `version:base64,version:base64`. */
    val previousSecretsKeys: String = "",
    /**
     * Hosts (`host` or `host:port`) a connection may reach over plain HTTP or at a private, loopback or link-local
     * address: a local vLLM or Ollama. Everything else must be public HTTPS.
     */
    val allowedHosts: String = "",
    /** Agent runs this API process works on at once; 0 runs none here (another process does). */
    val runners: Int = 2,
    /** The longest wait for one answer of a provider. */
    val timeoutSeconds: Int = 60,
    /** The first pause before a retry of a busy or failing provider; it doubles with each retry. */
    val retryBaseMillis: Long = 1000,
) {
    val isConfigured: Boolean get() = secretsKey.isNotEmpty()

    /** The keys in logs and errors: never their values. */
    override fun toString(): String =
        "AiProperties(configured=$isConfigured, secretsKeyVersion=$secretsKeyVersion, allowedHosts=$allowedHosts, " +
            "runners=$runners, timeoutSeconds=$timeoutSeconds)"
}

/**
 * Notifications in Telegram (docs/decisions/0006-notifications-telegram.md). All optional: without the bot token,
 * its username and the webhook secret the feature does not exist for people. The worker needs the token only.
 */
data class TelegramProperties(
    /** The token from @BotFather (`123456:ABC…`). A secret: never logged. */
    val botToken: String = "",
    /** The bot's username without `@`, for the `t.me` link that opens the chat. */
    val botUsername: String = "",
    /** The `secret_token` given to `setWebhook`; Telegram sends it back in `X-Telegram-Bot-Api-Secret-Token`. */
    val webhookSecret: String = "",
    /** The Bot API origin; a test stand points it at a fake. */
    val apiBase: String = "https://api.telegram.org",
) {
    /** Whether people can link a chat: the webhook and the link both need these. */
    val isConfigured: Boolean get() = botToken.isNotEmpty() && botUsername.isNotEmpty() && webhookSecret.isNotEmpty()

    /** Whether the worker can send. */
    val canSend: Boolean get() = botToken.isNotEmpty()

    /** The token in logs and errors: never the value. */
    override fun toString(): String =
        "TelegramProperties(botUsername=$botUsername, apiBase=$apiBase, configured=$isConfigured)"
}
