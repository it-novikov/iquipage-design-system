package com.sprintique.work.application

import com.sprintique.ai.application.AgentTools
import com.sprintique.command.AuditTrail
import com.sprintique.configuration.Feature
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import com.sprintique.work.application.AssignWorkSkillsRequest
import com.sprintique.work.application.CreateWorkSkillRequest

fun TaskWork.skills(tx: Transaction, actor: Actor, project: String): Any {
    flags.require(Feature.AGENT_WORK)
    ProjectAccess.authorize(tx, actor, project, Capability.TASKS_READ)
    return mapOf(
        "items" to
            tx.rows(
                """
                SELECT id,name,version,digest,required_tools AS "requiredTools",author_id AS "authorId",created_at
                AS "createdAt" FROM app.agent_skill_version WHERE project_id=$1 ORDER BY name,version,id LIMIT 200
            """,
                project,
            ),
    )
}

fun TaskWork.skill(tx: Transaction, actor: Actor, project: String, id: String): Any {
    flags.require(Feature.AGENT_WORK)
    ProjectAccess.authorize(tx, actor, project, Capability.TASKS_READ)
    return requirePresent(
        tx.row(
            """
        SELECT id,name,version,digest,content,required_tools AS "requiredTools" FROM app.agent_skill_version
        WHERE project_id=$1 AND id=$2
    """,
            project, id,
        ),
        404, "NOT_FOUND", "Навык недоступен.",
    )
}

fun TaskWork.createSkill(
    tx: Transaction,
    actor: Actor,
    project: String,
    input: CreateWorkSkillRequest,
    key: String,
): Any {
    flags.require(Feature.AGENT_WORK)
    person(actor)
    ProjectAccess.authorize(tx, actor, project, Capability.AGENTS_MANAGE)
    safe(json.valueToTree(input))
    requireCondition(
        input.requiredTools.all { it in AgentTools.OFFERED || it in EXTERNAL_WORK_TOOLS },
        422, "WORK_SKILL_TOOL", "Навык требует неизвестный инструмент Sprintique.",
    )
    return ledger.idempotent(tx, actor, project, "work.skill.created", key, input) {
        ProjectAccess.projectWriteFence(tx, actor, project, Capability.AGENTS_MANAGE)
        requireCondition(input.baseRevision == 0L, 409, "CONFLICT", "Версия навыка неизменяема. Создайте новую.")
        val count = tx.row(
            """
            SELECT count(*)::int AS n FROM app.agent_skill_version WHERE project_id=$1
        """,
            project,
        )!!.int("n")
        requireCondition(count < WorkLimits.SKILL_LIMIT, 422, "WORK_SKILL_LIMIT", "Достигнут предел версий навыков.")
        tx.update(
            """
                INSERT INTO
                app.agent_skill_version(project_id,id,name,version,content,digest,required_tools,author_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            """,
            project,
            input.id, input.name, input.version, input.content, Tokens.sha256Hex(input.content),
            input.requiredTools, actor.id,
        )
        AuditTrail.record(tx, actor, project, "work.skill.created", input.id, 1)
        skill(tx, actor, project, input.id)
    }
}

fun TaskWork.assignSkills(
    tx: Transaction,
    actor: Actor,
    project: String,
    agentId: String,
    input: AssignWorkSkillsRequest,
    key: String,
): Any {
    flags.require(Feature.AGENT_WORK)
    person(actor)
    ProjectAccess.authorize(tx, actor, project, Capability.AGENTS_MANAGE)
    return ledger.idempotent(tx, actor, project, "work.skills.assigned:$agentId", key, input) {
        ProjectAccess.projectWriteFence(tx, actor, project, Capability.AGENTS_MANAGE)
        account(tx, project, agentId)
        unique(input.skillIds)
        input.skillIds.forEach { skill(tx, actor, project, it) }
        val current = tx.row(
            """
            SELECT revision FROM app.agent_work_profile WHERE project_id=$1 AND agent_id=$2 FOR UPDATE
        """,
            project, agentId,
        )
        requireCondition(
            (current?.long("revision") ?: 0L) == input.baseRevision,
            409, "CONFLICT", "Навыки агента уже изменены.",
        )
        tx.update(
            """
                INSERT INTO app.agent_work_profile(project_id,agent_id,skill_ids) VALUES($1,$2,$3)
            ON CONFLICT(project_id,agent_id) DO UPDATE SET
            skill_ids=excluded.skill_ids,revision=app.agent_work_profile.revision+1
            """,
            project, agentId, input.skillIds,
        )
        AuditTrail.record(tx, actor, project, "work.skills.assigned", agentId, input.baseRevision + 1)
        mapOf("revision" to input.baseRevision + 1, "skills" to skillsFor(tx, project, agentId))
    }
}

private val EXTERNAL_WORK_TOOLS = setOf(
    "list_projects", "list_inbox", "mark_inbox_read", "list_maps", "get_work_card", "put_work_card",
    "list_work_agents", "change_work_session",
)
