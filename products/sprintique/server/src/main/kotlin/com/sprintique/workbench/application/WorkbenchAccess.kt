package com.sprintique.workbench.application

import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ProjectMembership
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition

/**
 * The checks every Workbench command repeats on the server, whatever the row's `allowedActions` said: a person (an
 * agent has no cross-project or personal rights), a live membership of the project, and the exact `(projectId,
 * taskId)` pair. A task of another project answers exactly like a task that does not exist.
 */
object WorkbenchAccess {
    fun requireHuman(actor: Actor) {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Рабочий стол доступен только людям.")
    }

    fun task(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        capability: Capability,
    ): ProjectMembership {
        requireHuman(actor)
        val membership = ProjectAccess.authorize(tx, actor, projectId, capability)
        requireTask(tx, projectId, taskId)
        return membership
    }

    fun requireTask(tx: Transaction, projectId: String, taskId: String) {
        val found = tx.row("SELECT 1 AS found FROM app.tasks WHERE project_id = $1 AND id = $2", projectId, taskId)
        requireCondition(found != null, 404, "NOT_FOUND", "Задача недоступна.")
    }

    /** The newest meaningful event position of a task; 0 before any. */
    fun latestSequence(tx: Transaction, projectId: String, taskId: String): Long =
        tx.row(
            """
            SELECT coalesce(max(sequence), 0) AS latest FROM app.task_activity WHERE project_id = $1 AND task_id = $2
            """.trimIndent(),
            projectId,
            taskId,
        )!!.long("latest")
}
