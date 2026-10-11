package com.sprintique.access

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

/**
 * Migrations 037–040 over service accounts written as production holds them under 027: an editor with finance read
 * granted under an administering owner, a reader, an editor granted finance write under an owner who only edits, and
 * an editor whose owner only reads. Each keeps exactly the access it had under the role-and-flag model (where the
 * owner's role capped it at run time). Then the owner's ceiling follows the owner: leaving and rejoining the project,
 * a new owner, an edited preset.
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
                        .target("20260929000027")
                        .skipDefaultCallbacks(true)
                        .load()
                        .migrate()
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "sa-seed").use(::seed)
                    SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                    SchemaMigrations.requireCurrent(database.dataSource)
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "sa-check").use {
                        check(it)
                        recompiles(it)
                        Database.connect(IntegrationDatabase.adminUrl(name), 1, "sa-race").use { other ->
                            racesTheOwner(it, other)
                        }
                    }
                }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    private fun seed(admin: Database) = admin.transaction { tx ->
        for (person in listOf("olga", "ivan", "petr")) {
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', $1, 'https://id.example', $1)
                """.trimIndent(),
                person,
            )
        }
        for (account in listOf("sa_reports", "sa_reader", "sa_ledger", "sa_threads")) {
            tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ($1, 'service', $1)", account)
        }
        tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, 'Прод', 'olga')", WORKSPACE)
        for ((person, role) in listOf("olga" to "admin", "ivan" to "member", "petr" to "member")) {
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
        val owners = listOf(
            "sa_reports" to "olga",
            "sa_reader" to "olga",
            "sa_ledger" to "ivan",
            "sa_threads" to "petr",
        )
        for ((account, owner) in owners) {
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
                SELECT m.principal_id AS id, a.key, m.granted, m.revoked, m.permissions FROM app.project_members m
                JOIN app.access_presets a ON a.id = m.preset_id WHERE m.project_id = 'p'
                """.trimIndent(),
            ).associateBy { it.string("id") }
        }
        val reports = rows.getValue("sa_reports")
        assertThat(reports.string("key")).isEqualTo("service_tasks")
        assertThat(reports.strings("granted")).containsExactly("maps.write", "finance.read")
        assertThat(reports.strings("permissions"))
            .containsExactly(
                "tasks.read", "tasks.write", "work.write", "threads.write", "maps.read", "maps.write", "finance.read",
            )
        val reader = rows.getValue("sa_reader")
        assertThat(reader.string("key")).isEqualTo("service_read")
        assertThat(reader.strings("permissions")).containsExactly("tasks.read", "maps.read")
        // Finance write was granted but its owner only edits the project: it stays granted and does not apply.
        val ledger = rows.getValue("sa_ledger")
        assertThat(ledger.strings("granted")).contains("finance.write")
        assertThat(ledger.strings("permissions"))
            .contains("tasks.write", "finance.read")
            .doesNotContain("finance.write")
        // Its owner only reads: under 027 it wrote nothing, discussions included; it does not start commenting now.
        val threads = rows.getValue("sa_threads")
        assertThat(threads.strings("revoked")).containsExactly("threads.write")
        assertThat(threads.strings("permissions")).contains("tasks.read")
            .doesNotContain("tasks.write", "threads.write", "maps.write")
        val left = admin.transaction { tx ->
            tx.row("SELECT to_regclass('auth.service_account_grants') IS NULL AS gone")!!.boolean("gone")
        }
        assertThat(left).isTrue()
    }

    /** The ceiling follows the owner in the same transaction as the owner's change. */
    private fun recompiles(admin: Database) {
        fun permissions(account: String) = admin.transaction { tx ->
            tx.row(
                "SELECT permissions FROM app.project_members WHERE project_id = 'p' AND principal_id = $1",
                account,
            )!!.strings("permissions")
        }
        // The owner leaves the project: nothing beyond membership; back as an editor, the grant applies again.
        admin.transaction { tx ->
            tx.update("DELETE FROM app.project_members WHERE project_id = 'p' AND principal_id = 'ivan'")
        }
        assertThat(permissions("sa_ledger")).doesNotContain("tasks.write", "finance.read")
        admin.transaction { tx ->
            tx.update("INSERT INTO app.project_members(project_id, principal_id, role) VALUES ('p', 'ivan', 'editor')")
        }
        assertThat(permissions("sa_ledger")).contains("tasks.write", "finance.read").doesNotContain("finance.write")
        // A new owner who only reads: the account is capped by them at once.
        admin.transaction { tx ->
            tx.update("UPDATE auth.service_accounts SET owner_id = 'petr' WHERE principal_id = 'sa_reports'")
        }
        assertThat(permissions("sa_reports")).contains("tasks.read").doesNotContain("tasks.write", "maps.write")
        // The owner's preset loses finance read, as Presets.update recompiles its members: so does the account.
        admin.transaction { tx ->
            val preset = tx.row(
                """
                SELECT preset_id::text AS id FROM app.project_members WHERE project_id = 'p' AND principal_id = 'ivan'
                """.trimIndent(),
            )!!.string("id")
            tx.update(
                """
                UPDATE app.access_presets SET permissions = array_remove(permissions, 'finance.read') WHERE id = $1::uuid
                """.trimIndent(),
                preset,
            )
            tx.update("UPDATE app.project_members SET revision = revision + 1 WHERE preset_id = $1::uuid", preset)
        }
        assertThat(permissions("ivan")).doesNotContain("finance.read")
        assertThat(permissions("sa_ledger")).contains("tasks.write").doesNotContain("finance.read")
    }

    /**
     * A grant written while the owner is being narrowed: holding the owner's row (FOR SHARE, as ServiceAccounts
     * grantProject does) the insert waits for the narrowing and is compiled against it, never against the wider row.
     */
    private fun racesTheOwner(admin: Database, other: Database) {
        admin.transaction { tx ->
            tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ('sa_race', 'service', 'sa_race')")
            tx.update(
                """
                INSERT INTO auth.service_accounts(principal_id, workspace_id, owner_id, created_by)
                VALUES ('sa_race', $1::uuid, 'ivan', 'ivan')
                """.trimIndent(),
                WORKSPACE,
            )
        }
        val narrowing = CountDownLatch(1)
        val narrowed = thread {
            other.transaction { tx ->
                tx.update(
                    """
                    UPDATE app.project_members SET role = 'reader' WHERE project_id = 'p' AND principal_id = 'ivan'
                    """.trimIndent(),
                )
                narrowing.countDown()
                Thread.sleep(HOLD_MILLIS)
            }
        }
        narrowing.await()
        admin.transaction { tx ->
            val owner = tx.row(
                """
                SELECT permissions FROM app.project_members WHERE project_id = 'p' AND principal_id = 'ivan' FOR SHARE
                """.trimIndent(),
            )!!
            assertThat(owner.strings("permissions")).doesNotContain("tasks.write")
            tx.update(
                """
                INSERT INTO app.project_members(project_id, workspace_id, principal_id, preset_id)
                SELECT 'p', $1::uuid, 'sa_race', id FROM app.access_presets WHERE workspace_id = $1::uuid AND key = 'service_tasks'
                """.trimIndent(),
                WORKSPACE,
            )
        }
        narrowed.join()
        val permissions = admin.transaction { tx ->
            tx.row("SELECT permissions FROM app.project_members WHERE project_id = 'p' AND principal_id = 'sa_race'")!!
                .strings("permissions")
        }
        assertThat(permissions).contains("tasks.read").doesNotContain("tasks.write")
    }

    private companion object {
        const val HOLD_MILLIS = 1_500L
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
            "petr" to "reader",
            "sa_threads" to "editor",
        )
    }
}
