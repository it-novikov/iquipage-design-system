package com.sprintique.access

import com.sprintique.access.application.Invitations
import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.token.Tokens
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * PR09: the roles of a database at version 025 become presets without losing any access (migrations 030–032).
 * The data is shaped like production: several workspaces, a creator who is no longer an administrator, a workspace
 * without administrators, a project agent allowed to change maps, finance entries and a pending invitation link.
 */
class RolesMigrationIntegrationTest {
    @Test
    fun `existing roles keep every access they had and gain the owner decisions`() {
        val name = "roles_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            Database.connect(
                IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?"),
                POOL,
                "roles-migration",
            )
                .use { database ->
                    Flyway.configure(RolesMigrationIntegrationTest::class.java.classLoader)
                        .dataSource(database.dataSource)
                        .locations("classpath:db/migration")
                        .defaultSchema("public")
                        .createSchemas(false)
                        .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                        .target("20260929000025")
                        .skipDefaultCallbacks(true)
                        .load()
                        .migrate()
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "roles-seed").use(::seed)
                    SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                    SchemaMigrations.requireCurrent(database.dataSource)
                    Database.connect(IntegrationDatabase.adminUrl(name), 1, "roles-check").use(::check)
                    accept(name)
                }
        } finally {
            IntegrationDatabase.execute("postgres", "DROP DATABASE IF EXISTS $name WITH (FORCE)")
        }
    }

    private fun seed(admin: Database) = admin.transaction { tx ->
        for (person in listOf("alice", "bob", "carol", "dave", "erin", "fay")) {
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject) VALUES ($1, 'human', $1, 'https://id.example', $1)
                """.trimIndent(),
                person,
            )
        }
        tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ('helper', 'agent', 'Помощник')")
        for ((id, creator) in listOf(W1 to "alice", W2 to "dave", W3 to "fay")) {
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, $1, $2)", id, creator)
        }
        for ((workspace, person, role) in listOf(
            Triple(W1, "alice", "admin"), Triple(W1, "bob", "admin"), Triple(W1, "carol", "member"),
            Triple(W2, "dave", "member"), Triple(W2, "erin", "admin"), Triple(W3, "fay", "member"),
        )) {
            tx.update(
                "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1::uuid, $2, $3)",
                workspace,
                person,
                role,
            )
        }
        for ((id, workspace) in listOf("p1" to W1, "p2" to W1, "p3" to W2, "p4" to W3)) {
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2::uuid, $1, $1, upper($1))",
                id,
                workspace,
            )
        }
        for ((project, person, role) in MEMBERS) {
            tx.update(
                "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, $3)",
                project,
                person,
                role,
            )
        }
        tx.update(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, project_id, capabilities, initiator_id, expires_at)
            VALUES ('helper-token', 'helper', repeat('a', 64), 'agent', 'p1', '{tasks:read,maps:read,maps:write}', 'alice',
              now() + interval '1 day')
            """.trimIndent(),
        )
        tx.update(
            """
            INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code, posted_date, category,
              description, revision, created_by, updated_by)
            VALUES ('p1', 'invoice', 'income', 'posted', 5000, 'RUB', '2026-09-20', 'Оплата', 'Счёт', 1, 'alice', 'alice')
            """.trimIndent(),
        )
        tx.update(
            """
            INSERT INTO auth.project_invitations(id, project_id, token_hash, role, inviter_id, expires_at)
            VALUES ($1::uuid, 'p4', $2, 'editor', 'fay', now() + interval '3 days')
            """.trimIndent(),
            INVITATION,
            Tokens.sha256Hex(TOKEN),
        )
    }

    private fun check(admin: Database) {
        val members = admin.transaction { tx ->
            tx.rows("SELECT project_id, principal_id, role, permissions FROM app.project_members")
                .associateBy { it.string("project_id") to it.string("principal_id") }
        }
        // The derived role of every membership is what it was, and the permissions cover the old role's rights.
        val before = mapOf(
            "admin" to PROJECT_ALL,
            "editor" to listOf("tasks.write", "threads.write", "maps.write", "finance.read", "approvals.decide"),
            "reader" to listOf("tasks.read", "maps.read", "finance.read", "threads.write"),
        )
        for ((project, person, role) in MEMBERS) {
            val row = members.getValue(project to person)
            assertThat(row.string("role")).`as`("$person in $project").isEqualTo(role)
            if (person != "helper") assertThat(row.strings("permissions")).containsAll(before.getValue(role))
        }
        assertThat(members.getValue("p1" to "helper").strings("permissions"))
            .contains("tasks.write", "maps.write").doesNotContain("finance.read", "approvals.decide", "members.manage")
        val roles = admin.transaction { tx ->
            tx.rows("SELECT workspace_id::text AS w, principal_id AS p, role FROM app.workspace_members")
                .associate { (it.string("w") to it.string("p")) to it.string("role") }
        }
        assertThat(roles[W1 to "alice"]).isEqualTo("owner")
        assertThat(roles[W1 to "bob"]).isEqualTo("admin")
        assertThat(roles[W2 to "erin"]).isEqualTo("owner")
        assertThat(roles[W2 to "dave"]).isEqualTo("member")
        assertThat(roles[W3 to "fay"]).isEqualTo("member")
        val presets = admin.transaction { tx ->
            tx.row("SELECT count(*)::int AS n FROM app.access_presets WHERE workspace_id = $1::uuid", W1)!!.int("n")
        }
        assertThat(presets).isEqualTo(SYSTEM_PRESETS)
        val invitation = admin.transaction { tx ->
            tx.row(
                """
                SELECT i.kind, i.workspace_role, i.project_ids, a.key FROM auth.invitations i
                JOIN app.access_presets a ON a.id = i.project_preset_id WHERE i.id = $1::uuid
                """.trimIndent(),
                INVITATION,
            )!!
        }
        assertThat(invitation.string("kind")).isEqualTo("link")
        assertThat(invitation.string("key")).isEqualTo("editor")
        assertThat(invitation.strings("project_ids")).containsExactly("p4")
    }

    /**
     * A link a project administrator made before the migration still lets someone in: Фая administers p4 but is only a
     * member of W3, and her link is accepted under the runtime role.
     */
    private fun accept(name: String) {
        Database.connect(IntegrationDatabase.adminUrl(name), 1, "roles-invitee").use { admin ->
            admin.transaction { tx ->
                tx.update("INSERT INTO auth.principals(id, kind, name) VALUES ('gleb', 'human', 'Глеб')")
                tx.update(
                    """
                    INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
                    VALUES ('gleb-session', 'gleb', repeat('c', 64), 'session', 'csrf', 'gleb', now() + interval '1 hour')
                    """.trimIndent(),
                )
            }
        }
        val runtime = IntegrationDatabase.environment("SPRINTIQUE_TEST_DATABASE_URL").replace("/sprintique?", "/$name?")
        Database.connect(runtime, 1, "roles-runtime").use { database ->
            val actor = Actor(
                "gleb",
                "Глеб",
                PrincipalKind.HUMAN,
                "gleb-session",
                "csrf",
                null,
                emptySet(),
                "gleb",
                CredentialKind.SESSION,
            )
            val result = database.transaction { tx ->
                tx.row("SELECT set_config('app.actor_id', 'gleb', true)")
                Invitations.accept(tx, actor, TOKEN)
            }
            assertThat(result["projectId"]).isEqualTo("p4")
            val role = database.transaction { tx ->
                tx.row("SELECT set_config('app.actor_id', 'gleb', true)")
                val sql = "SELECT role FROM app.project_members WHERE project_id = 'p4' AND principal_id = 'gleb'"
                tx.row(sql)!!.string("role")
            }
            assertThat(role).isEqualTo("editor")
        }
    }

    private companion object {
        val TOKEN = "invite_" + "L".repeat(43)
        const val RUNTIME = "sprintique_app"
        const val WORKER = "sprintique_worker"
        const val POOL = 3
        const val SYSTEM_PRESETS = 6
        val W1: String = UUID.randomUUID().toString()
        val W2: String = UUID.randomUUID().toString()
        val W3: String = UUID.randomUUID().toString()
        val INVITATION: String = UUID.randomUUID().toString()
        val PROJECT_ALL = listOf(
            "tasks.read", "tasks.write", "threads.write", "releases.manage", "maps.read", "maps.write", "finance.read",
            "finance.write",
            "approvals.decide",
            "agents.manage",
            "members.invite",
            "members.manage",
            "project.settings",
            "project.access",
        )
        val MEMBERS = listOf(
            Triple("p1", "alice", "admin"), Triple("p1", "bob", "editor"), Triple("p1", "carol", "reader"),
            Triple("p1", "helper", "editor"), Triple("p2", "bob", "admin"), Triple("p2", "alice", "reader"),
            Triple("p3", "erin", "admin"), Triple("p3", "dave", "editor"), Triple("p4", "fay", "admin"),
        )
    }
}
