package com.sprintique.workspace.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.problem.requireCondition

/**
 * Who may own a task (SPR-7). A person who is a member of the project, or a service account of the project that may
 * change tasks there right now: an editor whose owner is an editor or an administrator of the project too, neither
 * suspended nor deleted. That is how work is handed to an agent: it finds the tasks assigned to its account.
 *
 * An owner that can no longer act keeps its tasks until someone reassigns them; the task says why ([stateSql]).
 */
object Assignees {
    private const val REFUSED = "TASK_OWNER"
    private val EDITING = setOf("editor", "admin")

    /**
     * The state of a task owner in its project, as SQL over an owner id and a project id: `active`, `suspended` (a
     * service account that cannot act now: suspended, or its owner gone or disabled), `deleted` (a deleted service
     * account), `former` (no longer a member of the project), or null without an owner.
     */
    fun stateSql(owner: String, project: String): String =
        """CASE WHEN $owner IS NULL THEN NULL
          WHEN EXISTS (SELECT 1 FROM auth.service_accounts sa WHERE sa.principal_id = $owner AND sa.deleted_at IS NOT NULL)
            THEN 'deleted'
          WHEN NOT EXISTS (SELECT 1 FROM app.project_members pm WHERE pm.project_id = $project AND pm.principal_id = $owner)
            THEN 'former'
          WHEN EXISTS (SELECT 1 FROM auth.service_accounts sa WHERE sa.principal_id = $owner)
               AND NOT auth.service_account_active($owner) THEN 'suspended'
          ELSE 'active' END"""

    /**
     * Whether a service account member may own tasks of its project now, as SQL over its principal id and the
     * project id (see the class comment). False for everyone else.
     */
    fun serviceAssignableSql(principal: String, project: String): String =
        """EXISTS (SELECT 1 FROM auth.service_accounts sa
            JOIN app.project_members sm ON sm.project_id = $project AND sm.principal_id = sa.principal_id
            JOIN app.project_members om ON om.project_id = $project AND om.principal_id = sa.owner_id
            WHERE sa.principal_id = $principal AND sm.role IN ('editor', 'admin') AND om.role IN ('editor', 'admin')
              AND auth.service_account_active(sa.principal_id))"""

    /** A newly chosen owner must be able to see and act on the task; no owner (unassigning) is always allowed. */
    fun requireAssignable(tx: Transaction, projectId: String, ownerId: String?) {
        if (ownerId == null) return
        val candidate = tx.row(
            """
            SELECT p.kind, p.disabled_at IS NOT NULL AS disabled, m.role, s.deleted_at IS NOT NULL AS deleted,
                   CASE WHEN s.principal_id IS NULL THEN false ELSE auth.service_account_active(s.principal_id) END AS active,
                   (SELECT o.role FROM app.project_members o WHERE o.project_id = $1 AND o.principal_id = s.owner_id)
                     AS "ownerRole"
            FROM auth.principals p
            LEFT JOIN app.project_members m ON m.project_id = $1 AND m.principal_id = p.id
            LEFT JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE p.id = $2
            """.trimIndent(),
            projectId,
            ownerId,
        )
        if (candidate?.string("kind") == "service") {
            requireService(candidate)
        } else {
            requireCondition(
                candidate?.string("kind") == "human" && !candidate.boolean("disabled") && candidate["role"] != null,
                422,
                REFUSED,
                "Исполнителем может быть только участник проекта.",
            )
        }
    }

    private fun requireService(account: Row) {
        requireCondition(
            !account.boolean("deleted"),
            422,
            REFUSED,
            "Сервисный аккаунт удалён: его нельзя назначить исполнителем.",
        )
        requireCondition(
            account["role"] != null,
            422,
            REFUSED,
            "Сервисный аккаунт не участвует в этом проекте: сначала добавьте его в проект.",
        )
        requireCondition(
            account.boolean("active") && !account.boolean("disabled"),
            422,
            REFUSED,
            "Сервисный аккаунт приостановлен: его нельзя назначить исполнителем.",
        )
        requireCondition(
            account.stringOrNull("role") in EDITING && account.stringOrNull("ownerRole") in EDITING,
            422,
            REFUSED,
            "Сервисный аккаунт может быть исполнителем, только если он и его владелец могут редактировать задачи " +
                "в проекте.",
        )
    }
}
