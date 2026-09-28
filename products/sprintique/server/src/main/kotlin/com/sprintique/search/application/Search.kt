package com.sprintique.search.application

import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import tools.jackson.databind.json.JsonMapper
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64

/** Search across the caller's projects: tasks, maps and projects, in one stable order with a cursor. */
object Search {
    private const val PAGE = 50
    private const val KEY_LIMIT = 240
    private val json = JsonMapper.builder().build()

    fun search(tx: Transaction, actor: Actor, query: String, cursor: String?): Map<String, Any?> {
        // An agent searches only its own project, and only what its grant may read.
        val tasksAllowed = actor.mayRead(Capability.TASKS_READ)
        val mapsAllowed = actor.mayRead(Capability.MAPS_READ)
        if (!actor.isHuman) {
            requireCondition(
                actor.projectId != null && (tasksAllowed || mapsAllowed),
                403,
                "FORBIDDEN",
                "Поиск требует разрешение на чтение.",
            )
            ProjectAccess.authorize(
                tx,
                actor,
                actor.projectId,
                if (tasksAllowed) Capability.TASKS_READ else Capability.MAPS_READ,
            )
        }
        val queryHash = Tokens.sha256Hex("${actor.id}:$query")
        val after = cursor?.let { positionOf(it, queryHash) } ?: ""
        val pattern = "%" + query.replace(Regex("""[\\%_]"""), """\\$0""") + "%"
        // pg_c_utf8 folds Cyrillic and other non-ASCII case, which the C database collation does not.
        val rows = tx.rows(
            """
            WITH results AS (
              SELECT 'task:' || p.id || ':' || t.id AS "searchKey", 'task' AS kind, t.id, p.id AS "projectId", t.title,
                     p.key || '-' || t.number AS key, p.name AS "projectName", p.slug, left(t.description, 160) AS excerpt
              FROM app.tasks t JOIN app.projects p ON p.id = t.project_id
              WHERE $4 AND ((t.title) COLLATE pg_c_utf8 ILIKE $1 OR (p.key || '-' || t.number) COLLATE pg_c_utf8 ILIKE $1
                    OR to_tsvector('simple', t.title || ' ' || t.description) @@ websearch_to_tsquery('simple', $2))
              UNION ALL
              SELECT 'map:' || p.id || ':' || m.id, 'map', m.id, p.id, m.value->>'title', 'Карта', p.name, p.slug,
                     left(m.value->>'summary', 160)
              FROM app.maps m JOIN app.projects p ON p.id = m.project_id
              WHERE $5 AND ((m.value->>'title') COLLATE pg_c_utf8 ILIKE $1 OR (m.value->>'summary') COLLATE pg_c_utf8 ILIKE $1)
              UNION ALL
              SELECT 'project:' || p.id, 'project', p.id, p.id, p.name, p.key, p.name, p.slug, ''
              FROM app.projects p WHERE (p.name) COLLATE pg_c_utf8 ILIKE $1 OR (p.key) COLLATE pg_c_utf8 ILIKE $1
            ) SELECT * FROM results WHERE "searchKey" > $3 ORDER BY "searchKey" LIMIT $6
            """.trimIndent(),
            pattern,
            query,
            after,
            tasksAllowed,
            mapsAllowed,
            PAGE + 1,
        )
        val items = rows.take(PAGE).map { row ->
            val item = LinkedHashMap(row.without("searchKey"))
            item["url"] = urlOf(row.string("kind"), row.string("slug"), row.string("key"), row.string("id"))
            item
        }
        val next = if (rows.size > PAGE) {
            encode(mapOf("hash" to queryHash, "after" to rows[PAGE - 1].string("searchKey")))
        } else {
            null
        }
        return mapOf("items" to items, "nextCursor" to next)
    }

    private fun urlOf(kind: String, slug: String, key: String, id: String): String {
        val fragment = when (kind) {
            "task" -> "#/task/${component(key)}"
            "map" -> "#maps/${component(id)}"
            else -> "#tasks"
        }
        return "/?project=${component(slug)}$fragment"
    }

    /** encodeURIComponent: spaces as `%20`, and the characters it leaves alone left alone. */
    private fun component(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")
        .replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~")

    private fun encode(value: Any): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsBytes(value))

    private fun positionOf(cursor: String, queryHash: String): String {
        val invalid = ProblemException(400, "CURSOR_INVALID", "Некорректный курсор.")
        val value = runCatching { json.readTree(Base64.getUrlDecoder().decode(cursor)) }.getOrElse { throw invalid }
        val after = value.path("after")
        requireCondition(
            value.path("hash").asString("") == queryHash && after.isString && after.asString().length <= KEY_LIMIT,
            400,
            "CURSOR_INVALID",
            "Курсор другого поиска.",
        )
        return after.asString()
    }
}
