package com.sprintique.finance

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import com.sprintique.database.Transaction
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.sql.SQLException
import java.util.UUID
import kotlin.io.path.readText

/**
 * The budget plan rules the database keeps whoever writes (docs/decisions/0009-finance-plan.md): existing category
 * texts become categories, an approved version and its lines are frozen for the owner role too, one approved version
 * per plan, a release of the same project only, and a rollback that removes the plan and gives the ledger back.
 */
class FinancePlanIntegrationTest {
    private val suffix = UUID.randomUUID().toString().take(8)
    private val admin = "plan-admin-$suffix"
    private val project = "plan-$suffix"
    private val other = "plan-other-$suffix"

    init {
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', $1, 'https://test.example', $1)
                """.trimIndent(),
                admin,
            )
            val workspace = UUID.randomUUID().toString()
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Бюджет', $2)", workspace, admin)
            for ((id, key) in listOf(project to "PLN", other to "OTH")) {
                tx.update(
                    "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, $1, $1, $3)",
                    id,
                    workspace,
                    key,
                )
                tx.update(
                    "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'admin')",
                    id,
                    admin,
                )
            }
            tx.update(
                """
                INSERT INTO app.releases(id, project_id, name, status, revision) VALUES ('rel', $1, 'Чужой', 'planned', 1)
                """.trimIndent(),
                other,
            )
        }
    }

    @Test
    fun `existing category texts become one category per project and name, and every entry and version gets it`() {
        val name = "plan_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            val url = IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?")
            Database.connect(url, POOL, "plan-migration")
                .use { database ->
                    Flyway.configure(FinancePlanIntegrationTest::class.java.classLoader)
                        .dataSource(database.dataSource)
                        .locations("classpath:db/migration")
                        .defaultSchema("public")
                        .createSchemas(false)
                        .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                        .target(BEFORE_PLAN)
                        .skipDefaultCallbacks(true)
                        .load()
                        .migrate()
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "plan-seed").use(::seedLedger)
                    SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                    SchemaMigrations.requireCurrent(database.dataSource)
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "plan-check").use(::checkLedger)
                }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    /** The production shape: entries of two projects, names differing in case, «ё» and spaces, one voided. */
    private fun seedLedger(database: Database) = database.transaction { tx ->
        tx.update(
            "INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ('p', 'human', 'p', 'https://x', 'p')",
        )
        tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ('$W'::uuid, 'w', 'p')")
        for (id in listOf("a", "b")) {
            tx.update(
                """
                INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, '$W'::uuid, $1, $1, upper($1))
                """.trimIndent(),
                id,
            )
        }
        val entries = listOf(
            listOf("a", "1", "income", "Оплата заказчика", "2026-09-01T10:00:00Z"),
            listOf("a", "2", "income", "оплата  заказчика", "2026-09-02T10:00:00Z"),
            listOf("a", "3", "expense", "Ёлки", "2026-09-03T10:00:00Z"),
            listOf("a", "4", "income", "Елки", "2026-09-04T10:00:00Z"),
            listOf("a", "5", "expense", "Хостинг", "2026-09-05T10:00:00Z"),
            listOf("b", "6", "expense", "Хостинг", "2026-09-06T10:00:00Z"),
        )
        for (entry in entries) {
            tx.update(
                """
                INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code, posted_date,
                  category, description, revision, created_by, created_at, updated_by, updated_at)
                VALUES ($1, $2, $3, 'posted', 100, 'RUB', '2026-09-01', $4, 'Операция', 1, 'p', $5::timestamptz, 'p',
                  $5::timestamptz)
                """.trimIndent(),
                *entry.toTypedArray(),
            )
        }
        tx.update(
            """
            UPDATE app.finance_entry SET state = 'voided', void_reason = 'Ошибка', revision = 2
            WHERE project_id = 'a' AND id = '5'
            """.trimIndent(),
        )
    }

    private fun checkLedger(database: Database) = database.transaction { tx ->
        val categories = tx.rows(
            "SELECT project_id AS p, name, direction FROM app.finance_category ORDER BY project_id, name_key",
        ).map { listOf(it["p"], it["name"], it["direction"]) }
        assertThat(categories).containsExactly(
            listOf("a", "Ёлки", "both"),
            listOf("a", "Оплата заказчика", "income"),
            listOf("a", "Хостинг", "expense"),
            listOf("b", "Хостинг", "expense"),
        )
        val linked = tx.row(
            """
            SELECT count(*) FILTER (WHERE e.category_id IS NULL)::int AS missing,
                   count(DISTINCT e.category_id) FILTER (WHERE e.project_id = 'a')::int AS used,
                   (SELECT count(*) FROM app.finance_entry_version v WHERE v.category_id IS DISTINCT FROM
                     (SELECT category_id FROM app.finance_entry x WHERE x.project_id = v.project_id AND x.id = v.entry_id))::int
                     AS versions,
                   (SELECT count(*) FROM app.finance_entry_version)::int AS total,
                   (SELECT string_agg(category, '|' ORDER BY id) FROM app.finance_entry WHERE project_id = 'a') AS labels
            FROM app.finance_entry e
            """.trimIndent(),
        )!!
        assertThat(listOf(linked["missing"], linked["used"], linked["versions"], linked["total"]))
            .containsExactly(0, 3, 0, 7)
        // The texts stay exactly as written: they are the historical labels now.
        assertThat(linked["labels"]).isEqualTo("Оплата заказчика|оплата  заказчика|Ёлки|Елки|Хостинг")
    }

    @Test
    fun `an approved version and its lines are frozen for the owner role too, and one version is approved at a time`() {
        asOwner { tx ->
            tx.update(
                """
                INSERT INTO app.finance_category(project_id, id, name, direction, revision, created_by, updated_by)
                VALUES ($1, 'hosting', 'Хостинг', 'expense', 1, $2, $2)
                """.trimIndent(),
                project,
                admin,
            )
            tx.update(
                """
                INSERT INTO app.finance_plan(project_id, id, name, period_start, period_end, revision, created_by, updated_by)
                VALUES ($1, 'plan', 'План', '2026-01-01', '2026-12-31', 1, $2, $2)
                """.trimIndent(),
                project,
                admin,
            )
            version(tx, 1)
            line(tx, 1, 1)
            approve(tx, 1)
            version(tx, 2)
            line(tx, 2, 1)
        }
        refused("a version starts as a draft") {
            it.update(
                """
                INSERT INTO app.finance_plan_version(project_id, plan_id, version, state, approved_by, approved_at,
                  revision, created_by, updated_by)
                VALUES ($1, 'plan', 3, 'approved', $2, now(), 1, $2, $2)
                """.trimIndent(),
                project,
                admin,
            )
        }
        refused("a second draft") { version(it, 3) }
        refused("an approved version keeps its note") { change(it, 1, "note = 'Иначе'") }
        refused("an approved version does not return to draft") {
            change(it, 1, "state = 'draft', approved_by = NULL, approved_at = NULL")
        }
        refused("lines of an approved version") {
            it.update(
                "UPDATE app.finance_plan_line SET amount_minor = 1 WHERE project_id = $1 AND version = 1",
                project,
            )
        }
        refused("removing lines of an approved version") {
            it.update("DELETE FROM app.finance_plan_line WHERE project_id = $1 AND version = 1", project)
        }
        refused("adding lines to an approved version") { line(it, 1, 2) }
        refused("two approved versions") { approve(it, 2) }
        refused("a draft is never superseded") { change(it, 2, "state = 'superseded'") }
        // Only a draft is discarded: row security leaves an approved version out of reach; the trigger stands behind.
        assertThat(
            asOwner {
                it.update("DELETE FROM app.finance_plan_version WHERE project_id = $1 AND version = 1", project)
            },
        ).isZero()
        refused("a line of another project's release") {
            it.update(
                """
                INSERT INTO app.finance_plan_line(project_id, plan_id, version, position, direction, category_id,
                  amount_minor, currency_code, release_id)
                VALUES ($1, 'plan', 2, 2, 'expense', 'hosting', 1, 'RUB', 'rel')
                """.trimIndent(),
                project,
            )
        }
        refused("the period of an approved plan") {
            it.update(
                "UPDATE app.finance_plan SET period_end = '2027-12-31', revision = revision + 1 WHERE project_id = $1",
                project,
            )
        }
        // The ordered way: supersede the approved version, then approve the draft, in one transaction.
        asOwner { tx ->
            change(tx, 1, "state = 'superseded'")
            approve(tx, 2)
        }
        refused("a superseded version never changes") { change(it, 1, "state = 'approved'") }
        val states = IntegrationDatabase.admin.transaction { tx ->
            tx.rows(
                "SELECT version, state FROM app.finance_plan_version WHERE project_id = $1 ORDER BY version",
                project,
            ).map { listOf(it["version"], it["state"]) }
        }
        assertThat(states).containsExactly(listOf(1, "superseded"), listOf(2, "approved"))
    }

    @Test
    fun `the rollback script removes the plan and gives the ledger its text categories back`() {
        val script = Path.of("src/main/resources/db/rollback/V20261001000072__finance_plan.sql").readText()
            .lines().filterNot { it.trim() == "BEGIN;" || it.trim() == "COMMIT;" }.joinToString("\n")
        OWNER.dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { statement ->
                    statement.execute("SELECT set_config('app.actor_id', '$admin', true)")
                    val event = UUID.randomUUID()
                    statement.execute(
                        """
                        INSERT INTO app.audit_events(id, project_id, actor_id, initiator_id, action, resource_id, revision)
                        VALUES ('$event', '$project', '$admin', '$admin', 'finance-plan.approved', 'plan', 1);
                        INSERT INTO app.outbox(id, project_id, topic, payload)
                        VALUES ('$event', '$project', 'finance-plan.approved', '{}');
                        INSERT INTO app.idempotency(actor_id, project_id, operation, key, request_hash, result)
                        VALUES ('$admin', '$project', 'finance-plan.approve:plan', 'rollback-key', 'hash', '{}')
                        """.trimIndent(),
                    )
                    statement.execute("SELECT set_config('app.actor_id', '', true)")
                }
                connection.createStatement().use { it.execute(script) }
                connection.createStatement().use { it.execute("SELECT set_config('app.actor_id', '$admin', true)") }
                val removed = connection.createStatement().use { statement ->
                    statement.executeQuery(
                        """
                        SELECT to_regclass('app.finance_plan') IS NULL AND to_regclass('app.finance_plan_version') IS NULL
                          AND to_regclass('app.finance_plan_line') IS NULL AND to_regclass('app.finance_category') IS NULL
                          AND to_regclass('app.finance_variance_note') IS NULL
                          AND to_regprocedure('auth.projects_with(text)') IS NULL
                          AND to_regclass('app.finance_entry') IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app'
                            AND table_name IN ('finance_entry', 'finance_entry_version')
                            AND column_name IN ('category_id', 'release_id'))
                          AND NOT EXISTS (SELECT 1 FROM public.flyway_schema_history WHERE version >= '20261001000072')
                          AND (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.outbox'::regclass)
                          AND NOT EXISTS (SELECT 1 FROM app.outbox WHERE project_id = '$project')
                          AND NOT EXISTS (SELECT 1 FROM app.idempotency WHERE project_id = '$project') AS removed
                        """.trimIndent(),
                    ).use { result ->
                        result.next()
                        result.getBoolean("removed")
                    }
                }
                assertThat(removed).isTrue()
                // The ledger of the previous artifact works again: an entry with a text category and its version.
                connection.createStatement().use {
                    it.execute(
                        """
                        INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code,
                          posted_date, category, description, revision, created_by, updated_by)
                        VALUES ('$project', 'after-rollback', 'expense', 'posted', 1, 'RUB', '2026-09-01', 'Хостинг',
                          'Серверы', 1, '$admin', '$admin')
                        """.trimIndent(),
                    )
                }
            } finally {
                connection.rollback()
                connection.autoCommit = true
            }
        }
    }

    private fun version(tx: Transaction, number: Int) {
        tx.update(
            """
            INSERT INTO app.finance_plan_version(project_id, plan_id, version, state, revision, created_by, updated_by)
            VALUES ($1, 'plan', $2, 'draft', 1, $3, $3)
            """.trimIndent(),
            project,
            number,
            admin,
        )
    }

    private fun line(tx: Transaction, number: Int, position: Int) {
        tx.update(
            """
            INSERT INTO app.finance_plan_line(project_id, plan_id, version, position, direction, category_id, amount_minor,
              currency_code)
            VALUES ($1, 'plan', $2, $3, 'expense', 'hosting', 5000, 'RUB')
            """.trimIndent(),
            project,
            number,
            position,
        )
    }

    private fun approve(tx: Transaction, number: Int) = change(
        tx,
        number,
        "state = 'approved', approved_by = '$admin', approved_at = clock_timestamp()",
    )

    private fun change(tx: Transaction, number: Int, assignments: String) {
        tx.update(
            """
            UPDATE app.finance_plan_version SET $assignments, revision = revision + 1, updated_at = clock_timestamp()
            WHERE project_id = $1 AND plan_id = 'plan' AND version = $2
            """.trimIndent(),
            project,
            number,
        )
    }

    private fun refused(reason: String, block: (Transaction) -> Unit) {
        assertThatThrownBy { asOwner(block) }.`as`(reason).isInstanceOf(SQLException::class.java)
    }

    /** The migration role, owner of the tables and subject to their FORCE row security, as a data import runs. */
    private fun <T> asOwner(block: (Transaction) -> T): T = OWNER.transaction { tx ->
        tx.row("SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', '', true)", admin)
        block(tx)
    }

    private companion object {
        const val RUNTIME = "sprintique_app"
        const val WORKER = "sprintique_worker"
        const val POOL = 3
        const val W = "00000000-0000-4000-8000-00000000f1a0"

        /** The last migration before the plan (068–070 are the notifications of #44; 071 is unused). */
        const val BEFORE_PLAN = "20261001000070"
        val OWNER: Database by lazy { Database.connect(IntegrationDatabase.migrationUrl, 2, "test-owner-plan") }
    }
}
