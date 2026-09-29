package com.sprintique.discussion

import com.sprintique.database.Database
import com.sprintique.database.IntegrationDatabase
import com.sprintique.discussion.application.Discussions
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.PrincipalKind
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import java.lang.reflect.Proxy
import java.sql.Connection
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

/** B04: a page of discussions costs a constant number of statements and carries bounded summaries. */
class DiscussionPageIntegrationTest {
    private val statements = AtomicInteger()
    private val measured = Database(counting(IntegrationDatabase.runtime.dataSource))

    @Test
    fun `a page of a thousand threads takes two statements and bounded summaries`() {
        val (actor, projectId) = seed()
        val page = measured.transaction { tx ->
            tx.row("SELECT set_config('app.actor_id', $1, true)", actor.id)
            statements.set(0)
            Discussions.page(tx, actor, projectId, "catalogue", null, 50).also {
                assertThat(statements.get()).isEqualTo(2)
            }
        }

        @Suppress("UNCHECKED_CAST")
        val items = page["items"] as List<JsonNode>
        assertThat(items).hasSize(50)
        assertThat(page["total"]).isEqualTo(1000)
        assertThat(page["unresolved"]).isEqualTo(333)
        assertThat(items).allMatch {
            it.path("messageCount").asInt() == 1 && it.path("messages")[0].path("body").asString().length == 160
        }
        assertThat(items.first().path("id").asString()).isEqualTo("catalogue-0999")
        assertThat(page["nextCursor"]).isNotNull()
    }

    /** One person, a project they administer, a task with 1000 threads (every third a question). */
    private fun seed(): Pair<Actor, String> {
        val suffix = UUID.randomUUID().toString().take(8)
        val person = "person-$suffix"
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
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Команда', $2)", workspace, person)
            tx.update(
                "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1, $2, 'admin')",
                workspace,
                person,
            )
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, 'Проект', $3, 'CAT')",
                project,
                workspace,
                "catalogue-$suffix",
            )
            tx.update(
                "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'admin')",
                project,
                person,
            )
            tx.update(
                """
                INSERT INTO app.tasks(id, project_id, number, title, description, status, type, priority, owner_label, rank, revision)
                VALUES ('catalogue', $1, 1, 'Каталог', '', 'ready', 'task', 'normal', '', 1024, 1)
                """.trimIndent(),
                project,
            )
            // Sub-millisecond activity times: serialization must not change the database order.
            tx.update(
                """
                INSERT INTO app.threads(project_id, id, task_id, requires_resolution, last_activity_at)
                SELECT $1, 'catalogue-' || lpad(n::text, 4, '0'), 'catalogue', n % 3 = 0,
                       '2026-01-01'::timestamptz + n * interval '1 microsecond'
                FROM generate_series(1, 1000) n
                """.trimIndent(),
                project,
            )
            tx.update(
                """
                INSERT INTO app.messages(project_id, id, thread_id, body, author_id)
                SELECT $1, 'catalogue-message-' || n, 'catalogue-' || lpad(n::text, 4, '0'), repeat('x', 200), $2
                FROM generate_series(1, 1000) n
                """.trimIndent(),
                project,
                person,
            )
        }
        val actor =
            Actor(
                person, "Алиса", PrincipalKind.HUMAN, "credential-$suffix", "csrf", null, emptySet(), person,
                CredentialKind.SESSION,
            )
        return actor to project
    }

    /** Counts the statements prepared on connections of `source`. */
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
