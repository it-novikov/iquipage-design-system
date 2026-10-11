package com.sprintique.task.application

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
import com.sprintique.task.domain.TaskMaterialRules
import com.sprintique.task.domain.TaskMaterialValue
import com.sprintique.task.domain.TaskRules

/** Materials share a task's access, but have their own revision and recoverable archive. */
object TaskMaterials {
    private const val PROJECTION = """id,project_id AS "projectId",task_id AS "taskId",category,title,url,revision::float8 AS revision,
        archived_at AS "archivedAt",created_at AS "createdAt",updated_at AS "updatedAt""""

    fun list(tx: Transaction, actor: Actor, projectId: String, task: String): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val taskId = Tasks.read(tx, projectId, task).string("id")
        val rows = tx.rows(
            """SELECT $PROJECTION FROM app.task_material WHERE project_id=$1 AND task_id=$2
                AND archived_at IS NULL ORDER BY created_at,id LIMIT $3""",
            projectId,
            taskId,
            TaskMaterialRules.ACTIVE_LIMIT + 1,
        )
        requireCondition(
            rows.size <= TaskMaterialRules.ACTIVE_LIMIT, 422, "MATERIAL_LIMIT", "Превышен лимит материалов задачи.",
        )
        return rows
    }

    /** Includes an archived reference, so a conflict can be compared and removal can be undone. */
    fun read(tx: Transaction, actor: Actor, projectId: String, task: String, id: String): Row {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val taskId = Tasks.read(tx, projectId, task).string("id")
        return requirePresent(
            tx.row(
                "SELECT $PROJECTION FROM app.task_material WHERE project_id=$1 AND task_id=$2 AND id=$3",
                projectId, taskId, id,
            ),
            404,
            "NOT_FOUND",
            "Материал недоступен.",
        )
    }

    @Suppress("LongParameterList")
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        task: String,
        id: String,
        baseRevision: Long,
        input: TaskMaterialValue,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        val owner = Tasks.read(tx, projectId, task)
        val taskId = owner.string("id")
        val value = TaskMaterialRules.checked(input)
        val request = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "value" to value)
        return ledger.idempotent(tx, actor, projectId, "task-material.put:$id", key, request) {
            TaskRules.requireOpen(owner.string("result"))
            val previous = tx.row(
                "SELECT $PROJECTION FROM app.task_material WHERE project_id=$1 AND id=$2", projectId, id,
            )
            requireCondition(
                previous == null || previous.string("taskId") == taskId, 404, "NOT_FOUND", "Материал недоступен.",
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == baseRevision, 409, "CONFLICT", "Материал уже изменён.",
            )
            requireCondition(
                baseRevision < MAX_SAFE_INTEGER, 422, "REVISION_LIMIT", "Достигнут предел ревизий материала.",
            )
            requireCondition(
                previous != null || !value.archived,
                422, "MATERIAL_ARCHIVED", "Новый материал нельзя сразу архивировать.",
            )
            if (!value.archived) checkActive(tx, projectId, taskId, id, value)
            save(tx, projectId, taskId, id, baseRevision + 1, value)
            AuditTrail.record(tx, actor, projectId, "task-material.updated", id, baseRevision + 1)
            val row = tx.row("SELECT $PROJECTION FROM app.task_material WHERE project_id=$1 AND id=$2", projectId, id)!!
            if (actor.mayRead(Capability.TASKS_READ)) {
                row
            } else {
                mapOf(
                    "receipt" to "task-material", "id" to id, "projectId" to projectId, "taskId" to taskId,
                    "revision" to row.long("revision"), "updatedAt" to row["updatedAt"],
                )
            }
        }
    }

    private fun checkActive(tx: Transaction, projectId: String, taskId: String, id: String, value: TaskMaterialValue) {
        val state = tx.row(
            """SELECT count(*)::int AS n,coalesce(bool_or(category=$4 AND url=$5),false) AS duplicate
                FROM app.task_material WHERE project_id=$1 AND task_id=$2 AND id<>$3 AND archived_at IS NULL""",
            projectId,
            taskId,
            id,
            value.category,
            value.url,
        )!!
        requireCondition(
            state.int("n") < TaskMaterialRules.ACTIVE_LIMIT, 422, "MATERIAL_LIMIT", "В задаче уже 100 материалов.",
        )
        requireCondition(!state.boolean("duplicate"), 409, "MATERIAL_DUPLICATE", "Эта ссылка уже добавлена в раздел.")
    }

    @Suppress("LongParameterList")
    private fun save(
        tx: Transaction,
        projectId: String,
        taskId: String,
        id: String,
        revision: Long,
        value: TaskMaterialValue,
    ) {
        tx.update(
            """INSERT INTO app.task_material(project_id,id,task_id,category,title,url,revision,archived_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN clock_timestamp() ELSE NULL END)
                ON CONFLICT(project_id,id) DO UPDATE SET category=$4,title=$5,url=$6,revision=$7,
                  updated_at=clock_timestamp(),archived_at=CASE WHEN $8
                    THEN coalesce(app.task_material.archived_at,clock_timestamp()) ELSE NULL END""",
            projectId,
            id,
            taskId,
            value.category,
            value.title,
            value.url,
            revision,
            value.archived,
        )
    }
}
