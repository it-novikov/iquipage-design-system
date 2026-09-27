package com.sprintique.planning.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode
import java.util.UUID

/** People's decisions on plans that agents propose. An approval binds to the exact action of one preview. */
object Approvals {
    fun detail(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Any?> {
        PlanningStates.lock(tx, actor, projectId)
        val row = tx.row(
            """
            SELECT id, subject_kind AS "subjectKind", subject_id AS "subjectId", action_hash AS "actionHash",
                   requested_by AS "requestedBy", initiator_id AS "initiatorId", status, revision, expires_at AS "expiresAt"
            FROM app.approvals WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            projectId,
            id,
        )
        val approval = requirePresent(row, 404, "NOT_FOUND", "Предложение недоступно.")
        requireCondition(
            actor.isHuman || approval["requestedBy"] == actor.id,
            404,
            "NOT_FOUND",
            "Предложение недоступно.",
        )
        val subject = approval.string("subjectId")
        val plan = tx.row(
            "SELECT command, summary FROM app.planning_plans WHERE project_id = $1 AND id = $2",
            projectId,
            subject,
        )
        val applied = tx.row(
            "SELECT result FROM app.planning_applied WHERE project_id = $1 AND plan_id = $2",
            projectId,
            subject,
        )
        return LinkedHashMap<String, Any?>(approval).apply {
            put("command", plan?.json("command"))
            put("preview", plan?.json("summary"))
            put("application", applied?.json("result"))
        }
    }

    @Suppress("LongParameterList")
    fun decide(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        status: String,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Решение принимает человек.")
        val request = linkedMapOf("baseRevision" to baseRevision, "status" to status)
        return ledger.idempotent(tx, actor, projectId, "approval.decide:$id", key, request) {
            val updated = tx.row(
                """
                UPDATE app.approvals SET status = $3, decided_by = $4, decided_at = clock_timestamp(), revision = revision + 1
                WHERE project_id = $1 AND id = $2 AND revision = $5 AND status = 'proposed' AND expires_at > clock_timestamp()
                RETURNING revision
                """.trimIndent(),
                projectId,
                id,
                status,
                actor.id,
                baseRevision,
            )
            val decided = requirePresent(updated, 409, "APPROVAL_STALE", "Предложение изменено или устарело.")
            AuditTrail.recordOperation(
                tx, actor, projectId, UUID.randomUUID().toString(), "approval.$status", id, decided.long("revision"),
            )
            detail(tx, actor, projectId, id)
        }
    }

    fun effects(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        limit: Int,
        cursor: String?,
    ): Map<String, Any?> {
        val approval = detail(tx, actor, projectId, id)
        val stored = tx.row(
            "SELECT effects, project_revision AS revision FROM app.planning_plans WHERE project_id = $1 AND id = $2",
            projectId,
            approval["subjectId"],
        )!!
        val effects: List<JsonNode> = stored.json("effects")!!.path("effects").values().toList()
        return PlanningJson.page(Pages.page(effects, "approval:$id", stored.long("revision"), limit, cursor))
    }
}
