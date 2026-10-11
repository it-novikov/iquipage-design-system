package com.sprintique.work.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition

/** A leased agent can yield only its linked run; choosing another agent still belongs to a person. */
internal fun TaskWork.stopRun(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    session: Row,
    runId: String,
) {
    if (actor.isHuman) {
        agents.cancel(tx, actor, project, task, runId)
        return
    }
    val run = tx.row(
        """
        UPDATE app.ai_agent_runs SET cancel_requested_by=$5,cancel_requested_at=clock_timestamp(),
          state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,
          finished_at=CASE WHEN state='queued' THEN clock_timestamp() ELSE finished_at END,revision=revision+1
        WHERE project_id=$1 AND task_id=$2 AND id=$3::uuid AND account_id=$4
          AND state IN ('queued','running') AND cancel_requested_at IS NULL
        RETURNING credential_id AS credential
        """.trimIndent(),
        project, task, runId, actor.id, session.string("requested_by"),
    )
    requireCondition(run != null, 409, "RUN_FINISHED", "Запуск уже закончился.")
    run.stringOrNull("credential")?.let {
        tx.update("UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL", it)
    }
}
