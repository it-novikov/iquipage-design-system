package com.sprintique.workspace.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.problem.requireCondition

/**
 * Who may own a task (SPR-7). A person who is a member of the project, or a service account of the project that may
 * change tasks there right now: it and its owner both hold «Менять задачи» (`tasks.write`) in the project, and it is
 * neither suspended nor deleted. That is how work is handed to an agent: it finds the tasks assigned to its account.
 *
 * An owner that can no longer act keeps its tasks until someone reassigns them; the task says why ([stateSql]).
 */
object Assignees {
    private const val REFUSED = "TASK_OWNER"
    private const val EDITS = "tasks.write"

    /**
     * The state of a task owner in its project, as SQL over an owner id and a project id: `active`, `suspended` (a
     * service account that cannot act here now: suspended, its owner gone or disabled, or its owner no longer a member
     * of the project), `deleted` (a deleted service account), `former` (no longer a member of the project), or null
     * without an owner.
     */
    fun stateSql(owner: String, project: String): String =
        """CASE WHEN $owner IS NULL THEN NULL
          WHEN EXISTS (SELECT 1 FROM auth.service_accounts sa WHERE sa.principal_id = $owner AND sa.deleted_at IS NOT NULL)
            THEN 'deleted'
          WHEN NOT EXISTS (SELECT 1 FROM app.project_members pm WHERE pm.project_id = $project AND pm.principal_id = $owner)
            THEN 'former'
          WHEN EXISTS (SELECT 1 FROM auth.service_accounts sa WHERE sa.principal_id = $owner
               AND (NOT auth.service_account_active($owner) OR NOT EXISTS (SELECT 1 FROM app.project_members om
                 WHERE om.project_id = $project AND om.principal_id = sa.owner_id))) THEN 'suspended'
          ELSE 'active' END"""

    /**
     * What follows a task owner's name, as SQL over the owner's principal row alias, owner id and project id: nothing
     * for a person, « (сервисный аккаунт)» for a service account, with why it cannot act when it cannot.
     */
    fun remarkSql(principal: String, owner: String, project: String): String =
        """CASE WHEN $principal.kind <> 'service' THEN '' ELSE CASE ${stateSql(owner, project)}
          WHEN 'suspended' THEN ' (сервисный аккаунт, приостановлен)' WHEN 'deleted' THEN ' (сервисный аккаунт, удалён)'
          WHEN 'former' THEN ' (сервисный аккаунт, не в проекте)' ELSE ' (сервисный аккаунт)' END END"""

    /**
     * Whether a service account member may own tasks of its project now, as SQL over its principal id and the
     * project id (see the class comment). False for everyone else.
     */
    fun serviceAssignableSql(principal: String, project: String): String =
        """EXISTS (SELECT 1 FROM auth.service_accounts sa
            JOIN app.project_members sm ON sm.project_id = $project AND sm.principal_id = sa.principal_id
            JOIN app.project_members om ON om.project_id = $project AND om.principal_id = sa.owner_id
            WHERE sa.principal_id = $principal AND '$EDITS' = ANY(sm.permissions) AND '$EDITS' = ANY(om.permissions)
              AND auth.service_account_active(sa.principal_id))"""

    /** A newly chosen owner must be able to see and act on the task; no owner (unassigning) is always allowed. */
    fun requireAssignable(tx: Transaction, projectId: String, ownerId: String?) {
        if (ownerId == null) return
        val candidate = tx.row(
            """
            SELECT p.kind, p.disabled_at IS NOT NULL AS disabled, m.role, s.deleted_at IS NOT NULL AS deleted,
                   s.workspace_id IS NOT DISTINCT FROM (SELECT pr.workspace_id FROM app.projects pr WHERE pr.id = $1) AS local,
                   CASE WHEN s.principal_id IS NULL THEN false ELSE auth.service_account_active(s.principal_id) END AS active,
                   coalesce('$EDITS' = ANY(m.permissions), false) AS edits,
                   coalesce((SELECT '$EDITS' = ANY(o.permissions) FROM app.project_members o
                     WHERE o.project_id = $1 AND o.principal_id = s.owner_id), false) AS "ownerEdits"
            FROM auth.principals p
            LEFT JOIN app.project_members m ON m.project_id = $1 AND m.principal_id = p.id
            LEFT JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE p.id = $2
            """.trimIndent(),
            projectId,
            ownerId,
        )
        // An account of another workspace reads as any stranger: its details are not this project's to tell.
        if (candidate?.string("kind") == "service" && candidate.boolean("local")) {
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
            account.boolean("edits") && account.boolean("ownerEdits"),
            422,
            REFUSED,
            "Сервисный аккаунт может быть исполнителем, только если он и его владелец могут редактировать задачи " +
                "в проекте.",
        )
    }
}
