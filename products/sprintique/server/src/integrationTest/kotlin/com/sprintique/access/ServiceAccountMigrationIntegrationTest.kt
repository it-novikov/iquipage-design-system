package com.sprintique.access

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Migration 033 on service accounts shaped like production's: an editor with finance read granted under an
 * administering owner, a reader, and an editor granted finance write under an owner who only edits. Each keeps exactly
 * the access it had under the role-and-flag model of 027 (where the owner's role capped it at run time).
 */
class ServiceAccountMigrationIntegrationTest {
    @Test
    fun `role and finance flags become a service preset with additions, capped by the owner`() {
        val name = "sa_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            Database.connect(IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?"), POOL, "sa-migration")
                .use { database ->
                    Flyway.configure(ServiceAccountMigrationIntegrationTest::class.java.classLoader)
                        .dataSource(database.dataSource)
                        .locations("classpath:db/migration")
                        .defaultSchema("public")
                        .createSchemas(false)
                        .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                        .target("20260930000032")
                        .skipDefaultCallbacks(true)
                        .load()
                        .migrate()
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "sa-seed").use(::seed)
                    SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                    SchemaMigrations.requireCurrent(database.dataSource)
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "sa-check").use(::check)
                }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    private fun seed(admin: Database) = admin.transaction { tx ->
        for (person in listOf("olga", "ivan")) {
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', $1, 'https://id.example', $1)
                """.trimIndent(),
                person,
            )
        }
        for (account in listOf("sa_reports", "sa_reader", "sa_ledger")) {
            tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ($1, 'service', $1)", account)
        }
        tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, 'Прод', 'olga')", WORKSPACE)
        for ((person, role) in listOf("olga" to "owner", "ivan" to "member")) {
            tx.update(
                "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1::uuid, $2, $3)",
                WORKSPACE,
                person,
                role,
            )
        }
        tx.update(
            "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ('p', $1::uuid, 'П', 'p', 'P')",
            WORKSPACE,
        )
        for ((principal, role) in MEMBERS) {
            tx.update(
                "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ('p', $1, $2)",
                principal,
                role,
            )
        }
        for ((account, owner) in listOf("sa_reports" to "olga", "sa_reader" to "olga", "sa_ledger" to "ivan")) {
            tx.update(
                """
                INSERT INTO auth.service_accounts(principal_id, workspace_id, owner_id, created_by)
                VALUES ($1, $2::uuid, $3, $3)
                """.trimIndent(),
                account,
                WORKSPACE,
                owner,
            )
        }
        tx.update(
            """
            INSERT INTO auth.service_account_grants(project_id, principal_id, granted) VALUES ('p', 'sa_reports', '{finance.read}')
            """.trimIndent(),
        )
        tx.update(
            """
            INSERT INTO auth.service_account_grants(project_id, principal_id, granted) VALUES ('p', 'sa_ledger', '{finance.read,finance.write}')
            """.trimIndent(),
        )
    }

    private fun check(admin: Database) {
        val rows = admin.transaction { tx ->
            tx.rows(
                """
                SELECT m.principal_id AS id, a.key, m.granted, m.permissions FROM app.project_members m
                JOIN app.access_presets a ON a.id = m.preset_id WHERE m.project_id = 'p'
                """.trimIndent(),
            ).associateBy { it.string("id") }
        }
        val reports = rows.getValue("sa_reports")
        assertThat(reports.string("key")).isEqualTo("service_tasks")
        assertThat(reports.strings("granted")).containsExactly("maps.write", "finance.read")
        assertThat(reports.strings("permissions"))
            .containsExactly("tasks.read", "tasks.write", "threads.write", "maps.read", "maps.write", "finance.read")
        val reader = rows.getValue("sa_reader")
        assertThat(reader.string("key")).isEqualTo("service_read")
        assertThat(reader.strings("permissions")).containsExactly("tasks.read", "maps.read")
        // Finance write was granted but its owner only edits the project: it stays granted and does not apply.
        val ledger = rows.getValue("sa_ledger")
        assertThat(ledger.strings("granted")).contains("finance.write")
        assertThat(ledger.strings("permissions"))
            .contains("tasks.write", "finance.read")
            .doesNotContain("finance.write")
        val left = admin.transaction { tx ->
            tx.row("SELECT to_regclass('auth.service_account_grants') IS NULL AS gone")!!.boolean("gone")
        }
        assertThat(left).isTrue()
    }

    private companion object {
        const val RUNTIME = "sprintique_app"
        const val WORKER = "sprintique_worker"
        const val POOL = 3
        val WORKSPACE: String = UUID.randomUUID().toString()
        val MEMBERS = listOf(
            "olga" to "admin",
            "ivan" to "editor",
            "sa_reports" to "editor",
            "sa_reader" to "reader",
            "sa_ledger" to "editor",
        )
    }
}
