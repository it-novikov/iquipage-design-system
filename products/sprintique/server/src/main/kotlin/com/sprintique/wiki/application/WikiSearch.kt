package com.sprintique.wiki.application

import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import tools.jackson.databind.json.JsonMapper
import java.util.Base64

object WikiSearch {
    private val json = JsonMapper.builder().build()
    private const val CURSOR_LIMIT = 3000
    private const val QUERY_LIMIT = 200

    fun search(tx: Transaction, actor: Actor, projectId: String, query: String, cursor: String?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val q = query.trim()
        requireCondition(q.length in 1..QUERY_LIMIT, 400, "VALIDATION", "Введите запрос до 200 знаков.")
        val hash = Tokens.sha256Hex("${actor.id}:$projectId:$q")
        val after = cursor?.let { decode(it, hash) }.orEmpty()
        val pattern = "%" + q.replace(Regex("""[\\%_]"""), """\\$0""") + "%"
        val rows = tx.rows(
            """SELECT ${WikiReads.METADATA},left(body,240) AS excerpt FROM app.wiki_page
                WHERE project_id=$1 AND archived_at IS NULL AND id>$2 AND
                  (title COLLATE pg_c_utf8 ILIKE $3 OR
                   to_tsvector('simple',title||' '||body) @@ websearch_to_tsquery('simple',$4))
                ORDER BY id LIMIT $5""",
            projectId, after, pattern, q, WikiReads.PAGE + 1,
        )
        val next = if (rows.size > WikiReads.PAGE) encode(hash, rows[WikiReads.PAGE - 1].string("id")) else null
        return mapOf("items" to rows.take(WikiReads.PAGE), "nextCursor" to next)
    }

    private fun encode(hash: String, after: String): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(json.writeValueAsBytes(mapOf("hash" to hash, "after" to after)))

    private fun decode(cursor: String, hash: String): String {
        requireCondition(cursor.length <= CURSOR_LIMIT, 400, "CURSOR_INVALID", "Некорректный курсор.")
        val invalid = ProblemException(400, "CURSOR_INVALID", "Некорректный курсор.")
        val value = runCatching { json.readTree(Base64.getUrlDecoder().decode(cursor)) }.getOrElse { throw invalid }
        val after = value.path("after").asString("")
        requireCondition(
            value.path("hash").asString("") == hash && after.matches(Regex("^[A-Za-z0-9_-]{1,100}$")),
            400, "CURSOR_INVALID", "Курсор другого поиска.",
        )
        return after
    }
}
