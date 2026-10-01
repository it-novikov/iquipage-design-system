package com.sprintique.ai.application

import com.sprintique.access.domain.Permission
import com.sprintique.ai.domain.ProviderFailure
import com.sprintique.command.AuditTrail
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** Why a run ended other than done, in words for people. */
object RunErrors {
    private val messages = mapOf(
        "RUN_LIMIT" to "Агент исчерпал лимит запусков в час. Повторите позже.",
        "STEP_LIMIT" to "Агент остановился: достигнут лимит шагов запуска.",
        "TOKEN_LIMIT" to "Агент остановился: запуск израсходовал свой бюджет токенов.",
        "RUN_TIMEOUT" to "Агент не уложился во время, отведённое на запуск.",
        "RUN_ABANDONED" to "Запуск прервался и не был продолжен.",
        "RUN_EXPIRED" to "Запуск слишком долго ждал очереди и не начался.",
        "AGENT_DISABLED" to "Агента выключили, его подключение удалено или сервисный аккаунт приостановлен.",
        "ACCESS_LOST" to "У сервисного аккаунта больше нет доступа к задаче.",
        "COMMENT_FORBIDDEN" to
            "Агент закончил, но не может писать в обсуждениях: у сервисного аккаунта нет этого права.",
        "AI_KEY_UNREADABLE" to "Ключ ИИ-подключения не читается сервером. Введите ключ API заново.",
        "RUN_FAILED" to "Запуск не удался из-за внутренней ошибки.",
        "CONTEXT_LIMIT" to "Разговор агента стал слишком длинным. Разбейте задачу на части.",
    )

    fun message(code: String?): String? = code?.let { messages[it] ?: ProviderFailure.fromCode(it)?.message }
}

/**
 * Agents on a task (docs/decisions/0005-ai-agents.md): which agents of the project can work on it, its recent runs
 * and their steps, a run started by hand («Запустить агента») and a stop. People of the project see runs; starting and
 * stopping need «Менять задачи» and the person's own session.
 */
@Component
@Profile("api")
class TaskAgents {
    fun overview(tx: Transaction, actor: Actor, projectId: String, taskReference: String): Map<String, Any?> {
        val access = ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val taskId = Tasks.read(tx, projectId, taskReference).string("id")
        val runs = tx.rows(
            """
            SELECT $PROJECTION FROM app.ai_agent_runs r JOIN auth.principals a ON a.id = r.account_id
            LEFT JOIN auth.principals q ON q.id = r.requested_by
            WHERE r.project_id = $1 AND r.task_id = $2 ORDER BY r.created_at DESC, r.id LIMIT $3
            """.trimIndent(),
            projectId,
            taskId,
            RUN_LIMIT,
        )
        val latest = runs.firstOrNull()
        val steps = latest?.let {
            tx.rows(
                """
                SELECT sequence, kind, tool, summary, status, error_code AS "errorCode", input_tokens AS "inputTokens",
                       output_tokens AS "outputTokens", created_at AS "createdAt"
                FROM app.ai_agent_run_steps WHERE project_id = $1 AND run_id = $2::uuid ORDER BY sequence DESC LIMIT $3
                """.trimIndent(),
                projectId,
                it.string("id"),
                STEP_LIMIT,
            ).reversed()
        }.orEmpty()
        val mayStart = actor.isHuman && actor.isInteractive && access.has(Permission.TASKS_WRITE)
        return linkedMapOf(
            "agents" to agents(tx, projectId),
            "canStart" to mayStart,
            "canStop" to mayStart,
            "runs" to runs.map(::present),
            "steps" to steps,
        )
    }

