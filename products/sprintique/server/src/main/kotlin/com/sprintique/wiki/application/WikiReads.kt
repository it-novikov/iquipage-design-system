package com.sprintique.wiki.application

import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.wiki.domain.WikiTree

object WikiReads {
    const val PAGE = 50
    const val METADATA = """id,project_id AS "projectId",parent_id AS "parentId",title,revision::float8 AS revision,
        archived_at AS "archivedAt",created_at AS "createdAt",updated_at AS "updatedAt",updated_by AS "updatedBy""""

    fun stored(tx: Transaction, projectId: String, id: String): Row? =
        tx.row("SELECT $METADATA,body FROM app.wiki_page WHERE project_id=$1 AND id=$2", projectId, id)

    fun read(tx: Transaction, actor: Actor, projectId: String, id: String): Row {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return requirePresent(stored(tx, projectId, id), 404, "NOT_FOUND", "Страница недоступна.")
    }

    fun catalog(tx: Transaction, actor: Actor, projectId: String, includeArchive: Boolean): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val rows = tx.rows(
            """SELECT $METADATA FROM app.wiki_page WHERE project_id=$1 AND ($2 OR archived_at IS NULL)
                ORDER BY title COLLATE pg_c_utf8,id LIMIT $3""",
            projectId, includeArchive, WikiTree.LIMIT + 1,
        )
        requireCondition(rows.size <= WikiTree.LIMIT, 422, "WIKI_LIMIT", "Превышен лимит страниц проекта.")
        return rows
    }

    fun history(tx: Transaction, actor: Actor, projectId: String, id: String, before: Long?): Map<String, Any?> {
        read(tx, actor, projectId, id)
        requireCondition(before == null || before in 1..MAX_SAFE_INTEGER, 400, "VALIDATION", "Некорректная ревизия.")
        val rows = tx.rows(
            """SELECT revision::float8 AS revision,title,actor_id AS "actorId",created_at AS "createdAt"
                FROM app.wiki_version WHERE project_id=$1 AND page_id=$2 AND revision<$3
                ORDER BY revision DESC LIMIT $4""",
            projectId, id, before ?: Long.MAX_VALUE, PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(PAGE),
            "nextCursor" to if (rows.size > PAGE) rows[PAGE - 1]["revision"] else null,
        )
    }

    fun version(tx: Transaction, actor: Actor, projectId: String, id: String, revision: Long): Row {
        read(tx, actor, projectId, id)
        requireCondition(revision in 1..MAX_SAFE_INTEGER, 400, "VALIDATION", "Некорректная ревизия.")
        return requirePresent(
            tx.row(
                """SELECT revision::float8 AS revision,title,body,actor_id AS "actorId",created_at AS "createdAt"
                    FROM app.wiki_version WHERE project_id=$1 AND page_id=$2 AND revision=$3""",
                projectId, id, revision,
            ),
            404, "NOT_FOUND", "Версия недоступна.",
        )
    }
}
