package com.sprintique.finance

import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.Transaction
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.sql.SQLException
import java.util.UUID
import kotlin.io.path.readText

/**
 * The ledger rules the database keeps whoever writes, a data import on the owner role included: history for every
 * revision, fixed transitions, immutable voided entries, row security by role, and a rollback that removes it all.
 */
class FinanceLedgerIntegrationTest {
    private val suffix = UUID.randomUUID().toString().take(8)
    private val admin = "finance-admin-$suffix"
    private val reader = "finance-reader-$suffix"
    private val agent = "finance-agent-$suffix"
    private val project = "finance-$suffix"

    init {
        IntegrationDatabase.admin.transaction { tx ->
            for ((id, kind) in listOf(admin to "human", reader to "human", agent to "agent")) {
                tx.update(
                    """
                    INSERT INTO auth.principals(id, kind, name, issuer, subject)
                    VALUES ($1, $2, $1, CASE WHEN $2 = 'human' THEN 'https://test.example' END, CASE WHEN $2 = 'human' THEN $1 END)
                    """.trimIndent(),
                    id,
                    kind,
                )
            }
            val workspace = UUID.randomUUID().toString()
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Финансы', $2)", workspace, admin)
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, 'Проект', $1, 'FIN')",
                project,
                workspace,
            )
            for ((id, role) in listOf(admin to "admin", reader to "reader", agent to "admin")) {
                tx.update(
                    "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, $3)",
                    project,
                    id,
                    role,
                )
            }
        }
    }

    @Test
    fun `every stored revision becomes a version and the transitions hold for the owner role too`() {
        IntegrationDatabase.admin.transaction { tx ->
            insert(tx, "entry", state = "planned", revision = 1)
            tx.update(
                """
                UPDATE app.finance_entry SET state = 'posted', posted_date = '2026-09-12', amount_minor = 900,
                  revision = 2, updated_at = '2026-09-12T10:00:00Z'
                WHERE project_id = $1 AND id = 'entry'
                """.trimIndent(),
                project,
            )
        }
        refused("a second insert starts at revision 1") { insert(it, "late", state = "posted", revision = 2) }
        refused("nothing starts voided") { insert(it, "voided", state = "voided", revision = 1) }
        refused("a change adds one revision") { change(it, "description = 'x', revision = revision") }
        refused("a change adds exactly one") { change(it, "description = 'x', revision = revision + 2") }
        refused("posted never returns to planned") {
            change(it, "state = 'planned', posted_date = NULL, revision = revision + 1")
        }
        refused("voiding changes only the state and reason") {
            change(it, "state = 'voided', void_reason = 'Ошибка', amount_minor = 1, revision = revision + 1")
        }
        refused("creation is fixed") { change(it, "created_by = '$reader', revision = revision + 1") }
        IntegrationDatabase.admin.transaction {
            change(it, "state = 'voided', void_reason = 'Ошибка', revision = revision + 1")
        }
        refused("a voided entry never changes") { change(it, "description = 'Позже', revision = revision + 1") }

        val versions = IntegrationDatabase.admin.transaction { tx ->
            tx.rows(
                """
                SELECT revision, change, state, amount_minor::int AS amount, actor_id AS "actorId",
                       created_at = '2026-09-12T10:00:00Z'::timestamptz AS stamped
                FROM app.finance_entry_version WHERE project_id = $1 AND entry_id = 'entry' ORDER BY revision
                """.trimIndent(),
                project,
            )
        }
        assertThat(versions.map { listOf(it["revision"], it["change"], it["state"], it["amount"]) }).containsExactly(
            listOf(1, "created", "planned", 1000),
            listOf(2, "posted", "posted", 900),
            listOf(3, "voided", "voided", 900),
        )
        assertThat(versions.map { it["actorId"] }).containsOnly(admin)
        assertThat(versions[1]["stamped"]).isEqualTo(true)
    }

    @Test
    fun `row security lets people of the project read, only administrators write, and agents see nothing`() {
        IntegrationDatabase.admin.transaction { insert(it, "visible", state = "posted", revision = 1) }
        val count = "SELECT count(*)::int AS n FROM app.finance_entry WHERE project_id = $1"
        assertThat(asActor(reader) { it.row(count, project)!!.int("n") }).isEqualTo(1)
        assertThat(asActor(agent) { it.row(count, project)!!.int("n") }).isZero()
        assertThatThrownBy { asActor(reader) { insert(it, "by-reader", state = "posted", revision = 1) } }
            .hasMessageContaining("row-level security")
        assertThatThrownBy { asActor(agent) { insert(it, "by-agent", state = "posted", revision = 1) } }
            .hasMessageContaining("row-level security")
        assertThat(
            asActor(reader) {
                it.update("UPDATE app.finance_entry SET description = 'x' WHERE project_id = $1", project)
            },
        )
            .isZero()
        asActor(admin) { insert(it, "by-admin", state = "planned", revision = 1) }
        assertThat(asActor(admin) { it.row(count, project)!!.int("n") }).isEqualTo(2)
        assertThatThrownBy {
            asActor(admin) {
                it.update("UPDATE app.finance_entry_version SET amount_minor = 1 WHERE project_id = $1", project)
            }
        }.hasMessageContaining("permission denied")
        // Only the version of the revision an entry holds is accepted: history cannot be forged or taken in advance.
        assertThatThrownBy {
            asActor(admin) {
                it.update(
                    """
                    INSERT INTO app.finance_entry_version(project_id, entry_id, revision, change, direction, state,
                      amount_minor, currency_code, due_date, category, description, actor_id, created_at)
                    VALUES ($1, 'by-admin', 2, 'updated', 'expense', 'planned', 1, 'RUB', '2026-09-10', 'x', 'y', $2,
                      clock_timestamp())
                    """.trimIndent(),
                    project,
                    admin,
                )
            }
        }.hasMessageContaining("row-level security")
    }

    @Test
    fun `the rollback script removes the module and its ledger entry`() {
        val script = Path.of("src/main/resources/db/rollback/V20260929000025__add_project_finance.sql").readText()
            .lines().filterNot { it.trim() == "BEGIN;" || it.trim() == "COMMIT;" }.joinToString("\n")
        IntegrationDatabase.admin.dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { it.execute(script) }
                val left = connection.createStatement().use { statement ->
                    statement.executeQuery(
                        """
                        SELECT to_regclass('app.finance_entry') IS NULL AND to_regclass('app.finance_settings') IS NULL
                          AND to_regclass('app.finance_entry_version') IS NULL
                          AND to_regprocedure('auth.can_read_finance(text)') IS NULL
                          AND NOT EXISTS (SELECT 1 FROM public.flyway_schema_history WHERE version = '20260929000025')
                          AND (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.outbox'::regclass) AS removed
                        """.trimIndent(),
                    ).use { result ->
                        result.next()
                        result.getBoolean("removed")
                    }
                }
                assertThat(left).isTrue()
            } finally {
                connection.rollback()
                connection.autoCommit = true
            }
        }
    }

    private fun insert(tx: Transaction, id: String, state: String, revision: Int) {
        tx.update(
            """
            INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code, due_date,
              posted_date, category, description, void_reason, revision, created_by, updated_by)
            VALUES ($1, $2, 'expense', $3, 1000, 'RUB', '2026-09-10',
              CASE WHEN $3 <> 'planned' THEN '2026-09-11'::date END, 'Хостинг', 'Серверы',
              CASE WHEN $3 = 'voided' THEN 'Причина' END, $4, $5, $5)
            """.trimIndent(),
            project,
            id,
            state,
            revision,
            admin,
        )
    }

    private fun change(tx: Transaction, assignments: String) {
        tx.update("UPDATE app.finance_entry SET $assignments WHERE project_id = $1 AND id = 'entry'", project)
    }

    private fun refused(reason: String, block: (Transaction) -> Unit) {
        assertThatThrownBy { IntegrationDatabase.admin.transaction(block) }
            .`as`(reason)
            .isInstanceOf(SQLException::class.java)
    }

    /** Runs as the runtime role with the request context of [principal], the way the API opens a transaction. */
    private fun <T> asActor(
        principal: String,
        block: (Transaction) -> T,
    ): T = IntegrationDatabase.runtime.transaction { tx ->
        tx.row("SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', '', true)", principal)
        block(tx)
    }
}
