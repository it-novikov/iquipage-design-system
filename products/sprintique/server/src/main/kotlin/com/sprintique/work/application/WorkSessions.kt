package com.sprintique.work.application

import com.sprintique.ai.application.AgentTools
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.work.application.ChangeWorkSessionRequest
import com.sprintique.work.application.CreateWorkRequestRequest
import com.sprintique.work.application.StartWorkSessionRequest
import com.sprintique.work.application.WorkHandoffRequest
import java.time.Instant
import java.util.UUID

fun TaskWork.start(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: StartWorkSessionRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project,
        task,
        input.baseRevision, "session.started", input, key, "Работа поручена агенту.",
        input.goal, Capability.TASKS_WRITE,
    ) {
            doc,
            _,
            id,
        ->
        person(actor)
        ProjectAccess.authorize(tx, actor, project, Capability.WORK_WRITE)
        account(tx, project, input.agentId)
        thread(tx, project, id, input.threadId)
        if (input.mode == "provider_api") {
            val permissions = tx.row(
                "SELECT permissions FROM app.project_members WHERE project_id=$1 AND principal_id=$2",
                project, input.agentId,
            )!!.strings("permissions")
            val supported = skillsFor(tx, project, input.agentId).flatMap { it.strings("requiredTools") }.all {
                AgentTools.OFFERED[it]?.wire in permissions
            }
            requireCondition(supported, 422, "WORK_SKILL_TOOL", "API агент не может выполнить назначенные навыки.")
        }
        val existing = tx.row(
            """
            SELECT s.id FROM app.task_work_session s LEFT JOIN app.ai_agent_runs r
              ON r.project_id=s.project_id AND r.id=s.ai_run_id
            WHERE s.project_id=$1 AND s.task_id=$2 AND s.agent_id=$3 AND s.mode=$4
              AND (s.state IN ('awaiting_agent','queued','running','waiting') OR r.state IN ('queued','running'))
        """,
            project, id, input.agentId, input.mode,
        )
        requireCondition(existing == null, 409, "WORK_SESSION_ACTIVE", "У агента уже есть активное поручение.")
        val run = if (input.mode == "provider_api") agents.start(tx, actor, project, id, input.agentId) else null
        if (run != null) {
            tx.update(
                "UPDATE app.ai_agent_runs SET thread_id=$3,revision=revision+1 WHERE project_id=$1 AND id=$2::uuid",
                project, run["id"], input.threadId,
            )
            tx.update(
                "UPDATE app.task_work_session SET goal=$3,thread_id=$4 WHERE project_id=$1 AND ai_run_id=$2::uuid",
                project, run["id"], input.goal, input.threadId,
            )
        } else {
            val session = UUID.randomUUID().toString()
            val snapshot = skillsFor(tx, project, input.agentId)
            tx.update(
                """
                    INSERT INTO
                    app.task_work_session(project_id,task_id,id,agent_id,requested_by,mode,state,goal,ai_run_id,thread_id,skill_snapshot)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11::jsonb)
                """,
                project, id, session, input.agentId, actor.id, input.mode,
                "awaiting_agent",
                input.goal, null, input.threadId, json.writeValueAsString(snapshot),
            )
        }
        doc.put("status", "active")
    }

fun TaskWork.sessionState(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    sessionId: String,
    input: ChangeWorkSessionRequest,
    key: String,
): Any =
    change(
        tx, actor, project, task, input.baseRevision, "session.changed:$sessionId", input, key,
        if (input.state ==
            "cancelled"
        ) {
            "Работа агента остановлена."
        } else {
            "Обновлено состояние работы агента."
        },
        input.summary,
        if (input.state == "cancelled" && actor.isHuman) Capability.TASKS_WRITE else Capability.WORK_WRITE,
    ) {
            _,
            _,
            id,
        ->
        val row = session(tx, project, id, sessionId)
        val active = row.string("state") in TaskWork.ACTIVE
        requireCondition(active, 409, "WORK_SESSION_FINISHED", "Работа уже завершена.")
        if (actor.isHuman) {
            person(actor)
            requireCondition(
                input.state == "cancelled",
                403, "WORK_SESSION_OWNER", "Только агент сообщает о выполнении работы.",
            )
        } else {
            requireCondition(
                row.string("agent_id") == actor.id,
                403, "WORK_SESSION_OWNER", "Это поручение другого агента.",
            )
        }
        if (!actor.isHuman || input.state != "cancelled") requester(tx, row, project)
        requireCondition(
            row.string("mode") == "external" ||
                input.state == "cancelled",
            409, "WORK_API_STATE", "Состояние API-запуска определяет исполнитель.",
        )
        row.stringOrNull("ai_run_id")?.let { agents.cancel(tx, actor, project, id, it) }
        tx.update(
            """
                UPDATE app.task_work_session SET state=$4,summary=$5,
            finished_at=CASE WHEN $4 IN ('completed','failed','cancelled') THEN clock_timestamp() ELSE NULL END
            WHERE project_id=$1 AND task_id=$2 AND id=$3
            """,
            project, id, sessionId, input.state, input.summary,
        )
        if (input.state in setOf("completed", "cancelled")) {
            tx.update(
                "UPDATE app.task_work_request SET state=$3 WHERE project_id=$1 AND session_id=$2 AND state='pending'",
                project, sessionId, if (input.state == "completed") "handled" else "cancelled",
            )
        }
        if (input.state !in
            TaskWork.ACTIVE
        ) {
            tx.update(
                """
UPDATE app.task_work_plan SET holder_id=NULL,lease_token=NULL,lease_until=NULL WHERE project_id=$1
AND task_id=$2 AND holder_id=$3
""",
                project, id, row.string("agent_id"),
            )
        }
    }

