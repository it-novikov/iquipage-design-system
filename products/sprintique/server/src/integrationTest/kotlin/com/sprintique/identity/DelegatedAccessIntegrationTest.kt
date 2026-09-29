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

    @Test
    fun `the runtime role collects only OAuth access tokens a day past expiry`() {
        val client = "cl_" + UUID.randomUUID().toString().replace("-", "").padEnd(43, 'x')
        val grant = UUID.randomUUID().toString()
        val old = UUID.randomUUID().toString()
        val fresh = UUID.randomUUID().toString()
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                "INSERT INTO auth.oauth_clients(id, name, redirect_uris, grant_types, auth_method) " +
                    "VALUES ($1, 'Test', ARRAY['https://app.example/cb'], ARRAY['authorization_code'], 'none')",
                client,
            )
            tx.update(
                "INSERT INTO auth.oauth_grants(id, client_id, principal_id, scopes, resource) " +
                    "VALUES ($1::uuid, $2, $3, ARRAY['read'], 'https://api.example/mcp')",
                grant,
                client,
                person,
            )
            for ((id, age) in listOf(old to "2 days", fresh to "1 hour")) {
                tx.update(
                    """
                    INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, scopes,
                                                 audience, grant_id)
                    VALUES ($1, $2, $3, 'oauth', $2, clock_timestamp() - $4::interval, ARRAY['read'],
                            'https://api.example/mcp', $5::uuid)
                    """.trimIndent(),
                    id,
                    person,
                    UUID.randomUUID().toString().replace("-", "").repeat(2),
                    age,
                    grant,
                )
            }
        }
        runtime.transaction { tx -> tx.row("SELECT auth.collect_oauth_access_tokens(1000) AS n") }
        val left = IntegrationDatabase.admin.transaction { tx ->
            tx.rows("SELECT id FROM auth.credentials WHERE grant_id = $1::uuid", grant).map { it.string("id") }
        }
        assertThat(left).containsExactly(fresh)
    }
}
