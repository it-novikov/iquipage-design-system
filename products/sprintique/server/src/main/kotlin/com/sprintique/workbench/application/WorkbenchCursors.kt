package com.sprintique.workbench.application

import com.sprintique.problem.ProblemException
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Where a page ends, and for whom: the binding a page cursor carries (docs/adr W4). */
data class CursorScope(val actorId: String, val epoch: String, val section: String, val filter: String)

/** A verified cursor: the position after which the next page starts and the authorization epoch it was cut in. */
data class OpenedCursor(val after: String, val epoch: String)

/**
 * Opaque page cursors of the Workbench: `base64url(payload).base64url(HMAC-SHA256)`. The payload binds the actor, the
 * authorization epoch, the section, the filter and an expiry, so a cursor cannot be carried to another person, another
 * filter or past a change of access. Every foreign or tampered cursor gets the same answer.
 */
class WorkbenchCursors(secret: String, private val clock: Clock = Clock.systemUTC()) {
    private val key: ByteArray =
        if (secret.isEmpty()) ByteArray(KEY_BYTES).also(SecureRandom()::nextBytes) else secret.toByteArray()

    init {
        require(secret.isEmpty() || secret.length >= MINIMUM_SECRET) {
            "SPRINTIQUE_WORKBENCH_CURSOR_SECRET must contain at least 32 characters."
        }
    }

    fun encode(scope: CursorScope, after: String): String {
        val payload = json.writeValueAsBytes(
            linkedMapOf(
                "v" to VERSION,
                "a" to scope.actorId,
                "e" to scope.epoch,
                "s" to scope.section,
                "f" to scope.filter,
                "x" to clock.instant().plus(LIFETIME).epochSecond,
                "k" to after,
            ),
        )
        return encoder.encodeToString(payload) + "." + encoder.encodeToString(mac(payload))
    }

    /**
     * The position after which the next page starts, if the cursor was issued to this actor for this section and
     * filter and has not expired. The epoch it carries is compared by [requireEpoch] once the current one is known.
     */
    fun open(cursor: String, actorId: String, section: String, filter: String): OpenedCursor {
        val parts = cursor.split('.')
        valid(parts.size == 2)
        val payload = decode(parts[0])
        valid(MessageDigest.isEqual(mac(payload), decode(parts[1])))
        val value = runCatching { json.readTree(payload) }.getOrElse { throw invalid() }
        valid(
            value.path("v").asInt(0) == VERSION && value.path("a").asString("") == actorId &&
                value.path("s").asString("") == section && value.path("f").asString("") == filter,
        )
        if (value.path("x").asLong(0) <= clock.instant().epochSecond) {
            throw ProblemException(400, "CURSOR_EXPIRED", "Страница устарела. Обновите рабочий стол.")
        }
        val after = value.path("k")
        valid(after.isString && after.asString().length <= KEY_LIMIT)
        return OpenedCursor(after.asString(), value.path("e").asString(""))
    }

    private fun decode(part: String): ByteArray = runCatching { decoder.decode(part) }.getOrElse { throw invalid() }

    private fun valid(condition: Boolean) {
        if (!condition) throw invalid()
    }

    fun requireEpoch(cursor: OpenedCursor, epoch: String) {
        if (cursor.epoch != epoch) {
            throw ProblemException(409, "CURSOR_STALE", "Доступ к проектам изменился. Обновите рабочий стол.")
        }
    }

    private fun mac(payload: ByteArray): ByteArray =
        Mac.getInstance(ALGORITHM).apply { init(SecretKeySpec(key, ALGORITHM)) }.doFinal(payload)

    private fun invalid() = ProblemException(400, "CURSOR_INVALID", "Курсор недействителен. Обновите рабочий стол.")

    companion object {
        private const val VERSION = 1
        private const val KEY_BYTES = 32
        private const val MINIMUM_SECRET = 32
        private const val KEY_LIMIT = 400
        private const val ALGORITHM = "HmacSHA256"
        val LIFETIME: Duration = Duration.ofMinutes(15)
        private val json = JsonMapper.builder().build()
        private val encoder = Base64.getUrlEncoder().withoutPadding()
        private val decoder = Base64.getUrlDecoder()
    }
}
