package com.sprintique.agent.application

import com.sprintique.access.domain.Permission
import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.map.application.Maps
import com.sprintique.planning.application.Planning
import com.sprintique.planning.application.PlanningStates
import com.sprintique.planning.contract.PlanningCommandContract
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.time.Instant

/** A run to register: its id, goal, proposal budget, lifetime, and the finished run it retries. */
data class NewRun(
    val id: String,
    val goal: String,
    val maxProposals: Int,
    val expiresInSeconds: Int,
    val parentRunId: String?,
)

/** How a run ends: completed, failed with a reason, or cancelled. */
data class RunEnd(val baseRevision: Long, val state: String, val errorCode: String?)

/**
 * Agent runs: an agent works toward a goal under its own grant, proposes planning changes within a budget, and a
 * person approves each exact plan. A run ends by completing, failing, being cancelled or expiring.
 */
@Component
@Profile("api")
class AgentRuns(
    private val planning: Planning,
    private val maps: Maps,
    private val json: JsonMapper,
    private val ledger: CommandLedger,
) {
    fun list(tx: Transaction, actor: Actor, projectId: String, cursor: String?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val rows = tx.rows(
            """
            SELECT $PROJECTION FROM app.agent_runs WHERE project_id = $1 AND ($2::boolean OR agent_id = $3)
              AND ($4::uuid IS NULL OR id > $4::uuid) ORDER BY id LIMIT $5
            """.trimIndent(),
            projectId,
            actor.isHuman,
            actor.id,
            cursor,
            PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(PAGE).map(::present),
            "nextCursor" to if (rows.size > PAGE) rows[PAGE - 1].string("id") else null,
        )
    }

    fun read(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Any?> {
        val run = row(tx, actor, projectId, id)
        val plans = tx.rows(
            """
            SELECT p.plan_id AS id, s.summary, a.status AS approval, ap.result AS receipt FROM app.agent_run_plans p
            JOIN app.planning_plans s ON s.project_id = p.project_id AND s.id = p.plan_id
            LEFT JOIN app.approvals a ON a.project_id = p.project_id AND a.subject_id = p.plan_id::text
            LEFT JOIN app.planning_applied ap ON ap.project_id = p.project_id AND ap.plan_id = p.plan_id
            WHERE p.project_id = $1 AND p.run_id = $2 ORDER BY p.created_at, p.plan_id LIMIT 20
            """.trimIndent(),
            projectId,
            id,
        )
        return present(run) + ("plans" to plans)
    }

    fun start(tx: Transaction, actor: Actor, projectId: String, input: NewRun, key: String): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        requireCondition(!actor.isHuman, 403, "AGENT_REQUIRED", "Запуск регистрирует агент с отдельным разрешением.")
        return ledger.idempotent(tx, actor, projectId, "run.start", key, input) {
            val active = tx.row(
                """
                SELECT count(*)::int AS n FROM app.agent_runs
                WHERE project_id = $1 AND agent_id = $2 AND completed_at IS NULL AND expires_at > clock_timestamp()
                """.trimIndent(),
                projectId,
                actor.id,
            )!!.int("n")
            requireCondition(active < ACTIVE_LIMIT, 429, "RUN_LIMIT", "Не более трёх активных запусков на агента.")
            input.parentRunId?.let { parentId ->
                val parent = row(tx, actor, projectId, parentId)
                requireCondition(
                    parent.string("agentId") == actor.id && finished(parent),
                    409,
                    "RUN_RETRY",
                    "Предыдущий запуск ещё активен.",
                )
            }
            tx.update(
                """
                INSERT INTO app.agent_runs(project_id, id, agent_id, credential_id, initiator_id, goal, state, max_proposals,
                                           expires_at, parent_run_id)
                SELECT $1, $2, $3, $4, $5, $6, 'running', $7, least(expires_at, clock_timestamp() + make_interval(secs => $8::int)), $9
                FROM auth.credentials WHERE id = $4
                """.trimIndent(),
                projectId,
                input.id,
                actor.id,
                actor.credentialId,
                actor.initiatorId,
                input.goal,
                input.maxProposals,
                input.expiresInSeconds,
                input.parentRunId,
            )
            AuditTrail.record(tx, actor, projectId, "agent.run.started", input.id, 1)
            read(tx, actor, projectId, input.id)
        }
    }

    /** A proposal is a planning preview bound to the run; its token is returned once and never stored. */
    fun propose(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        command: PlanningCommandContract,
    ): Map<String, Any?> {
        PlanningStates.lock(tx, actor, projectId, write = true)
        val run = row(tx, actor, projectId, id)
        requireWritable(run, actor, baseRevision)
        requireCondition(
            run.int("usedProposals") < run.int("maxProposals"),
            422,
            "RUN_BUDGET",
            "Бюджет предложений исчерпан. Завершите запуск.",
        )
        val plan = planning.preview(tx, actor, projectId, command)
        tx.update(
            "INSERT INTO app.agent_run_plans(project_id, run_id, plan_id) VALUES ($1, $2, $3)",
            projectId,
            id,
            plan["id"],
        )
        tx.update(
            """
            UPDATE app.agent_runs SET state = 'awaiting_approval', revision = revision + 1, used_proposals = used_proposals + 1,
              latest_plan_id = $3 WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            projectId,
            id,
            plan["id"],
        )
        AuditTrail.record(tx, actor, projectId, "agent.run.proposed", id, run.long("revision") + 1)
        return linkedMapOf("run" to read(tx, actor, projectId, id), "preview" to plan)
    }

    @Suppress("LongParameterList")
    fun commit(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        planId: String,
        token: String,
        key: String,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        val request = linkedMapOf(
            "baseRevision" to baseRevision,
            "plan" to linkedMapOf("planId" to planId, "token" to token),
        )
        return ledger.idempotent(tx, actor, projectId, "run.commit:$id", key, request) {
            val run = row(tx, actor, projectId, id)
            requireWritable(run, actor, baseRevision)
            requireCondition(
                run.stringOrNull("latestPlanId") == planId,
                409,
                "RUN_PLAN",
                "Подтверждается другое предложение.",
            )
            val receipt = planning.commit(tx, actor, projectId, planId, token, "run-$id-${run.long("revision")}")
            tx.update(
                """
                UPDATE app.agent_runs SET state = 'running', revision = revision + 1 WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
            )
            AuditTrail.record(tx, actor, projectId, "agent.run.result", id, run.long("revision") + 1)
            linkedMapOf("run" to read(tx, actor, projectId, id), "receipt" to json.valueToTree(receipt))
        }
    }

    fun finish(tx: Transaction, actor: Actor, projectId: String, id: String, end: RunEnd, key: String): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        return ledger.idempotent(tx, actor, projectId, "run.finish:$id", key, end) {
            val run = row(tx, actor, projectId, id)
            if (!actor.isHuman) {
                requireWritable(run, actor, end.baseRevision)
            } else {
                val access = ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_WRITE)
                requireCondition(
                    end.state == "cancelled" &&
                        (run.string("initiatorId") == actor.id || access.has(Permission.PROJECT_ACCESS)),
                    403,
                    "RUN_OWNER",
                    "Остановить запуск может инициатор или администратор.",
                )
                requireCondition(
                    run.long("revision") == end.baseRevision && run["completedAt"] == null,
                    409,
                    "CONFLICT",
                    "Запуск уже изменён.",
                )
            }
            if (end.state == "completed") {
                val applied = tx.row(
                    "SELECT 1 AS found FROM app.planning_applied WHERE project_id = $1 AND plan_id = $2::uuid",
                    projectId,
                    run.stringOrNull("latestPlanId"),
                )
                requireCondition(
                    applied != null,
                    409,
                    "RUN_UNCONFIRMED",
                    "Сначала подтвердите результат последнего предложения.",
                )
            }
            tx.update(
                """
                UPDATE app.agent_runs SET state = $3, revision = revision + 1, completed_at = clock_timestamp(), error_code = $4
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                end.state,
                if (end.state == "failed") end.errorCode ?: "AGENT_FAILED" else null,
            )
            AuditTrail.record(tx, actor, projectId, "agent.run.${end.state}", id, run.long("revision") + 1)
            read(tx, actor, projectId, id)
        }
    }

    /**
     * Bounded, data-only context for an agent: the tasks and map objects it names, marked as untrusted content. No
     * credentials and no file bytes.
     */
    fun context(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskIds: List<String>,
        mapId: String?,
        objectIds: List<String>?,
    ): Map<String, Any?> {
        val data = linkedMapOf<String, Any?>()
        if (taskIds.isNotEmpty()) {
            ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
            val ids = taskIds.distinct()
            val rows = tx.rows(
                """
                SELECT t.id, p.key || '-' || t.number AS key, t.title, t.description, t.revision, t.status, t.preparation, t.result
                FROM app.tasks t JOIN app.projects p ON p.id = t.project_id WHERE t.project_id = $1 AND t.id = ANY($2) ORDER BY t.id
                """.trimIndent(),
                projectId,
                ids,
            )
            requireCondition(rows.size == ids.size, 404, "CONTEXT_REFERENCE", "Один из объектов контекста недоступен.")
            data["tasks"] = rows
        }
        if (mapId != null) {
            val map = maps.read(tx, actor, projectId, mapId)
            val objects = map.path("document").path("objects").values().filter {
                objectIds == null ||
                    it.path("id").asString() in objectIds
            }
            requireCondition(
                objectIds == null || objects.size == objectIds.toSet().size,
                404,
                "CONTEXT_REFERENCE",
                "Один из объектов карты недоступен.",
            )
            requireCondition(objects.size <= MAP_OBJECTS, 422, "CONTEXT_LIMIT", "Выберите не более 100 объектов карты.")
            data["map"] = linkedMapOf(
                "id" to map.path("id").asString(),
                "revision" to map.path("revision").asLong(),
                "title" to map.path("title").asString(),
                "objects" to objects.map {
                    linkedMapOf(
                        "id" to it.path("id").asString(),
                        "type" to it.path("type").asString(),
                        "text" to it.path("text").asString(),
                        "parentId" to it.path("parentId").takeIf { parent -> parent.isString }?.asString(),
                        "locked" to it.path("locked").asBoolean(false),
                    )
                },
            )
        }
        ProjectAccess.authorize(
            tx,
            actor,
            projectId,
            if (mapId != null) Capability.MAPS_READ else Capability.TASKS_READ,
        )
        requireCondition(
            json.writeValueAsBytes(data).size <= CONTEXT_BYTES,
            422,
            "CONTEXT_LIMIT",
            "Контекст превышает 64 КиБ. Уменьшите выборку.",
        )
        return linkedMapOf(
            "schema" to "sprintique.agent-context/1",
            "projectId" to projectId,
            "trust" to "untrusted-content",
            "data" to data,
        )
    }

    private fun row(tx: Transaction, actor: Actor, projectId: String, id: String): Row {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val run = tx.row(
            "SELECT $PROJECTION FROM app.agent_runs WHERE project_id = $1 AND id = $2::uuid",
            projectId,
            id,
        )
        val found = requirePresent(run, 404, "RUN_NOT_FOUND", "Запуск недоступен.")
        requireCondition(
            actor.isHuman || found.string("agentId") == actor.id,
            404,
            "RUN_NOT_FOUND",
            "Запуск недоступен.",
        )
        return found
    }

    private fun requireWritable(run: Row, actor: Actor, revision: Long) {
        requireCondition(
            !actor.isHuman && run.string("agentId") == actor.id && run.string("credentialId") == actor.credentialId,
            403,
            "RUN_OWNER",
            "Действие доступно выданному для запуска разрешению.",
        )
        requireCondition(run.long("revision") == revision, 409, "CONFLICT", "Состояние запуска изменилось.")
        requireCondition(
            !finished(run),
            409,
            "RUN_TERMINAL",
            "Запуск остановлен или срок истёк. Создайте новый запуск.",
        )
    }

    private fun finished(run: Row) = run["completedAt"] != null || !run.instant("expiresAt").isAfter(Instant.now())

    /** An unfinished run past its time reads as expired. */
    private fun present(run: Row): Map<String, Any?> = LinkedHashMap<String, Any?>(run).apply {
        if (run["completedAt"] == null && !run.instant("expiresAt").isAfter(Instant.now())) put("state", "expired")
    }

    private companion object {
        const val PAGE = 50
        const val ACTIVE_LIMIT = 3
        const val MAP_OBJECTS = 100
        const val CONTEXT_BYTES = 65_536

        const val PROJECTION = """id, project_id AS "projectId", agent_id AS "agentId", credential_id AS "credentialId",
            initiator_id AS "initiatorId", goal, state, revision, max_proposals AS "maxProposals", used_proposals AS "usedProposals",
            latest_plan_id AS "latestPlanId", parent_run_id AS "parentRunId", expires_at AS "expiresAt", created_at AS "createdAt",
            completed_at AS "completedAt", error_code AS "errorCode""""
    }
}
