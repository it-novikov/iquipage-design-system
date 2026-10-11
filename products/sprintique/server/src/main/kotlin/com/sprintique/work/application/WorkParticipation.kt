package com.sprintique.work.application

import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import java.util.UUID

/** Preserve each human mention even when a queue decision joins an existing run. */
object WorkParticipation {
    fun mention(tx: Transaction, actor: Actor, project: String, message: String, account: String, run: String?) {
        val id = UUID.randomUUID().toString()
        tx.update(
            """INSERT INTO app.task_work_request(project_id,task_id,id,agent_id,author_id,thread_id,message_id,session_id)
                SELECT m.project_id,t.task_id,$4,$3,m.author_id,m.thread_id,m.id,
                  CASE WHEN r.source_message_id=m.id THEN s.id ELSE NULL END FROM app.messages m
                JOIN app.threads t ON t.project_id=m.project_id AND t.id=m.thread_id
                LEFT JOIN app.ai_agent_runs r ON r.project_id=m.project_id AND r.id=$5::uuid
                LEFT JOIN app.task_work_session s ON s.project_id=r.project_id AND s.ai_run_id=r.id
                WHERE m.project_id=$1 AND m.id=$2 AND m.author_id=$6
                ON CONFLICT(project_id,message_id,agent_id) DO NOTHING""",
            project, message, account, id, run, actor.id,
        )
    }
}