    fun start(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskReference: String,
        accountId: String,
    ): Map<String, Any?> {
        requirePerson(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val task = Tasks.read(tx, projectId, taskReference)
        requireCondition(
            task.string("result") == "open",
            409,
            "TASK_CLOSED",
            "Задача закрыта: агенту здесь нечего делать.",
        )
        val queued = tx.row(
            """
            SELECT run_id AS id, run_state AS state, run_error AS "errorCode" FROM app.ai_run_enqueue($1, $2, $3, 'manual')
            """.trimIndent(),
            projectId,
            task.string("id"),
            accountId,
        )
        val run = requirePresent(
            queued,
            422,
            "AGENT_UNAVAILABLE",
            "У этого сервисного аккаунта нет включённого агента в проекте.",
        )
        if (run.stringOrNull("errorCode") == "RUN_LIMIT") {
            throw ProblemException(429, "RUN_LIMIT", RunErrors.message("RUN_LIMIT")!!)
        }
        AuditTrail.record(tx, actor, projectId, "ai.run.started", run.string("id"), 1)
        return present(one(tx, projectId, run.string("id")))
    }

    /** Asks a run to stop: a queued one stops at once, a running one after its current step; its access ends now. */
    fun cancel(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskReference: String,
        runId: String,
    ): Map<String, Any?> {
        requirePerson(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val taskId = Tasks.read(tx, projectId, taskReference).string("id")
        val run = tx.row(
            """
            UPDATE app.ai_agent_runs SET cancel_requested_by = $4, cancel_requested_at = clock_timestamp(),
              state = CASE WHEN state = 'queued' THEN 'cancelled' ELSE state END,
              finished_at = CASE WHEN state = 'queued' THEN clock_timestamp() ELSE finished_at END,
              revision = revision + 1
            WHERE project_id = $1 AND task_id = $2 AND id = $3::uuid AND state IN ('queued', 'running')
              AND cancel_requested_at IS NULL
            RETURNING id, credential_id AS "credentialId"
            """.trimIndent(),
            projectId,
            taskId,
            runId,
            actor.id,
        )
        requireCondition(run != null, 409, "RUN_FINISHED", "Запуск уже закончился.")
        // The tool calls of the run fail from now on, even one the runner is about to make.
        run.stringOrNull("credentialId")?.let {
            tx.update(
                "UPDATE auth.credentials SET revoked_at = clock_timestamp() WHERE id = $1 AND revoked_at IS NULL",
                it,
            )
        }
        AuditTrail.record(tx, actor, projectId, "ai.run.cancelled", runId, 1)
        return present(one(tx, projectId, runId))
    }

    /** The service accounts of the project whose agent is on, with a live connection, and that can act now. */
    private fun agents(tx: Transaction, projectId: String): List<Row> = tx.rows(
        """
        SELECT a.id, coalesce(a.profile_name, a.name) AS name, p.model, c.name AS "connectionName", c.provider,
               p.on_assignment AS "onAssignment", 'tasks.write' = ANY(m.permissions) AS "canEdit",
               'threads.write' = ANY(m.permissions) AS "canComment"
        FROM app.project_members m JOIN auth.principals a ON a.id = m.principal_id AND a.kind = 'service'
        JOIN app.ai_agent_profiles p ON p.principal_id = a.id AND p.enabled
        JOIN app.ai_connections c ON c.id = p.connection_id AND c.deleted_at IS NULL
        WHERE m.project_id = $1 AND auth.service_account_active(a.id) ORDER BY name, a.id LIMIT 50
        """.trimIndent(),
        projectId,
    )

    private fun one(tx: Transaction, projectId: String, runId: String): Row = tx.row(
        """
        SELECT $PROJECTION FROM app.ai_agent_runs r JOIN auth.principals a ON a.id = r.account_id
        LEFT JOIN auth.principals q ON q.id = r.requested_by WHERE r.project_id = $1 AND r.id = $2::uuid
        """.trimIndent(),
        projectId,
        runId,
    )!!

    private fun present(run: Row): Map<String, Any?> =
        LinkedHashMap<String, Any?>(run).apply { put("errorMessage", RunErrors.message(run.stringOrNull("errorCode"))) }

    private fun requirePerson(actor: Actor) {
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Агента запускает и останавливает человек.")
    }

    private companion object {
        const val RUN_LIMIT = 5
        const val STEP_LIMIT = 60
        const val PROJECTION = """r.id, r.task_id AS "taskId", r.account_id AS "accountId",
            coalesce(a.profile_name, a.name) AS "accountName", r.model, r.trigger, r.requested_by AS "requestedBy",
            coalesce(q.profile_name, q.name) AS "requestedByName", r.state, r.steps_used AS "stepsUsed",
            r.max_steps AS "maxSteps", r.max_run_tokens AS "maxRunTokens", least(r.input_tokens, 2147483647)::int AS "inputTokens",
            least(r.output_tokens, 2147483647)::int AS "outputTokens", (r.cost_micros / 1e6)::float8 AS "costUsd",
            r.error_code AS "errorCode", r.message_id AS "messageId",
            r.cancel_requested_at IS NOT NULL AS "stopRequested", r.created_at AS "createdAt", r.started_at AS "startedAt",
            r.finished_at AS "finishedAt""""
    }
}
