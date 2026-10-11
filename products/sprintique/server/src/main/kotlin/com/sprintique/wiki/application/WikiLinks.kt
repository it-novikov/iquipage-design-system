package com.sprintique.wiki.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.PlanningStates
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.task.domain.TaskRules
import com.sprintique.wiki.contract.PutWikiTaskLinkRequest

object WikiLinks {
    private const val LIMIT = 100
    private const val PROJECTION = """task_id AS "taskId",page_id AS "pageId",project_id AS "projectId",
        revision::float8 AS revision,archived_at AS "archivedAt",created_at AS "createdAt""""

    fun list(tx: Transaction, actor: Actor, projectId: String, task: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val taskId = Tasks.read(tx, projectId, task).string("id")
        val rows = tx.rows(
            """SELECT $PROJECTION FROM app.wiki_task_link WHERE project_id=$1 AND task_id=$2
                AND archived_at IS NULL ORDER BY created_at,page_id LIMIT $3""",
            projectId, taskId, LIMIT + 1,
        )
        requireCondition(rows.size <= LIMIT, 422, "WIKI_LINK_LIMIT", "Превышен лимит документов задачи.")
        return rows
    }

    @Suppress("LongParameterList")
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        task: String,
        pageId: String,
        input: PutWikiTaskLinkRequest,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        val owner = Tasks.read(tx, projectId, task)
        val taskId = owner.string("id")
        val request = mapOf("taskId" to taskId, "input" to input)
        return ledger.idempotent(tx, actor, projectId, "wiki-link.put:$taskId:$pageId", key, request) {
            TaskRules.requireOpen(owner.string("result"))
            val page = requirePresent(WikiReads.stored(tx, projectId, pageId), 404, "NOT_FOUND", "Страница недоступна.")
            requireCondition(
                input.archived || page["archivedAt"] == null, 409, "WIKI_ARCHIVED", "Страница находится в архиве.",
            )
            val previous = tx.row(
                "SELECT revision FROM app.wiki_task_link WHERE project_id=$1 AND task_id=$2 AND page_id=$3",
                projectId, taskId, pageId,
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == input.baseRevision,
                409, "CONFLICT", "Связь с документом уже изменена.",
            )
            requireCondition(previous != null || !input.archived, 422, "WIKI_LINK_ARCHIVED", "Связь ещё не создана.")
            requireCondition(
                input.baseRevision < MAX_SAFE_INTEGER, 422, "REVISION_LIMIT", "Достигнут предел ревизий связи.",
            )
            if (!input.archived) checkCount(tx, projectId, taskId, pageId)
            val revision = input.baseRevision + 1
            tx.update(
                """INSERT INTO app.wiki_task_link(project_id,task_id,page_id,revision,archived_at)
                    VALUES($1,$2,$3,$4,CASE WHEN $5 THEN clock_timestamp() ELSE NULL END)
                    ON CONFLICT(project_id,task_id,page_id) DO UPDATE SET revision=$4,
                      archived_at=CASE WHEN $5 THEN coalesce(app.wiki_task_link.archived_at,clock_timestamp())
                        ELSE NULL END""",
                projectId, taskId, pageId, revision, input.archived,
            )
            AuditTrail.record(tx, actor, projectId, "wiki-link.updated", taskId, revision)
            if (actor.mayRead(Capability.TASKS_READ)) {
                stored(tx, projectId, taskId, pageId)!!
            } else {
                mapOf(
                    "receipt" to "wiki-task-link", "projectId" to projectId,
                    "taskId" to taskId, "pageId" to pageId, "revision" to revision,
                )
            }
        }
    }

    fun read(tx: Transaction, actor: Actor, projectId: String, task: String, pageId: String): Row {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val taskId = Tasks.read(tx, projectId, task).string("id")
        return requirePresent(stored(tx, projectId, taskId, pageId), 404, "NOT_FOUND", "Связь недоступна.")
    }

    private fun stored(tx: Transaction, projectId: String, taskId: String, pageId: String): Row? = tx.row(
        "SELECT $PROJECTION FROM app.wiki_task_link WHERE project_id=$1 AND task_id=$2 AND page_id=$3",
        projectId, taskId, pageId,
    )

    fun backlinks(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        pageId: String,
        cursor: String?,
    ): Map<String, Any?> {
        WikiReads.read(tx, actor, projectId, pageId)
        requireCondition(
            cursor == null || cursor.matches(Regex("^[A-Za-z0-9_-]{1,100}$")),
            400, "CURSOR_INVALID", "Некорректный курсор.",
        )
        val rows = tx.rows(
            """SELECT t.id,p.key||'-'||t.number AS "displayId",t.title,l.revision::float8 AS revision
                FROM app.wiki_task_link l JOIN app.tasks t ON t.project_id=l.project_id AND t.id=l.task_id
                JOIN app.projects p ON p.id=l.project_id
                WHERE l.project_id=$1 AND l.page_id=$2 AND l.archived_at IS NULL AND l.task_id>$3
                ORDER BY l.task_id LIMIT $4""",
            projectId, pageId, cursor.orEmpty(), WikiReads.PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(WikiReads.PAGE),
            "nextCursor" to if (rows.size > WikiReads.PAGE) rows[WikiReads.PAGE - 1].string("id") else null,
        )
    }

    private fun checkCount(tx: Transaction, projectId: String, taskId: String, pageId: String) {
        val count = tx.row(
            """SELECT count(*)::int AS n FROM app.wiki_task_link
                WHERE project_id=$1 AND task_id=$2 AND page_id<>$3 AND archived_at IS NULL""",
            projectId, taskId, pageId,
        )!!.int("n")
        requireCondition(count < LIMIT, 422, "WIKI_LINK_LIMIT", "В задаче уже 100 документов проекта.")
    }
}
