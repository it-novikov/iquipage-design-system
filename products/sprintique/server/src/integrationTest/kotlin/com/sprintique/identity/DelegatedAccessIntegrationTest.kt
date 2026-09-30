package com.sprintique.identity

import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.Transaction
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.sql.SQLException
import java.util.UUID

/**
 * Migration 027 on a real database: tokens belong to service accounts, bound to a resource, with known scopes and
 * made by someone else; row security holds a service account under its owner's membership; connected apps and the
 * access history cannot be erased by the runtime role; expired access tokens are collected.
 */
class DelegatedAccessIntegrationTest {
    private val runtime = IntegrationDatabase.runtime
    private val suffix = UUID.randomUUID().toString().take(8)
    private val person = "owner-$suffix"
    private val account = "sa_$suffix"
    private val workspace = UUID.randomUUID().toString()
    private val project = "sa-project-$suffix"

    init {
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', 'Тест', 'urn:test', $1)
                """.trimIndent(),
                person,
            )
            tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ($1, 'service', 'Робот')", account)
            tx.update(
                "INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, 'Пространство', $2)",
                workspace,
                person,
            )
            tx.update(
                "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1::uuid, $2, 'admin')",
                workspace,
                person,
            )
            tx.update(
                """
                INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2::uuid, 'Проект', $1, 'SAP')
                """.trimIndent(),
                project,
                workspace,
            )
            for ((id, role) in listOf(person to "editor", account to "editor")) {
                tx.update(
                    "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, $3)",
                    project,
                    id,
                    role,
                )
            }
            tx.update(
                """
                INSERT INTO auth.service_accounts(principal_id, workspace_id, owner_id, created_by)
                VALUES ($1, $2::uuid, $3, $3)
                """.trimIndent(),
                account,
                workspace,
                person,
            )
        }
    }

    private fun insert(
        kind: String,
        audience: String?,
        scopes: List<String>,
        name: String?,
        initiator: String = person,
    ) =
        runtime.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, scopes, audience,
                                             name)
                VALUES ($1, $2, $3, $4, $5, clock_timestamp() + interval '1 day', $6, $7, $8)
                """.trimIndent(),
                UUID.randomUUID().toString(),
                account,
                UUID.randomUUID().toString().replace("-", "").repeat(2),
                kind,
                initiator,
                scopes,
                audience,
                name,
            )
        }

    private fun seesProject(): Boolean = runtime.transaction { tx: Transaction ->
        tx.row("SELECT set_config('app.actor_id', $1, true)", account)
        tx.row("SELECT count(*)::int AS n FROM app.projects WHERE id = $1", project)!!.int("n") == 1
    }

    private fun admin(statement: String, vararg parameters: Any?) {
        IntegrationDatabase.admin.transaction { tx -> tx.update(statement, *parameters) }
    }

    @Test
    fun `a service token needs a name, a resource, known scopes and a maker other than itself`() {
        insert("service", "https://api.example", listOf("read"), name = "Скрипт")
        val violations = listOf(
            { insert("service", null, listOf("read"), name = "Без ресурса") },
            { insert("service", "https://api.example", listOf("admin"), name = "Чужой скоуп") },
            { insert("service", "https://api.example", emptyList(), name = "Без скоупов") },
            { insert("service", "https://api.example", listOf("read"), name = null) },
            { insert("service", "https://api.example", listOf("read"), name = "Сам себе", initiator = account) },
            { insert("oauth", "https://api.example", listOf("read"), name = null) },
            { insert("personal", "https://api.example", listOf("read"), name = "Старый вид") },
        )
        for (violation in violations) {
            assertThatThrownBy { violation() }.isInstanceOf(SQLException::class.java).hasMessageContaining("violates")
        }
    }

    @Test
    fun `row security holds a service account under its owner and stops it with its owner`() {
        assertThat(seesProject()).isTrue()
        admin("DELETE FROM app.project_members WHERE project_id = $1 AND principal_id = $2", project, person)
        assertThat(seesProject()).describedAs("the owner left the project").isFalse()
        admin(
            "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'reader')",
            project,
            person,
        )
        admin("UPDATE auth.service_accounts SET suspended_at = clock_timestamp() WHERE principal_id = $1", account)
        assertThat(seesProject()).describedAs("a suspended account").isFalse()
        admin("UPDATE auth.service_accounts SET suspended_at = NULL WHERE principal_id = $1", account)
        admin("DELETE FROM app.workspace_members WHERE workspace_id = $1::uuid", workspace)
        assertThat(seesProject()).describedAs("the owner left the workspace").isFalse()
        admin(
            "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1::uuid, $2, 'admin')",
            workspace,
            person,
        )
        assertThat(seesProject()).isTrue()
    }

    @Test
    fun `the runtime role cannot erase connected apps, accounts or the access history`() {
        val statements = listOf(
            "DELETE FROM auth.oauth_grants",
            "DELETE FROM auth.access_events",
            "UPDATE auth.access_events SET action = action",
            "DELETE FROM auth.service_accounts",
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
        admin(
            "INSERT INTO auth.oauth_clients(id, name, redirect_uris, grant_types, auth_method) " +
                "VALUES ($1, 'Test', ARRAY['https://app.example/cb'], ARRAY['authorization_code'], 'none')",
            client,
        )
        admin(
            "INSERT INTO auth.oauth_grants(id, client_id, principal_id, granted_by, scopes, resource) " +
                "VALUES ($1::uuid, $2, $3, $4, ARRAY['read'], 'https://api.example/mcp')",
            grant,
            client,
            account,
            person,
        )
        for ((id, age) in listOf(old to "2 days", fresh to "1 hour")) {
            admin(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, initiator_id, expires_at, scopes,
                                             audience, grant_id)
                VALUES ($1, $2, $3, 'oauth', $6, clock_timestamp() - $4::interval, ARRAY['read'],
                        'https://api.example/mcp', $5::uuid)
                """.trimIndent(),
                id,
                account,
                UUID.randomUUID().toString().replace("-", "").repeat(2),
                age,
                grant,
                person,
            )
        }
        runtime.transaction { tx -> tx.row("SELECT auth.collect_oauth_access_tokens(1000) AS n") }
        val left = IntegrationDatabase.admin.transaction { tx ->
            tx.rows("SELECT id FROM auth.credentials WHERE grant_id = $1::uuid", grant).map { it.string("id") }
        }
        assertThat(left).containsExactly(fresh)
    }
}
