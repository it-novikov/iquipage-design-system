package com.sprintique.media

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.SchemaMigrations
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * Migration 033 retires project avatars: live ones are detached and handed to the ordinary asset cleanup, the column
 * goes, other files stay as they were, and no live project avatar can appear again.
 */
class ProjectAvatarRetirementIntegrationTest {
    @Test
    fun `project avatars leave through cleanup and cannot come back`() {
        val name = "avatars_" + UUID.randomUUID().toString().replace("-", "").take(12)
        IntegrationDatabase.execute("postgres", "CREATE DATABASE $name OWNER sprintique_migrator")
        try {
            Database.connect(
                IntegrationDatabase.migrationUrl.replace("/sprintique?", "/$name?"),
                MIGRATION_POOL,
                "avatar-migration",
            ).use { database ->
                Flyway.configure(ProjectAvatarRetirementIntegrationTest::class.java.classLoader)
                    .dataSource(database.dataSource)
                    .locations("classpath:db/migration")
                    .defaultSchema("public")
                    .createSchemas(false)
                    .placeholders(mapOf("runtime_role" to RUNTIME, "worker_role" to WORKER))
                    .target("20260929000027")
                    .skipDefaultCallbacks(true)
                    .load()
                    .migrate()
                database.transaction { tx ->
                    // The owner writes the fixture as the importer did; row security binds it too, so it is lifted.
                    tx.update(
                        """
                        ALTER TABLE app.assets NO FORCE ROW LEVEL SECURITY;
                        ALTER TABLE app.projects NO FORCE ROW LEVEL SECURITY;
                        ALTER TABLE app.workspaces NO FORCE ROW LEVEL SECURITY;
                        INSERT INTO auth.principals(id, kind, name) VALUES ('owner', 'human', 'Мария');
                        INSERT INTO app.workspaces(id, name, created_by)
                          VALUES ('00000000-0000-0000-0000-000000000001', 'Пространство', 'owner');
                        INSERT INTO app.projects(id, workspace_id, name, slug, key)
                          VALUES ('p1', '00000000-0000-0000-0000-000000000001', 'Проект', 'p1', 'PA');
                        INSERT INTO app.assets(project_id, id, target_type, target_id, actor_id, name, size, sha256, state)
                          VALUES ('p1', 'linked', 'project-avatar', 'p1', 'owner', 'a.webp', 10, 'aa', 'attached'),
                                 ('p1', 'staged', 'project-avatar', 'p1', 'owner', 'b.webp', 10, 'bb', 'ready'),
                                 ('p1', 'refused', 'project-avatar', 'p1', 'owner', 'c.webp', 10, 'cc', 'quarantined'),
                                 ('p1', 'file', 'task', 't1', 'owner', 'd.png', 10, 'dd', 'attached');
                        UPDATE app.projects SET avatar_asset_id = 'linked' WHERE id = 'p1';
                        ALTER TABLE app.assets FORCE ROW LEVEL SECURITY;
                        ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
                        ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
                        """.trimIndent(),
                    )
                }
                SchemaMigrations.migrate(database.dataSource, RUNTIME, WORKER)
                SchemaMigrations.requireCurrent(database.dataSource)
                database.transaction { tx ->
                    tx.update("ALTER TABLE app.assets NO FORCE ROW LEVEL SECURITY")
                    val states = tx.rows("SELECT id, state, revision FROM app.assets ORDER BY id").associate {
                        it.string("id") to (it.string("state") to it.long("revision"))
                    }
                    assertThat(states).containsExactlyInAnyOrderEntriesOf(
                        mapOf(
                            "linked" to ("detached" to 2L),
                            "staged" to ("detached" to 2L),
                            "refused" to ("quarantined" to 1L),
                            "file" to ("attached" to 1L),
                        ),
                    )
                    val jobs = tx.rows(
                        "SELECT dedupe_key, payload->>'assetId' AS asset FROM work.jobs WHERE kind = 'asset.gc' " +
                            "ORDER BY 1",
                    ).map { it.string("dedupe_key") to it.string("asset") }
                    assertThat(jobs).containsExactly("linked:2" to "linked", "staged:2" to "staged")
                    // Due at once: cleanup takes a detached asset only after its expiry, and the jobs are due now.
                    val due = tx.row(
                        """
                        SELECT bool_and(a.expires_at <= clock_timestamp() AND j.available_at <= clock_timestamp()) AS due
                        FROM app.assets a JOIN work.jobs j ON j.project_id = a.project_id AND j.payload->>'assetId' = a.id
                        WHERE a.target_type = 'project-avatar' AND a.state = 'detached'
                        """.trimIndent(),
                    )!!.boolean("due")
                    assertThat(due).isTrue()
                    val column = tx.row(
                        """
                        SELECT count(*)::int AS n FROM information_schema.columns
                        WHERE table_schema = 'app' AND table_name = 'projects' AND column_name = 'avatar_asset_id'
                        """.trimIndent(),
                    )!!.long("n")
                    assertThat(column).isZero()
                }
                assertThatThrownBy {
                    database.transaction { tx ->
                        tx.update("ALTER TABLE app.assets NO FORCE ROW LEVEL SECURITY")
                        tx.update(
                            """
                            INSERT INTO app.assets(project_id, id, target_type, target_id, actor_id, name, size, sha256)
                            VALUES ('p1', 'again', 'project-avatar', 'p1', 'owner', 'e.webp', 10, 'ee')
                            """.trimIndent(),
                        )
                    }
                }.hasStackTraceContaining("asset_project_avatar_retired")
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
