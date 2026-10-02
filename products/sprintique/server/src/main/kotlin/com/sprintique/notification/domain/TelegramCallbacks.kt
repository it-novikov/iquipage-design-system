package com.sprintique.notification.domain

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** What a button press turned out to be. */
sealed interface CallbackCheck {
    /** A quick action on a notification ([QuickAction]), or turning e-mail off for a person (`action` null). */
    data class Valid(val action: QuickAction?, val subject: UUID) : CallbackCheck

    data object Expired : CallbackCheck

    data object Invalid : CallbackCheck
}

/**
 * The `callback_data` of the bot's buttons, signed so that a press cannot be forged or replayed past its time
 * (docs/decisions/0007-notification-channels.md). `q1.<code>.<subject>.<expiry>.<signature>`, 52 bytes at most
 * (Telegram allows 64): the action's letter (`m` turns e-mail off), the notification or the person as a UUID in
 * base64url, the expiry in minutes since the epoch in base 36, and 12 bytes of HMAC-SHA256 under a key derived from
 * the bot token for this purpose alone. A valid signature is not enough: the press is honoured only for the person the
 * chat is linked to, with their current rights.
 */
class TelegramCallbacks(botToken: String) {
    private val key: ByteArray = hmac(botToken.toByteArray(), PURPOSE.toByteArray())

    fun sign(action: QuickAction?, subject: UUID, now: Instant): String {
        val expiry = now.plus(VALIDITY).epochSecond / SECONDS_IN_MINUTE
        val body = "$VERSION.${action?.code ?: MAIL_OFF}.${encode(subject)}.${expiry.toString(RADIX)}"
        return "$body.${signature(body)}"
    }

    fun check(data: String?, now: Instant): CallbackCheck {
        if (data == null || !SHAPE.matches(data)) return CallbackCheck.Invalid
        val body = data.substringBeforeLast('.')
        val signed = MessageDigest.isEqual(signature(body).toByteArray(), data.substringAfterLast('.').toByteArray())
        val parts = body.split('.')
        val code = parts[1].single()
        val action = if (code == MAIL_OFF) null else QuickAction.fromCode(code)
        val subject = decode(parts[2])
        val expiry = parts[3].toLongOrNull(RADIX)
        val known = action != null || code == MAIL_OFF
        return when {
            !signed || !known || subject == null || expiry == null -> CallbackCheck.Invalid
            now.epochSecond / SECONDS_IN_MINUTE >= expiry -> CallbackCheck.Expired
            else -> CallbackCheck.Valid(action, subject)
        }
    }

    private fun signature(body: String): String =
        encoder.encodeToString(hmac(key, body.toByteArray()).copyOf(SIGNATURE_BYTES))

    override fun toString(): String = "TelegramCallbacks"

    companion object {
        /** A button keeps working for a week; a press after that asks the person to open Sprintique. */
        val VALIDITY: Duration = Duration.ofDays(7)

        /** The data of a button that only shows a result and does nothing. */
        const val NOTHING = "q1.done"
        private const val VERSION = "q1"
        private const val MAIL_OFF = 'm'
        private const val PURPOSE = "sprintique/telegram-callback/v1"
        private const val SECONDS_IN_MINUTE = 60
        private const val RADIX = 36
        private const val SIGNATURE_BYTES = 12
        private const val UUID_BYTES = 16
        private val SHAPE = Regex("^q1\\.[a-z]\\.[A-Za-z0-9_-]{22}\\.[0-9a-z]{1,10}\\.[A-Za-z0-9_-]{16}$")
        private val encoder = Base64.getUrlEncoder().withoutPadding()

        private fun encode(id: UUID): String = encoder.encodeToString(
            ByteBuffer.allocate(UUID_BYTES).putLong(id.mostSignificantBits).putLong(id.leastSignificantBits).array(),
        )

        private fun decode(value: String): UUID? = runCatching {
            val buffer = ByteBuffer.wrap(Base64.getUrlDecoder().decode(value))
            UUID(buffer.long, buffer.long)
        }.getOrNull()

        private fun hmac(key: ByteArray, value: ByteArray): ByteArray =
            Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(value)
    }
}
