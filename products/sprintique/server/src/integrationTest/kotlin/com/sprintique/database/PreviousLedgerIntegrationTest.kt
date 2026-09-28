package com.sprintique.database

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * A database the previous migrator left at version 018 is adopted: its ledger is checked, Flyway starts at 018 and
 * applies the rest, and the result is current. A changed ledger is refused and nothing is applied.
 */
class PreviousLedgerIntegrationTest {
    private val known = JsonMapper.builder().build()
        .readTree(PreviousLedgerIntegrationTest::class.java.getResourceAsStream("/db/previous-ledger.json"))
        .path("migrations").values().toList()

    @Test
    fun `a database of the previous migrator is adopted and brought up to date`() {
        withPreviousDatabase(applied = 18) { database ->
            SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
            SchemaMigrations.requireCurrent(database.dataSource)
            val versions = database.transaction { tx ->
                tx.rows("SELECT version, type FROM public.flyway_schema_history ORDER BY installed_rank")
                    .map { "${it["version"]}:${it["type"]}" }
            }
            assertThat(versions.first()).isEqualTo("20260927000018:BASELINE")
            // The previous migrator's last two files, then whatever Flyway added after it.
            assertThat(versions.drop(1).filter { it.endsWith(":SQL") })
                .startsWith("20260927000019:SQL", "20260927000020:SQL")
        }
    }

    @Test
    fun `a changed previous ledger is refused`() {
        withPreviousDatabase(applied = 18, tamper = true) { database ->
            assertThatThrownBy { SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER) }
                .isInstanceOf(IllegalStateException::class.java)
                .hasMessageContaining("differs")
        }
    }

    /** A fresh database at version [applied], with the previous migrator's ledger instead of Flyway's history. */
    private fun withPreviousDatabase(applied: Int, tamper: Boolean = false, block: (Database) -> Unit) {
        val name = "adopt_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            Database.connect(
                IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?"),
                MIGRATION_POOL,
                "adopt",
            ).use { database ->
                Flyway.configure(PreviousLedgerIntegrationTest::class.java.classLoader)
                    .dataSource(database.dataSource)
                    .locations("classpath:db/migration")
                    .defaultSchema("public")
                    .createSchemas(false)
                    .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                    .target(known[applied - 1].path("version").asString())
                    // The previous migrator ran no callbacks; the grants arrive with the adopting run.
                    .skipDefaultCallbacks(true)
                    .load()
                    .migrate()
                database.transaction { tx ->
                    tx.update("DROP TABLE public.flyway_schema_history")
                    tx.update(
                        """
                        CREATE TABLE public.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL,
                          applied_at timestamptz NOT NULL DEFAULT now())
                        """.trimIndent(),
                    )
                    known.take(applied).forEachIndexed { index, entry ->
                        val sha = if (tamper &&
                            index == applied - 1
                        ) {
                            "0".repeat(64)
                        } else {
                            entry.path("sha256").asString()
                        }
                        tx.update(
                            "INSERT INTO public.schema_migrations(name, sha256) VALUES ($1, $2)",
                            entry.path("name").asString(),
                            sha,
                        )
                    }
                }
                block(database)
            }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    private companion object {
        const val RUNTIME = "sprintique_app"
        const val WORKER = "sprintique_worker"

        /** As many connections as the `migrate` command gives Flyway. */
        const val MIGRATION_POOL = 3
    }
}