fun TaskWork.handoff(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: WorkHandoffRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project,
        task, input.baseRevision, "work.handed_off", input, key, "Работа передана следующему участнику.",
        input.summary,
    ) {
            doc,
            row,
            id,
        ->
        if (!actor.isHuman) {
            holder(row, actor, input.leaseToken)
        } else {
            person(actor)
            ProjectAccess.authorize(tx, actor, project, Capability.TASKS_WRITE)
        }
        val source = session(tx, project, id, input.sessionId)
        requireCondition(
            source.string("state") in TaskWork.ACTIVE,
            409, "WORK_SESSION_FINISHED", "Работа уже завершена.",
        )
        requireCondition(
            actor.isHuman ||
                source.string("agent_id") == actor.id,
            403, "WORK_SESSION_OWNER", "Передать можно своё поручение.",
        )
        if (!actor.isHuman) requester(tx, source, project)
        input.targetAgentId?.let { account(tx, project, it) }
        requireCondition(
            actor.isHuman ||
                input.targetAgentId == null,
            403, "HUMAN_REQUIRED", "Следующего агента выбирает человек.",
        )
        source.stringOrNull("ai_run_id")?.let {
            stopRun(tx, actor, project, id, source, it)
        }
        tx.update(
            """
UPDATE app.task_work_session SET state='handed_off',summary=$4,finished_at=clock_timestamp() WHERE
project_id=$1 AND task_id=$2 AND id=$3
""",
            project, id, input.sessionId, input.summary,
        )
        doc.set(
            "checkpoint",
            json.valueToTree(
                mapOf(
                    "summary" to input.summary, "nextStep" to input.nextStep,
                    "reason" to input.reason, "authorId" to actor.id, "at" to Instant.now().toString(),
                ),
            ),
        )
        doc.put("status", "waiting")
        tx.update(
            """
UPDATE app.task_work_plan SET holder_id=NULL,lease_token=NULL,lease_until=NULL WHERE project_id=$1
AND task_id=$2
""",
            project, id,
        )
        input.targetAgentId?.let { target ->
            val next = UUID.randomUUID().toString()
            tx.update(
                """
                    INSERT INTO
                    app.task_work_session(project_id,task_id,id,agent_id,requested_by,mode,state,goal,relayed_from,skill_snapshot)
                VALUES($1,$2,$3,$4,$5,'external','awaiting_agent',$6,$7,$8::jsonb)
                """,
                project,
                id,
                next,
                target, actor.id, input.nextStep.take(WorkLimits.SESSION_GOAL_LIMIT), input.sessionId,
                json.writeValueAsString(
                    skillsFor(
                        tx,
                        project, target,
                    ),
                ),
            )
        }
    }

fun TaskWork.request(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: CreateWorkRequestRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project,
        task,
        input.baseRevision,
        "request.created", input, key, "Агенту направлено обращение.", capability = Capability.TASKS_WRITE,
    ) {
            _,
            _,
            id,
        ->
        person(actor)
        account(tx, project, input.agentId)
        thread(tx, project, id, input.threadId)
        val message = tx.row(
            """
            SELECT id FROM app.messages WHERE project_id=$1 AND thread_id=$2 AND id=$3 AND author_id=$4
        """,
            project, input.threadId, input.messageId, actor.id,
        )
        requirePresent(message, 404, "NOT_FOUND", "Сообщение недоступно.")
        tx.update(
            """
                INSERT INTO app.task_work_request(project_id,task_id,id,agent_id,author_id,thread_id,message_id)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(project_id,message_id,agent_id) DO NOTHING
            """,
            project, id, input.id, input.agentId, actor.id, input.threadId, input.messageId,
        )
    }
