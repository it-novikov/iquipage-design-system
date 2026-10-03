package com.sprintique.finance.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.Receipt
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.task.contract.TaskInputRequest
import com.sprintique.task.contract.TaskPriority
import com.sprintique.task.contract.TaskStatus
import com.sprintique.task.contract.TaskType
import com.sprintique.task.domain.TaskContent
import tools.jackson.databind.JsonNode
import java.util.UUID

/** What an explanation is about and what it says. */
data class FinanceVarianceNoteContent(
    val planId: String,
    val version: Int,
    val categoryId: String,
    val direction: String,
    val currencyCode: String,
    val text: String,
)

/** The task that acts on a variance, as the person names it: its title is theirs, never an amount of ours. */
data class FinanceVarianceTask(val title: String, val ownerId: String?, val due: String?)

/**
 * Explanations of variances of an approved plan version. Each records the forecast it was written for, so the
 * overview tells when the figure has moved on. An explanation may create one task through the task module, in the
 * same transaction: its id is derived from the explanation's, so neither a retry nor a second request makes another.
 */
object FinanceVarianceNotes {
    private const val PROJECTION = """n.id, n.project_id AS "projectId", n.plan_id AS "planId", n.version,
        n.category_id AS "categoryId", n.direction, n.currency_code AS "currencyCode", n.text, n.task_id AS "taskId",
        CASE WHEN t.id IS NULL THEN NULL ELSE tp.key || '-' || t.number END AS "taskDisplayId",
        n.forecast_minor_at_note::text AS "forecastMinorAtNote", n.revision,
        n.created_at AS "createdAt", jsonb_build_object('id', c.id, 'name', coalesce(c.profile_name, c.name)) AS "createdBy",
        n.updated_at AS "updatedAt", jsonb_build_object('id', u.id, 'name', coalesce(u.profile_name, u.name)) AS "updatedBy"
        FROM app.finance_variance_note n
        JOIN auth.principals c ON c.id = n.created_by JOIN auth.principals u ON u.id = n.updated_by
        LEFT JOIN app.tasks t ON t.project_id = n.project_id AND t.id = n.task_id
        LEFT JOIN app.projects tp ON tp.id = t.project_id"""

