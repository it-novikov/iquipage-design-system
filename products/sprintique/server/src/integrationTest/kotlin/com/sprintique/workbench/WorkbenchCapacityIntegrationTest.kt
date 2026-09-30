package com.sprintique.workbench

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.workbench.application.Workbench
import com.sprintique.workbench.application.WorkbenchCursors
import com.sprintique.workbench.application.WorkbenchParts
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

/**
 * The Workbench under a dense person (docs/workbench/delivery-plan §7, §15 "Performance"): many memberships, revoked
 * projects, 40 assigned active tasks, a large backlog, dense updates, duplicate reasons and a crowd of unrelated
 * tasks and events. The first screen stays one statement, bounded, deduplicated and index-driven.
 */
class WorkbenchCapacityIntegrationTest {
    private val statements = AtomicInteger()
    private val measured = Database(counting(IntegrationDatabase.runtime.dataSource))
    private val parts = WorkbenchParts(requests = true, personal = true, waiting = true)

    @Test
    fun `a dense person gets one bounded, deduplicated snapshot in one statement`() {
        val seed = seed()
        val started = System.nanoTime()
        val envelope = measured.transaction { tx ->
            tx.row("SELECT set_config('app.actor_id', $1, true)", seed.actor.id)
            statements.set(0)
            Workbench.envelope(tx, seed.actor, null, Workbench.DEFAULT_LIMIT, parts, WorkbenchCursors("")).also {
                // The statement budget and the snapshot itself: nothing per project, nothing per row.
                assertThat(statements.get()).isEqualTo(2)
            }
        }
        val elapsed = (System.nanoTime() - started) / 1_000_000
        assertThat(elapsed).`as`("envelope time, ms").isLessThan(3000)

        @Suppress("UNCHECKED_CAST")
        val sections = envelope["sections"] as List<Map<String, Any?>>
        val rows = sections.flatMap { section ->
            @Suppress("UNCHECKED_CAST")
            val groups = section["groups"] as List<Map<String, Any?>>? ?: listOf(section)
            groups.flatMap {
                @Suppress("UNCHECKED_CAST")
                (it["items"] as List<Map<String, Any?>>)
            }
        }
        assertThat(rows.map { it["key"] }).doesNotHaveDuplicates()
        assertThat(rows).allMatch { it["projectId"] in seed.accessible }
        val (action, current, updates) = sections
        assertThat(action["count"]).isEqualTo(30L)

        @Suppress("UNCHECKED_CAST")
        val groups = (current["groups"] as List<Map<String, Any?>>).associate { it["key"] to it["count"] }
        // Precedence action > active > waiting > updates > participating: 40 active (5 of them also participating),
        // 10 delegated, 30 participating tasks with news, 20 participating without.
        assertThat(groups).isEqualTo(mapOf("participating" to 20L, "active" to 40L, "waiting" to 10L))
        assertThat(current["backlogCount"]).isEqualTo(60L)
        assertThat(updates["count"]).isEqualTo(30L)
        assertThat(rows.size).isLessThanOrEqualTo(5 * Workbench.DEFAULT_LIMIT)
    }

    @Test
    fun `the plan of the snapshot reads events and tasks through their indexes`() {
        val seed = seed()
        IntegrationDatabase.admin.transaction { tx ->
            tx.update("ANALYZE app.tasks")
            tx.update("ANALYZE app.task_activity")
        }
        val plan = IntegrationDatabase.runtime.transaction { tx ->
            tx.row("SELECT set_config('app.actor_id', $1, true)", seed.actor.id)
            tx.rows(
                "EXPLAIN (FORMAT JSON) " + Workbench.snapshotStatement(),
                seed.actor.id,
                null,
                true,
                true,
                true,
                Workbench.DEFAULT_LIMIT + 1,
            ).first().values.first().toString()
        }
        for (relation in listOf("task_activity", "tasks")) {
            val scan = Regex("\"Node Type\"\\s*:\\s*\"Seq Scan\"[^}]*?\"Relation Name\"\\s*:\\s*\"$relation\"")
            assertThat(scan.containsMatchIn(plan))
                .`as`("sequential scan of app.$relation in\n$plan")
                .isFalse()
        }
    }

    private data class Seed(val actor: Actor, val accessible: Set<String>)

