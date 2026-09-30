package com.sprintique.token

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.HexFormat

/** Random bearer secrets and their stored form. Only the SHA-256 of a secret ever reaches the database. */
object Tokens {
    private const val SECRET_BYTES = 32
    private const val DECIMAL = 10
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    /** 256 random bits as 43 base64url characters. */
    fun random(): String = ByteArray(SECRET_BYTES).also(random::nextBytes).let(encoder::encodeToString)

    /** A random secret with a prefix that names its kind (`spk_…`), so a leaked one is recognizable by scanners. */
    fun prefixed(prefix: String): String = prefix + random()

    /** `length` uniformly random decimal digits: a code a person types from a letter. */
    fun digits(length: Int): String = buildString { repeat(length) { append(random.nextInt(DECIMAL)) } }

    fun sha256Hex(value: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)))

    /** Constant-time comparison through digests, so neither length nor prefix leaks. */
    fun equalsInConstantTime(left: String, right: String): Boolean {
        val digest = { value: String -> MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)) }
        return MessageDigest.isEqual(digest(left), digest(right))
    }
}