    /** Writes the explanation at [baseRevision]; the caller holds the project fence and the retry ledger. */
    @Suppress("LongParameterList")
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        content: FinanceVarianceNoteContent,
        task: FinanceVarianceTask?,
    ): Row {
        val current = tx.row(
            """
            SELECT revision, plan_id AS "planId", version, category_id AS "categoryId", direction,
                   currency_code AS "currencyCode", task_id AS "taskId"
            FROM app.finance_variance_note WHERE project_id = $1 AND id = $2 FOR UPDATE
            """.trimIndent(),
            projectId,
            id,
        )
        requireCondition(
            (current?.long("revision") ?: 0L) == baseRevision,
            409,
            "CONFLICT",
            "Объяснение уже изменено. Обновите сводку.",
        )
        if (current != null) requireSameVariance(current, content)
        val plan = approvedPlan(tx, projectId, content)
        if (current == null) requireUnexplained(tx, projectId, content)
        val forecast = forecast(tx, projectId, plan, content)
        val taskId = task?.let { createTask(tx, actor, projectId, id, current?.stringOrNull("taskId"), it) }
            ?: current?.stringOrNull("taskId")
        if (current == null) {
            tx.update(
                """
                INSERT INTO app.finance_variance_note(project_id, id, plan_id, version, category_id, direction,
                  currency_code, text, task_id, forecast_minor_at_note, revision, created_by, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::numeric, 1, $11, $11)
                """.trimIndent(),
                projectId,
                id,
                content.planId,
                content.version,
                content.categoryId,
                content.direction,
                content.currencyCode,
                content.text,
                taskId,
                forecast,
                actor.id,
            )
        } else {
            tx.update(
                """
                UPDATE app.finance_variance_note SET text = $3, task_id = $4, forecast_minor_at_note = $5::numeric,
                  revision = revision + 1, updated_by = $6, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                content.text,
                taskId,
                forecast,
                actor.id,
            )
        }
        AuditTrail.record(tx, actor, projectId, "finance-variance.noted", id, baseRevision + 1)
        return find(tx, projectId, id)!!
    }

    /** An explanation stays about the variance it was written for. */
    private fun requireSameVariance(current: Row, content: FinanceVarianceNoteContent) {
        val stored = listOf(
            current.string("planId"),
            current.int("version"),
            current.string("categoryId"),
            current.string("direction"),
            current.string("currencyCode"),
        )
        val asked = listOf(content.planId, content.version, content.categoryId, content.direction, content.currencyCode)
        requireCondition(stored == asked, 409, "FINANCE_NOTE_FIXED", "Объяснение относится к другому отклонению.")
    }

    /** The period and release of the approved version an explanation is written to, and its category in the project. */
    private fun approvedPlan(tx: Transaction, projectId: String, content: FinanceVarianceNoteContent): Row {
        val plan = requirePresent(
            tx.row(
                """
                SELECT to_char(p.period_start, 'YYYY-MM-DD') AS "periodStart",
                       to_char(p.period_end, 'YYYY-MM-DD') AS "periodEnd", p.release_id AS "releaseId", v.state
                FROM app.finance_plan p JOIN app.finance_plan_version v ON v.project_id = p.project_id AND v.plan_id = p.id
                WHERE p.project_id = $1 AND p.id = $2 AND v.version = $3
                """.trimIndent(),
                projectId,
                content.planId,
                content.version,
            ),
            404,
            "NOT_FOUND",
            "Версия плана недоступна.",
        )
        requireCondition(
            plan.string("state") == FinancePlanRules.APPROVED,
            409,
            "FINANCE_PLAN_NOT_APPROVED",
            "Объяснения пишут к утверждённой версии плана.",
        )
        requirePresent(
            tx.row(
                "SELECT 1 AS found FROM app.finance_category WHERE project_id = $1 AND id = $2",
                projectId,
                content.categoryId,
            ),
            422,
            "FINANCE_CATEGORY",
            "Категория недоступна в проекте.",
        )
        return plan
    }

    /** One explanation per variance of a version: a second one under another id is refused. */
    private fun requireUnexplained(tx: Transaction, projectId: String, content: FinanceVarianceNoteContent) {
        val other = tx.row(
            """
            SELECT id FROM app.finance_variance_note
            WHERE project_id = $1 AND plan_id = $2 AND version = $3 AND category_id = $4 AND direction = $5
              AND currency_code = $6
            """.trimIndent(),
            projectId,
            content.planId,
            content.version,
            content.categoryId,
            content.direction,
            content.currencyCode,
        )
        requireCondition(other == null, 409, "FINANCE_NOTE_EXISTS", "У этого отклонения уже есть объяснение.")
    }

    /** The forecast of the variance now: posted and expected entries of its key inside the plan's period. */
    private fun forecast(tx: Transaction, projectId: String, plan: Row, content: FinanceVarianceNoteContent): String =
        tx.row(
            """
            SELECT coalesce(sum(amount_minor), 0)::text AS forecast FROM app.finance_entry
            WHERE project_id = $1 AND state <> 'voided' AND category_id = $2 AND direction = $3 AND currency_code = $4
              AND entry_date BETWEEN $5::date AND $6::date AND ($7::text IS NULL OR release_id = $7::text)
            """.trimIndent(),
            projectId,
            content.categoryId,
            content.direction,
            content.currencyCode,
            plan.string("periodStart"),
            plan.string("periodEnd"),
            plan.stringOrNull("releaseId"),
        )!!.string("forecast")

    /**
     * The task of an explanation, created through the task module with the caller's own task rights. Its id is
     * derived from the explanation, so it exists at most once whatever the retry key.
     */
    @Suppress("LongParameterList")
    private fun createTask(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        noteId: String,
        existing: String?,
        task: FinanceVarianceTask,
    ): String {
        requireCondition(existing == null, 409, "FINANCE_NOTE_TASK_EXISTS", "Задача по этому отклонению уже создана.")
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_WRITE)
        val taskId = taskIdOf(projectId, noteId)
        Tasks.put(
            tx,
            actor,
            projectId,
            taskId,
            0,
            TaskContent(
                attachmentIds = emptyList(),
                coverAttachmentId = null,
                coverCrop = null,
                coverCropAttachmentId = null,
                title = task.title,
                description = "",
                status = TaskStatus.READY.wire,
                type = TaskType.TASK.wire,
                priority = TaskPriority.NORMAL.wire,
                ownerId = task.ownerId,
                due = task.due,
                rank = TaskInputRequest.DEFAULT_RANK,
                parentId = null,
                releaseId = null,
                tagIds = emptyList(),
            ),
        )
        return taskId
    }

    fun taskIdOf(projectId: String, noteId: String): String =
        UUID.nameUUIDFromBytes("finance-variance-task:$projectId:$noteId".toByteArray()).toString()

    /** The receipt names the explanation and its revision; a retry answers with the explanation as it is now. */
    fun receipt(tx: Transaction, projectId: String): Receipt<Row> = object : Receipt<Row> {
        override fun store(value: Row): Any = mapOf("id" to value["id"], "revision" to value["revision"])

        override fun restore(record: JsonNode): Any = requirePresent(
            find(tx, projectId, record.path("id").asString()),
            404,
            "NOT_FOUND",
            "Объяснение недоступно.",
        )
    }

    private fun find(tx: Transaction, projectId: String, id: String): Row? =
        tx.row("SELECT $PROJECTION WHERE n.project_id = $1 AND n.id = $2", projectId, id)
}
