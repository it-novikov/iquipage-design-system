package com.sprintique.database

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.configuration.StartupChecks
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.boot.DefaultApplicationArguments
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class DatabaseIntegrationTest {
    private val runtime = IntegrationDatabase.runtime

    @Test
    fun `the runtime role is accepted and the owner role is refused`() {
        runtime.requireSafeRuntimeRole()
        Database.connect(IntegrationDatabase.migrationUrl, 1, "test-owner").use { owner ->
            assertThatThrownBy { owner.requireSafeRuntimeRole() }
                .isInstanceOf(ProblemException::class.java)
                .extracting("code").isEqualTo("UNSAFE_DATABASE_ROLE")
        }
    }

    @Test
    fun `the API refuses to start with the owner role`() {
        Database.connect(IntegrationDatabase.migrationUrl, 1, "test-owner-start").use { owner ->
            val checks = StartupChecks(SprintiqueProperties(), owner)
            assertThatThrownBy { checks.run(DefaultApplicationArguments()) }
                .isInstanceOf(IllegalStateException::class.java)
                .hasMessageContaining("NOBYPASSRLS")
        }
    }

    @Test
    fun `the applied schema matches the migrations in the artifact`() {
        SchemaMigrations.requireCurrent(runtime.dataSource)
    }

    @Test
    fun `request context ends with its transaction and never reaches the next user of a connection`() {
        Database.connect(
            IntegrationDatabase.environment("SPRINTIQUE_TEST_DATABASE_URL"),
            1,
            "test-single",
        ).use { single ->
            single.transaction { tx -> tx.row("SELECT set_config('app.actor_id', 'someone', true)") }
            val leaked = single.transaction { tx ->
                tx.row("SELECT coalesce(current_setting('app.actor_id', true), '') AS actor")
            }
            assertThat(leaked?.get("actor")).isEqualTo("")
        }
    }

    @Test
    fun `row security hides tenant data from a transaction without context`() {
        val workspace = UUID.randomUUID().toString()
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES (${'$'}1, 'human', 'Тест', 'urn:test', ${'$'}1)
                ON CONFLICT DO NOTHING
                """.trimIndent(),
                "it-owner",
            )
            tx.update(
                "INSERT INTO app.workspaces(id, name, created_by) VALUES (${'$'}1, 'Hidden', 'it-owner')",
                workspace,
            )
        }
        val visible = runtime.transaction { tx ->
            tx.row("SELECT count(*)::int AS n FROM app.workspaces WHERE id = ${'$'}1", workspace)
        }
        assertThat(visible?.int("n")).isZero()
    }

    @Test
    fun `values are read the way the previous driver returned them`() {
        val row = runtime.transaction { tx ->
            tx.row(
                """
                SELECT 1::int4 AS small, 9007199254740993::int8 AS wide, 1.50::numeric AS exact, 0.5::float8 AS fraction,
                       true AS flag, '{"a": [1, 2]}'::jsonb AS document, ARRAY['x', 'y'] AS names,
                       '2026-09-27T10:00:00.123Z'::timestamptz AS moment, '2026-09-27'::date AS day, NULL::text AS nothing,
                       $1::int AS bound, $1::text AS again, $2::text[] AS list
                """.trimIndent(),
                42,
                listOf("a,b", "q\"uote"),
            )
        }!!
        assertThat(row["small"]).isEqualTo(1)
        assertThat(row["wide"]).isEqualTo("9007199254740993")
        assertThat(row["exact"]).isEqualTo("1.50")
        assertThat(row["fraction"]).isEqualTo(0.5)
        assertThat(row["flag"]).isEqualTo(true)
        assertThat((row["document"] as JsonNode).path("a").size()).isEqualTo(2)
        assertThat(row["names"]).isEqualTo(listOf("x", "y"))
        assertThat(row["moment"]).isEqualTo(Instant.parse("2026-09-27T10:00:00.123Z"))
        assertThat(row["day"]).isEqualTo(LocalDate.parse("2026-09-27"))
        assertThat(row["nothing"]).isNull()
        assertThat(row["bound"]).isEqualTo(42)
        assertThat(row["again"]).isEqualTo("42")
        assertThat(row["list"]).isEqualTo(listOf("a,b", "q\"uote"))
    }
}
