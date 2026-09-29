package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition

/** How a person ends their control of delegated work. */
enum class WaitOutcome(val wire: String) { RESOLVED("resolved"), CANCELLED("cancelled") }

/**
 * "Жду" (docs/adr W5): a person's explicit, private control of work they handed to someone else. It starts only by
 * the person's own action, follows the task's current owner, and ends by the person's decision, never by itself.
 */
object Waiting {
    const val ACTIVE_LIMIT = 500

    private const val PROJECTION = """state, revision::int AS revision, expected_assignee_id AS "expectedAssigneeId",
        to_char(check_back_at, 'YYYY-MM-DD') AS "checkBackAt", source_sequence AS "sourceSequence",
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt""""

    fun current(tx: Transaction, actor: Actor, projectId: String, taskId: String): Row? = tx.row(
        "SELECT $PROJECTION FROM app.task_wait_state WHERE project_id = $1 AND task_id = $2 AND principal_id = $3",
        projectId,
        taskId,
        actor.id,
    )

    @Suppress("LongParameterList")
    fun start(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        checkBackAt: String?,
        sourceSequence: Long?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf(
            "taskId" to taskId,
            "baseRevision" to baseRevision,
            "checkBackAt" to checkBackAt,
            "sourceSequence" to sourceSequence,
        )
        return PrivateLedger.once(tx, actor, projectId, "wait.start", key, input) {
            val owner = tx.row("SELECT owner_id FROM app.tasks WHERE project_id = $1 AND id = $2", projectId, taskId)
                ?.stringOrNull("owner_id")
            requireCondition(
                owner != null && owner != actor.id,
                422,
                "WAIT_OWNER",
                "Ждать результат можно, когда задачу исполняет другой человек.",
            )
            if (sourceSequence != null) {
                val source = tx.row(
                    """
                    SELECT 1 AS found FROM app.task_activity
                    WHERE project_id = $1 AND sequence = $2 AND task_id = $3 AND kind = 'owner'
                    """.trimIndent(),
                    projectId,
                    sourceSequence,
                    taskId,
                )
                requireCondition(source != null, 422, "WAIT_SOURCE", "Назначение, за которым вы следите, недоступно.")
            }
            val previous = tx.row(
                """
                SELECT state, revision FROM app.task_wait_state WHERE project_id = $1 AND task_id = $2 AND principal_id = $3
                FOR UPDATE
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == baseRevision,
                409,
                "CONFLICT",
                "Ожидание уже изменено. Обновите задачу.",
            )
            requireCondition(previous?.string("state") != "active", 409, "WAIT_ACTIVE", "Вы уже ждёте результат.")
            val active = tx.row(
                "SELECT count(*)::int AS n FROM app.task_wait_state WHERE principal_id = $1 AND state = 'active'",
                actor.id,
            )!!.int("n")
            requireCondition(active < ACTIVE_LIMIT, 422, "WAIT_LIMIT", "Слишком много ожиданий. Завершите лишние.")
            val saved = tx.row(
                """
                INSERT INTO app.task_wait_state(project_id, task_id, principal_id, expected_assignee_id, source_sequence,
                                                check_back_at)
                VALUES ($1, $2, $3, $4, $5, $6::date)
                ON CONFLICT (project_id, task_id, principal_id) DO UPDATE
                  SET state = 'active', expected_assignee_id = EXCLUDED.expected_assignee_id,
                      source_sequence = EXCLUDED.source_sequence, check_back_at = EXCLUDED.check_back_at,
                      revision = app.task_wait_state.revision + 1, closed_at = NULL, updated_at = clock_timestamp()
                RETURNING revision
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                owner,
                sourceSequence,
                checkBackAt,
            )!!
            PersonalState.ensureWatermark(tx, actor, projectId, taskId)
            effect(taskId, projectId, saved.long("revision"), "active", checkBackAt, owner)
        }
    }

    @Suppress("LongParameterList")
    fun change(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        checkBackAt: String?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "checkBackAt" to checkBackAt)
        return PrivateLedger.once(tx, actor, projectId, "wait.change", key, input) {
            val saved = tx.row(
                """
                UPDATE app.task_wait_state SET check_back_at = $5::date, revision = revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 AND revision = $4 AND state = 'active'
                RETURNING revision, expected_assignee_id
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                baseRevision,
                checkBackAt,
            )
            requireCondition(saved != null, 409, "CONFLICT", "Ожидание уже изменено или завершено.")
            val expected = saved.stringOrNull("expected_assignee_id")
            effect(taskId, projectId, saved.long("revision"), "active", checkBackAt, expected)
        }
    }

    @Suppress("LongParameterList")
    fun close(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        outcome: WaitOutcome,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "outcome" to outcome.wire)
        return PrivateLedger.once(tx, actor, projectId, "wait.close", key, input) {
            val saved = tx.row(
                """
                UPDATE app.task_wait_state SET state = $5, revision = revision + 1, closed_at = clock_timestamp(),
                       updated_at = clock_timestamp()
                WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 AND revision = $4 AND state = 'active'
                RETURNING revision, expected_assignee_id, to_char(check_back_at, 'YYYY-MM-DD') AS "checkBackAt"
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                baseRevision,
                outcome.wire,
            )
            requireCondition(saved != null, 409, "CONFLICT", "Ожидание уже изменено или завершено.")
            effect(
                taskId,
                projectId,
                saved.long("revision"),
                outcome.wire,
                saved.stringOrNull("checkBackAt"),
                saved.stringOrNull("expected_assignee_id"),
            )
        }
    }

    @Suppress("LongParameterList")
    private fun effect(
        taskId: String,
        projectId: String,
        revision: Long,
        state: String,
        checkBackAt: String?,
        expectedAssigneeId: String?,
    ) = PrivateEffect(
        taskId,
        revision,
        linkedMapOf(
            "command" to "waiting",
            "projectId" to projectId,
            "taskId" to taskId,
            "revision" to revision,
            "state" to state,
            "checkBackAt" to checkBackAt,
            "expectedAssigneeId" to expectedAssigneeId,
        ),
    )
}
