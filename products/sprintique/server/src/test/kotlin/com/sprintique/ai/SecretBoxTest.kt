package com.sprintique.ai

import com.sprintique.ai.application.SecretBox
import com.sprintique.configuration.AiProperties
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.security.SecureRandom
import java.util.Base64

class SecretBoxTest {
    private fun key(): String = Base64.getEncoder().encodeToString(ByteArray(32).also(SecureRandom()::nextBytes))

    private fun box(secret: String, version: Int = 1, previous: String = ""): SecretBox {
        val ai = AiProperties(secretsKey = secret, secretsKeyVersion = version, previousSecretsKeys = previous)
        return SecretBox(SprintiqueProperties(ai = ai))
    }

    @Test
    fun `a sealed key opens only with its key, its connection and its version`() {
        val secret = key()
        val box = box(secret)
        val sealed = box.seal("sk-ant-test-key-1234", "connection/a")
        assertThat(String(sealed, Charsets.ISO_8859_1)).doesNotContain("sk-ant-test-key-1234")
        assertThat(box.open(sealed, 1, "connection/a")).isEqualTo("sk-ant-test-key-1234")
        // Moved to another connection, given another version or altered: it does not open.
        assertThat(box.open(sealed, 1, "connection/b")).isNull()
        assertThat(box.open(sealed, 2, "connection/a")).isNull()
        val altered = sealed.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 1).toByte() }
        assertThat(box.open(altered, 1, "connection/a")).isNull()
        assertThat(box(key()).open(sealed, 1, "connection/a")).isNull()
        // Every seal has its own nonce.
        assertThat(box.seal("same", "connection/a")).isNotEqualTo(box.seal("same", "connection/a"))
    }

    @Test
    fun `a new key seals while the previous one still opens what it sealed`() {
        val old = key()
        val sealed = box(old).seal("sk-old-12345678", "connection/a")
        val rotated = box(key(), version = 2, previous = "1:$old")
        assertThat(rotated.version).isEqualTo(2)
        assertThat(rotated.open(sealed, 1, "connection/a")).isEqualTo("sk-old-12345678")
        val resealed = rotated.seal("sk-old-12345678", "connection/a")
        assertThat(rotated.open(resealed, 2, "connection/a")).isEqualTo("sk-old-12345678")
    }

    @Test
    fun `without a key nothing is sealed, and a malformed key stops the server`() {
        val none = box("")
        assertThat(none.isConfigured).isFalse()
        assertThatThrownBy { none.seal("x", "connection/a") }.isInstanceOf(ProblemException::class.java)
        assertThatThrownBy { box("c2hvcnQ=") }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageNotContaining("c2hvcnQ=")
        assertThatThrownBy { box(key(), previous = "nonsense") }.isInstanceOf(IllegalArgumentException::class.java)
    }
}
