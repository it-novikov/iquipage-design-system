package com.sprintique.ai.application

import com.sprintique.access.domain.Permission
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.notification.domain.MentionCandidate
import com.sprintique.notification.domain.Mentions

/**
 * A mention of a service account in a task discussion starts its agent (docs/decisions/0005-ai-agents.md): the
 * account is found as for people (the @ list's token or `@Помощник` typed in full), in the transaction of the message.
 * Starting an agent is the right of those who may change tasks, as with «Запустить агента» and an assignment, so a
 * mention by someone who may only comment starts nothing. The database checks the message, its author, the agent and
 * its limits (app.ai_run_mention), and an agent's own messages start no run.
 */
object AgentMentions {
    fun start(tx: Transaction, actor: Actor, projectId: String, messageId: String, body: String) {
        if ('@' !in body) return
        val permissions = ProjectAccess.membership(tx, actor, projectId)?.permissions.orEmpty()
        if (Permission.TASKS_WRITE !in permissions) return
        val accounts = tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND p.kind = 'service' AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
        ).map { MentionCandidate(it.string("id"), it.string("name"), service = true) }
        for (account in Mentions.find(body, accounts) - actor.id) {
            tx.rows("SELECT run_id FROM app.ai_run_mention($1, $2, $3)", projectId, messageId, account)
        }
    }
}
