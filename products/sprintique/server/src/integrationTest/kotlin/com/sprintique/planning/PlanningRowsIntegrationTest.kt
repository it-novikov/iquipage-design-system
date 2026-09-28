package com.sprintique.planning

import com.sprintique.contract.Contracts
import com.sprintique.database.IntegrationDatabase
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.planning.application.PlanningView
import com.sprintique.planning.application.ViewSupport
import com.sprintique.planning.contract.ViewRowsQuery
import jakarta.validation.Validation
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import java.time.Duration
import java.util.UUID

/**
 * B05: a group of 10 000 tasks renders one page of rows without rescanning the group for each row. The bound is
 * generous; a per-row rescan of the group makes this page take minutes, not seconds.
 */
class PlanningRowsIntegrationTest {
    private val json = JsonMapper.builder().addModule(KotlinModule.Builder().build()).build()
    private val view = PlanningView(
        json,
        ViewSupport(json, Contracts(json, Validation.buildDefaultValidatorFactory().validator)),
    )

    @Test
    fun `a page of a 10 000-task group comes back in order within seconds`() {
        val (actor, projectId) = seed()
        val started = System.nanoTime()
        val page = IntegrationDatabase.runtime.transaction { tx ->
            tx.row("SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', '', true)", actor.id)
            val revision = tx.row(
                "SELECT planning_revision AS revision FROM app.projects WHERE id = $1",
                projectId,
            )!!.long("revision")
            view.rows(tx, actor, projectId, ViewRowsQuery(groupId = "backlog", revision = revision.toString()))
        }
        val elapsed = Duration.ofNanos(System.nanoTime() - started)

        @Suppress("UNCHECKED_CAST")
        val rows = page["rows"] as List<Map<String, Any?>>
        assertThat(rows).hasSize(PAGE)
        assertThat(rows.first()["key"]).isEqualTo("CPU-1")
        assertThat(rows.last()["key"]).isEqualTo("CPU-$PAGE")
        assertThat(rows).allMatch { it["childrenCount"] == 0 }
        assertThat(page["nextCursor"]).isNotNull()
        assertThat(elapsed).isLessThan(Duration.ofSeconds(BOUND_SECONDS))
    }

    private fun seed(): Pair<Actor, String> {
        val suffix = UUID.randomUUID().toString().take(8)
        val person = "person-$suffix"
        val credential = "credential-$suffix"
        val workspace = UUID.randomUUID().toString()
        val project = "project-$suffix"
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject)
                VALUES ($1, 'human', 'Алиса', 'https://test.example', $1)
                """.trimIndent(),
                person,
            )
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
                VALUES ($1, $2, $3, 'session', 'csrf', $2, clock_timestamp() + interval '1 hour')
                """.trimIndent(),
                credential,
                person,
                "hash-$suffix",
            )
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Команда', $2)", workspace, person)
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, 'Проект', $3, 'CPU')",
                project,
                workspace,
                "rows-$suffix",
            )
            tx.update(
                "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'admin')",
                project,
                person,
            )
            tx.update(
                """
                INSERT INTO app.tasks(id, project_id, number, title, description, status, type, priority, owner_label, rank, revision)
                SELECT 'cpu-' || n, $1, n, 'Task ' || n, '', 'ready', 'task', 'normal', '', n, 1 FROM generate_series(1, $2) n
                """.trimIndent(),
                project,
                TASKS,
            )
            tx.update("UPDATE app.projects SET next_task_number = $2 WHERE id = $1", project, TASKS + 1)
        }
        return Actor(person, "Алиса", PrincipalKind.HUMAN, credential, "csrf", null, emptySet(), person) to project
    }

    private companion object {
        const val TASKS = 10_000
        const val PAGE = 200
        const val BOUND_SECONDS = 10L
    }
}
