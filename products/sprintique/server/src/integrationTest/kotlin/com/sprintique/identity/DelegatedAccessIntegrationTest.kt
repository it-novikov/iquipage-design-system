package com.sprintique.identity

import com.sprintique.database.IntegrationDatabase
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.sql.SQLException
import java.util.UUID

/**
 * Migration 027 on a real database: a delegated credential is always its own person's, bound to a resource, with
 * known scopes and without a project; connected apps and the access history cannot be erased by the runtime role.
 */
class DelegatedAccessIntegrationTest {
    private val runtime = IntegrationDatabase.runtime
    private val person = "delegated-" + UUID.randomUUID()

    init {
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', 'Тест', 'urn:test', $1)
                """.trimIndent(),
                person,
            )
        }
    }

    private fun insert(kind: String, audience: String?, scopes: List<String>, name: String?) =
        runtime.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, scopes, audience,
                                             name)
                VALUES ($1, $2, $3, $4, $2, clock_timestamp() + interval '1 day', $5, $6, $7)
                """.trimIndent(),
                UUID.randomUUID().toString(),
                person,
                UUID.randomUUID().toString().replace("-", "").repeat(2),
                kind,
                scopes,
                audience,
                name,
            )
        }

    @Test
    fun `a personal token needs a name, a resource and known scopes, and is its person's own`() {
        insert("personal", "https://api.example", listOf("read"), name = "Скрипт")
        val violations = listOf(
            { insert("personal", null, listOf("read"), name = "Без ресурса") },
            { insert("personal", "https://api.example", listOf("admin"), name = "Чужой скоуп") },
            { insert("personal", "https://api.example", emptyList(), name = "Без скоупов") },
            { insert("personal", "https://api.example", listOf("read"), name = null) },
            { insert("oauth", "https://api.example", listOf("read"), name = null) },
            { insert("session", "https://api.example", listOf("read"), name = null) },
        )
        for (violation in violations) {
            assertThatThrownBy { violation() }.isInstanceOf(SQLException::class.java).hasMessageContaining("violates")
        }
    }

    @Test
    fun `the runtime role cannot erase connected apps or the access history`() {
        val statements = listOf(
            "DELETE FROM auth.oauth_grants",
            "DELETE FROM auth.access_events",
            "UPDATE auth.access_events SET action = action",
        )
        for (statement in statements) {
            assertThatThrownBy { runtime.transaction { tx -> tx.update(statement) } }
                .isInstanceOf(SQLException::class.java)
                .extracting { (it as SQLException).sqlState }
                .isEqualTo("42501")
        }
        val collected = runtime.transaction { tx -> tx.update("DELETE FROM auth.oauth_codes WHERE false") }
        assertThat(collected).isZero()
    }
}
