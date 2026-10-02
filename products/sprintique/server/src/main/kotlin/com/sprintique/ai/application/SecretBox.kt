package com.sprintique.ai.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.problem.ProblemException
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Seals and opens the API keys of AI connections with AES-256-GCM (docs/decisions/0005-ai-agents.md). The key comes
 * from the environment (`SPRINTIQUE_SECRETS_KEY`, base64 of 32 bytes) with a version stored next to every sealed
 * value, so a key can be replaced: the new one seals, the earlier ones (`SPRINTIQUE_SECRETS_PREVIOUS_KEYS`) still
 * open what they sealed until it is saved again. A sealed value is a random 96-bit nonce followed by the ciphertext
 * and its tag; the associated data binds it to one connection and one key version, so it cannot be moved to another.
 */
@Component
@Profile("api")
class SecretBox(properties: SprintiqueProperties) {
    private val keys: Map<Int, SecretKey>

    /** The version new values are sealed with. */
    val version: Int = properties.ai.secretsKeyVersion

    init {
        val ai = properties.ai
        val found = linkedMapOf<Int, SecretKey>()
        if (ai.isConfigured) {
            require(version in 1..MAX_VERSION) { "SPRINTIQUE_SECRETS_KEY_VERSION must be 1..$MAX_VERSION" }
            found[version] = key(ai.secretsKey, "SPRINTIQUE_SECRETS_KEY")
            for (entry in ai.previousSecretsKeys.split(',').map(String::trim).filter(String::isNotEmpty)) {
                val previous = entry.substringBefore(':').toIntOrNull()
                require(previous != null && previous in 1..MAX_VERSION && previous != version && entry.contains(':')) {
                    "SPRINTIQUE_SECRETS_PREVIOUS_KEYS must be version:base64 pairs of other versions"
                }
                found[previous] = key(entry.substringAfter(':'), "SPRINTIQUE_SECRETS_PREVIOUS_KEYS")
            }
        }
        keys = found
    }

    val isConfigured: Boolean get() = keys.isNotEmpty()

    fun seal(plain: String, context: String): ByteArray {
        val key = keys[version] ?: throw unavailable()
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        cipher.updateAAD(aad(context, version))
        return nonce + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    }

    /** Opens a sealed value; null when its key version is not configured or it does not authenticate. */
    fun open(sealed: ByteArray, sealedVersion: Int, context: String): String? {
        val key = keys[sealedVersion] ?: return null
        if (sealed.size <= NONCE_BYTES + TAG_BITS / Byte.SIZE_BITS) return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed.copyOfRange(0, NONCE_BYTES)))
            cipher.updateAAD(aad(context, sealedVersion))
            String(cipher.doFinal(sealed.copyOfRange(NONCE_BYTES, sealed.size)), Charsets.UTF_8)
        }.getOrNull()
    }

    fun unavailable() = ProblemException(
        503,
        "AI_SECRETS_UNAVAILABLE",
        "ИИ-подключения не настроены на сервере: нет ключа шифрования. Обратитесь к администратору сервера.",
    )

    private fun aad(context: String, keyVersion: Int) =
        "sprintique/ai/$context/v$keyVersion".toByteArray(Charsets.UTF_8)

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val NONCE_BYTES = 12
        const val TAG_BITS = 128
        const val KEY_BYTES = 32
        const val MAX_VERSION = 1000
        val random = SecureRandom()

        fun key(value: String, name: String): SecretKey {
            val bytes = runCatching { Base64.getDecoder().decode(value.trim()) }.getOrNull()
            require(bytes != null && bytes.size == KEY_BYTES) { "$name must be base64 of exactly 32 bytes" }
            return SecretKeySpec(bytes, "AES")
        }
    }
}
