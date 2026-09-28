package com.sprintique.identity

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * People who signed in through the previous OpenID Connect provider keep their accounts: migration 021 turns each
 * issuer and subject into an identity of the same person, with the address they had.
 */
class SignInMigrationIntegrationTest {
    @Test
    fun `existing people get their identity, agents none`() {
        val name = "signin_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            Database.connect(
                IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?"),
                MIGRATION_POOL,
                "sign-in-migration",
            ).use { database ->
                Flyway.configure(SignInMigrationIntegrationTest::class.java.classLoader)
                    .dataSource(database.dataSource)
                    .locations("classpath:db/migration")
                    .defaultSchema("public")
                    .createSchemas(false)
                    .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                    .target("20260927000020")
                    // The grants of today's callback name tables that version 020 does not have yet.
                    .skipDefaultCallbacks(true)
                    .load()
                    .migrate()
                database.transaction { tx ->
                    tx.update(
                        """
                        INSERT INTO auth.principals(id, kind, name, issuer, subject, email) VALUES
                          ('person', 'human', 'Мария', 'https://id.example', 'maria', 'Maria@Example.org'),
                          ('agent', 'agent', 'Агент', NULL, NULL, NULL)
                        """.trimIndent(),
                    )
                }
                SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                SchemaMigrations.requireCurrent(database.dataSource)
                val identities = database.transaction { tx ->
                    tx.rows("SELECT issuer, subject, principal_id, email FROM auth.identities").map { it.toMap() }
                }
                assertThat(identities).containsExactly(
                    mapOf(
                        "issuer" to "https://id.example",
                        "subject" to "maria",
                        "principal_id" to "person",
                        "email" to "Maria@Example.org",
                    ),
                )
            }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    private companion object {
        const val RUNTIME = "sprintique_app"
        const val WORKER = "sprintique_worker"
        const val MIGRATION_POOL = 3
    }
}
