package com.sprintique.notification.domain

import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** What a link's token turned out to be. */
sealed interface UnsubscribeCheck {
    data class Valid(val principalId: String) : UnsubscribeCheck

    data object Expired : UnsubscribeCheck

    data object Invalid : UnsubscribeCheck
}

/**
 * The token of a letter's one-click unsubscribe link (RFC 8058): it turns e-mail notifications off for one person
 * without signing in, and does nothing else. `<payload>.<signature>`, both base64url: the payload names the version,
 * the expiry and the person; the signature is HMAC-SHA256 under a key derived from the configured secret for this one
 * purpose. A token is checked in constant time, signature first, so a changed one says nothing about its contents.
 * It holds an opaque account id, never an address or a name.
 */
class UnsubscribeTokens(secret: String) {
    init {
        require(secret.length >= MINIMUM_SECRET) { "The link secret is too short" }
    }

    private val key: ByteArray = hmac(secret.toByteArray(), PURPOSE.toByteArray())

    fun issue(principalId: String, now: Instant): String {
        require(PRINCIPAL.matches(principalId)) { "Not an account id" }
        val payload = encoder.encodeToString("$VERSION|${now.plus(VALIDITY).epochSecond}|$principalId".toByteArray())
        return "$payload.${encoder.encodeToString(hmac(key, payload.toByteArray()))}"
    }

    fun check(token: String?, now: Instant): UnsubscribeCheck {
        if (token == null || !SHAPE.matches(token)) return UnsubscribeCheck.Invalid
        val (payload, signature) = token.split('.')
        val expected = hmac(key, payload.toByteArray())
        val given = runCatching { Base64.getUrlDecoder().decode(signature) }.getOrNull()
        if (given == null || !MessageDigest.isEqual(expected, given)) return UnsubscribeCheck.Invalid
        val parts = runCatching { String(Base64.getUrlDecoder().decode(payload)) }.getOrNull()?.split('|', limit = 3)
        val expiry = parts?.getOrNull(1)?.toLongOrNull()
        val person = parts?.getOrNull(2)
        return when {
            parts == null || parts[0] != VERSION || expiry == null || person == null || !PRINCIPAL.matches(person) ->
                UnsubscribeCheck.Invalid

            now.epochSecond >= expiry -> UnsubscribeCheck.Expired

            else -> UnsubscribeCheck.Valid(person)
        }
    }

    override fun toString(): String = "UnsubscribeTokens"

    companion object {
        /** Long enough to reach a letter read weeks later; a fresh letter brings a fresh link. */
        val VALIDITY: Duration = Duration.ofDays(60)
        private const val VERSION = "u1"
        private const val PURPOSE = "sprintique/email-unsubscribe/v1"
        private const val MINIMUM_SECRET = 32
        private val SHAPE = Regex("^[A-Za-z0-9_-]{8,400}\\.[A-Za-z0-9_-]{43}$")
        private val PRINCIPAL = Regex("^\\S{1,200}$")
        private val encoder = Base64.getUrlEncoder().withoutPadding()

        private fun hmac(key: ByteArray, value: ByteArray): ByteArray =
            Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(value)
    }
}
