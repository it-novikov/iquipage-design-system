package com.sprintique.job.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.workspace.application.Membership

/** What a project administrator sees of background work, and the retry of a failed cleanup job. */
object Operations {
    private const val LIMIT = 50

    fun overview(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.PROJECT_SETTINGS)
        val counts = tx.rows(
            """
            SELECT kind, state, count(*)::int AS count FROM work.jobs WHERE project_id = $1
            GROUP BY kind, state ORDER BY kind, state
            """.trimIndent(),
            projectId,
        )
        val jobs = tx.rows(
            """
            SELECT id, kind, state, attempts, last_error AS "errorCode", available_at AS "availableAt", lease_until AS "leaseUntil",
                   created_at AS "createdAt"
            FROM work.jobs WHERE project_id = $1 AND state IN ('pending', 'running', 'failed')
            ORDER BY CASE WHEN state = 'failed' THEN 0 WHEN state = 'running' THEN 1 ELSE 2 END, available_at, id LIMIT $2
            """.trimIndent(),
            projectId,
            LIMIT,
        )
        return linkedMapOf(
            "counts" to counts,
            "jobs" to jobs,
            "limit" to LIMIT,
            "eventDelivery" to "durable-pull-and-sse",
            "externalPushConfigured" to false,
        )
    }

    fun retry(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        jobId: String,
        key: String,
        ledger: CommandLedger,
    ): Any {
        Membership.manageProject(tx, actor, projectId, Capability.PROJECT_SETTINGS)
        return ledger.idempotent(tx, actor, projectId, "job.retry:$jobId", key, emptyMap<String, Any>()) {
            val result = tx.row("SELECT work.retry_asset_job($1, $2) AS ok", projectId, jobId)
            requireCondition(
                result?.get("ok") == true,
                409,
                "JOB_STATE",
                "Операция уже завершена, выполняется или недоступна.",
            )
            AuditTrail.record(tx, actor, projectId, "job.retried", jobId, 1)
            linkedMapOf("id" to jobId, "state" to "pending")
        }
    }
}
