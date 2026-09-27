package com.sprintique.task.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.PlanningStates
import com.sprintique.planning.domain.Dependency
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.requireCondition

/** A link between two tasks: `depends` (the first waits for the second) or `related`. */
data class TaskLinkValue(val kind: String, val fromId: String, val toId: String, val archived: Boolean)

/** Links between tasks. A link keeps its direction for life; archiving ends it. */
object TaskLinks {
    private const val LIMIT = TemporalRules.ITEM_LIMIT
    private const val PROJECTION = """id, project_id AS "projectId", kind, from_id AS "fromId", to_id AS "toId", revision,
        archived_at AS "archivedAt", created_at AS "createdAt""""

    fun list(tx: Transaction, actor: Actor, projectId: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val rows = tx.rows(
            "SELECT $PROJECTION FROM app.task_links WHERE project_id = $1 ORDER BY id LIMIT $2",
            projectId,
            LIMIT + 1,
        )
        requireCondition(rows.size <= LIMIT, 422, "LINK_LIMIT", "Превышен лимит связей проекта.")
        return rows
    }

    @Suppress("LongParameterList")
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        value: TaskLinkValue,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        val request = mapOf("baseRevision" to baseRevision, "value" to value)
        return ledger.idempotent(tx, actor, projectId, "task-link.put:$id", key, request) {
            val previous = tx.row(
                "SELECT $PROJECTION FROM app.task_links WHERE project_id = $1 AND id = $2",
                projectId,
                id,
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == baseRevision,
                409,
                "CONFLICT",
                "Связь уже изменена.",
            )
            requireCondition(
                previous == null || (
                    previous.string("kind") == value.kind && previous.string("fromId") == value.fromId &&
                        previous.string("toId") == value.toId
                    ),
                422,
                "LINK_IMMUTABLE",
                "Для изменения направления создайте новую связь.",
            )
            val tasks = tx.rows(
                "SELECT id FROM app.tasks WHERE project_id = $1 AND id = ANY($2)",
                projectId,
                listOf(value.fromId, value.toId),
            )
            requireCondition(tasks.size == 2, 422, "TASK_REFERENCE", "Связанные задачи недоступны.")
            if (!value.archived && value.kind == "depends") requireAcyclic(tx, projectId, id, value)
            val count = tx.row(
                "SELECT count(*)::int AS n FROM app.task_links WHERE project_id = $1",
                projectId,
            )!!.int("n")
            requireCondition(previous != null || count < LIMIT, 422, "LINK_LIMIT", "Превышен лимит связей проекта.")
            tx.update(
                """
                INSERT INTO app.task_links(project_id, id, kind, from_id, to_id, revision, archived_at)
                VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN clock_timestamp() ELSE NULL END)
                ON CONFLICT(project_id, id) DO UPDATE SET revision = $6,
                  archived_at = CASE WHEN $7 THEN coalesce(app.task_links.archived_at, clock_timestamp()) ELSE NULL END
                """.trimIndent(),
                projectId,
                id,
                value.kind,
                value.fromId,
                value.toId,
                baseRevision + 1,
                value.archived,
            )
            AuditTrail.record(tx, actor, projectId, "task-link.updated", id, baseRevision + 1)
            tx.row("SELECT $PROJECTION FROM app.task_links WHERE project_id = $1 AND id = $2", projectId, id)!!
        }
    }

    /** Dependencies stay acyclic, alone and together with the date constraints of planning. */
    private fun requireAcyclic(tx: Transaction, projectId: String, id: String, value: TaskLinkValue) {
        val cycle = tx.row(
            """
            WITH RECURSIVE reachable(id) AS (
              SELECT $2::text
              UNION SELECT l.to_id FROM app.task_links l JOIN reachable r ON l.from_id = r.id
              WHERE l.project_id = $1 AND l.kind = 'depends' AND l.archived_at IS NULL AND l.id <> $4
            ) SELECT 1 AS found FROM reachable WHERE id = $3 LIMIT 1
            """.trimIndent(),
            projectId,
            value.toId,
            value.fromId,
            id,
        )
        requireCondition(cycle == null, 422, "TASK_DEPENDENCY_CYCLE", "Зависимости не должны образовывать цикл.")
        val state = PlanningStates.load(tx, projectId)
        TemporalRules.validate(
            state.copy(
                dependencies = state.dependencies.filter { it.id != id } + Dependency(id, value.fromId, value.toId),
            ),
        )
    }
}