    /**
     * One person in 55 projects (and formerly in 5 more), a colleague who does the work, and 200 unrelated projects
     * with 20 000 tasks and 40 000 events between them.
     */
    @Suppress("LongMethod")
    private fun seed(): Seed {
        val suffix = UUID.randomUUID().toString().take(8)
        val person = "dense-$suffix"
        val colleague = "colleague-$suffix"
        val workspace = UUID.randomUUID().toString()
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject)
                SELECT id, 'human', name, 'https://test.example', id FROM (VALUES ($1, 'Плотная'), ($2, 'Коллега')) v(id, name)
                """.trimIndent(),
                person,
                colleague,
            )
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Ёмкость', $2)", workspace, person)
            tx.update(
                """
                INSERT INTO app.projects(id, workspace_id, name, slug, key)
                SELECT 'cap-' || $2 || '-' || n, $1, 'Проект ' || n, 'cap-' || $2 || '-' || n, 'C' || n
                FROM generate_series(1, 260) n
                """.trimIndent(),
                workspace,
                suffix,
            )
            // Member of 1–60 (a writer, so directed requests count); 56–60 are revoked below. 61–260 are unrelated.
            tx.update(
                """
                INSERT INTO app.project_members(project_id, principal_id, role)
                SELECT 'cap-' || $1 || '-' || n, p, 'editor' FROM generate_series(1, 60) n, (VALUES ($2), ($3)) v(p)
                UNION ALL SELECT 'cap-' || $1 || '-' || n, $3, 'editor' FROM generate_series(61, 260) n
                """.trimIndent(),
                suffix,
                person,
                colleague,
            )
            tx.update(
                """
                INSERT INTO app.tasks(id, project_id, number, title, description, status, type, priority, owner_label, rank,
                                      revision, owner_id)
                SELECT 't' || t, 'cap-' || $1 || '-' || n, t, 'Задача ' || t, '', 'ready', 'task', 'normal', '', t, 1, $2
                FROM generate_series(1, 260) n, generate_series(1, 100) t
                """.trimIndent(),
                suffix,
                colleague,
            )
            val p = "'cap-' || \$1 || '-'"
            // 40 assigned active tasks (projects 1–40, task 1), 60 assigned backlog tasks (projects 1–30, tasks 2–3).
            tx.update(
                """
                UPDATE app.tasks SET owner_id = $2, status = 'in_progress'
                WHERE project_id IN (SELECT $p || n FROM generate_series(1, 40) n) AND id = 't1'
                """.trimIndent(),
                suffix,
                person,
            )
            tx.update(
                """
                UPDATE app.tasks SET owner_id = $2
                WHERE project_id IN (SELECT $p || n FROM generate_series(1, 30) n) AND id IN ('t2', 't3')
                """.trimIndent(),
                suffix,
                person,
            )
            // "Участвую" on tasks 4–13 and on the assigned task 1 of projects 1–5; the same on revoked 56–60.
            tx.update(
                """
                INSERT INTO app.task_personal_state(project_id, task_id, principal_id, participating, rank, last_seen_sequence)
                SELECT $p || n, 't' || t, $2, true, n * 100 + t, 0 FROM generate_series(1, 5) n, generate_series(4, 13) t
                UNION ALL SELECT $p || n, 't1', $2, true, n, 0 FROM generate_series(1, 5) n
                UNION ALL SELECT $p || n, 't' || t, $2, true, n * 100 + t, 0 FROM generate_series(56, 60) n, generate_series(4, 13) t
                """.trimIndent(),
                suffix,
                person,
            )
            // "Жду": 10 participating tasks (projects 6–15, task 14) the person assigned to the colleague.
            tx.update(
                """
                INSERT INTO app.task_personal_state(project_id, task_id, principal_id, participating, rank, last_seen_sequence)
                SELECT $p || n, 't14', $2, true, 9000 + n, 5000 FROM generate_series(6, 15) n
                """.trimIndent(),
                suffix,
                person,
            )
            tx.update(
                """
                INSERT INTO app.task_activity(project_id, sequence, task_id, kind, actor_id, detail)
                SELECT $p || n, 5000, 't14', 'owner', $2, jsonb_build_object('from', null, 'to', $3::text)
                FROM generate_series(6, 15) n
                """.trimIndent(),
                suffix,
                person,
                colleague,
            )
            // 30 open requests to the person (projects 16–45, task 15).
            tx.update(
                """
                INSERT INTO app.attention_requests(project_id, id, task_id, recipient_id, requested_by, kind)
                SELECT $p || n, gen_random_uuid(), 't15', $2, $3, 'review' FROM generate_series(16, 45) n
                """.trimIndent(),
                suffix,
                person,
                colleague,
            )
            // Dense events: 30 per participating task 8–13, by the colleague, plus 40 000 on unrelated projects.
            tx.update(
                """
                INSERT INTO app.task_activity(project_id, sequence, task_id, kind, actor_id, detail)
                SELECT $p || n, (t - 8) * 30 + e, 't' || t, 'status', $2, '{"from":"ready","to":"in_progress"}'::jsonb
                FROM generate_series(1, 5) n, generate_series(8, 13) t, generate_series(1, 30) e
                UNION ALL
                SELECT $p || n, 1000 + t * 2 + e, 't' || t, 'due', $2, '{}'::jsonb
                FROM generate_series(61, 260) n, generate_series(1, 100) t, generate_series(1, 2) e
                """.trimIndent(),
                suffix,
                colleague,
            )
            tx.update(
                """
                DELETE FROM app.project_members WHERE principal_id = $2 AND project_id IN (SELECT $p || n FROM generate_series(56, 60) n)
                """.trimIndent(),
                suffix,
                person,
            )
        }
        val actor =
            Actor(person, "Плотная", PrincipalKind.HUMAN, "credential-$suffix", "csrf", null, emptySet(), person)
        return Seed(actor, (1..55).map { "cap-$suffix-$it" }.toSet())
    }

    private fun counting(source: DataSource): DataSource = proxy<DataSource> { method, arguments ->
        val result = method.invoke(source, *arguments.orEmpty())
        if (method.name == "getConnection") countingConnection(result as Connection) else result
    }

    private fun countingConnection(connection: Connection): Connection = proxy<Connection> { method, arguments ->
        if (method.name == "prepareStatement") statements.incrementAndGet()
        method.invoke(connection, *arguments.orEmpty())
    }

    private inline fun <reified T : Any> proxy(
        crossinline handler: (java.lang.reflect.Method, Array<Any?>?) -> Any?,
    ): T = Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, arguments ->
        try {
            handler(method, arguments)
        } catch (error: java.lang.reflect.InvocationTargetException) {
            throw error.targetException
        }
    } as T
}
