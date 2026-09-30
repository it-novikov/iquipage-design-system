package com.sprintique.planning.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.media.application.Assets
import com.sprintique.media.application.TaskMedia
import com.sprintique.planning.contract.PLANNING_POLICY
import com.sprintique.planning.contract.PlanningCommandContract
import com.sprintique.planning.domain.PlanChange
import com.sprintique.planning.domain.PlanResult
import com.sprintique.planning.domain.PlanningCommand
import com.sprintique.planning.domain.PlanningState
import com.sprintique.planning.domain.Release
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import com.sprintique.workspace.application.Membership
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Planning changes go through a preview: the server computes every effect, stores the plan with a one-use token, and
 * applies it only if recomputing gives exactly the same effects. Agents need a person's approval of the exact plan.
 */
@Component
@Profile("api")
class Planning(private val json: JsonMapper, private val ledger: CommandLedger) {
    /** Outstanding previews store a project-sized graph, so they are budgeted and expired ones are collected. */
    object PreviewBudget {
        const val ACTOR_PLANS = 20
        const val PROJECT_PLANS = 200
        const val ACTOR_BYTES = 16.0 * 1024 * 1024
        const val PROJECT_BYTES = 128.0 * 1024 * 1024
        const val RETENTION_MINUTES = 60
    }

    fun preview(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        contract: PlanningCommandContract,
    ): Map<String, Any?> {
        val revision = PlanningStates.lock(tx, actor, projectId, write = true).revision
        // Effects carry before/after projections of tasks the caller never supplied: a write-only grant must not turn
        // a preview into a project-wide read.
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val command = contract.toDomain()
        requireCommandPermission(tx, actor, projectId, command)
        budgetPreviews(tx, actor, projectId)
        requireCondition(
            command !is PlanningCommand.ReleaseCreate || command.projectId == projectId,
            422,
            "PROJECT_SCOPE",
            "Релиз другого проекта.",
        )
        val state = PlanningStates.load(tx, projectId)
        val result = PlanChange.plan(state, command)
        for (owner in assignedOwners(command, state)) Membership.requireAssignable(tx, projectId, owner)
        checkTags(tx, projectId, command)
        val id = UUID.randomUUID().toString()
        val token = Tokens.random()
        val expiresAt = Instant.now().plus(PREVIEW_MINUTES, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.MILLIS)
        val approvalId = if (actor.isHuman) null else UUID.randomUUID().toString()
        val commandNode = json.valueToTree<JsonNode>(contract)
        val effectsNode = json.valueToTree<JsonNode>(result)
        val actionHash = Tokens.sha256Hex(
            CommandLedger.canonical(
                json.valueToTree(
                    linkedMapOf(
                        "projectId" to projectId,
                        "actorId" to actor.id,
                        "credentialId" to actor.credentialId,
                        "initiatorId" to actor.initiatorId,
                        "revision" to revision,
                        "policy" to PLANNING_POLICY,
                        "command" to commandNode,
                        "effects" to effectsNode,
                    ),
                ),
            ),
        )
        val summary = linkedMapOf<String, Any?>(
            "id" to id,
            "expiresAt" to expiresAt,
            "actionHash" to actionHash,
            "policyVersion" to PLANNING_POLICY,
            "projectRevision" to revision,
            "affectedCount" to result.effects.size,
            "selectedCount" to result.selectedCount,
            "enteringBoard" to result.effects.count { it.before?.boardEligible != true && it.after.boardEligible },
            "leavingBoard" to result.effects.count { it.before?.boardEligible == true && !it.after.boardEligible },
            "requiresApproval" to (approvalId != null),
            "approvalId" to approvalId,
            "releases" to result.releases,
            "details" to result.details,
        )
        tx.update(
            """
            INSERT INTO app.planning_plans(project_id, id, actor_id, credential_id, initiator_id, token_hash, project_revision,
                                           policy_version, action_hash, command, effects, summary, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            """.trimIndent(),
            projectId, id, actor.id, actor.credentialId, actor.initiatorId, Tokens.sha256Hex(token), revision,
            PLANNING_POLICY, actionHash, commandNode, effectsNode, json.valueToTree<JsonNode>(summary), expiresAt,
        )
        if (approvalId != null) {
            tx.update(
                """
                INSERT INTO app.approvals(project_id, id, subject_kind, subject_id, action_hash, requested_by, initiator_id, expires_at)
                VALUES ($1, $2, 'planning', $3, $4, $5, $6, $7)
                """.trimIndent(),
                projectId, approvalId, id, actionHash, actor.id, actor.initiatorId, expiresAt,
            )
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                UUID.randomUUID().toString(),
                "approval.proposed",
                approvalId,
                1,
            )
        }
        val first = Pages.page(result.effects, id, revision, PAGE_SIZE, null)
        return LinkedHashMap(summary).apply {
            put("token", token)
            put("effects", first.items)
            put("nextCursor", first.nextCursor)
        }
    }

    fun previewEffects(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        limit: Int,
        cursor: String?,
    ): Page<JsonNode> {
        PlanningStates.lock(tx, actor, projectId)
        val stored = readPlan(tx, actor, projectId, id)
        requireCondition(stored.expiresAt.isAfter(Instant.now()), 409, "PLAN_EXPIRED", "Превью устарело.")
        return Pages.page(stored.effects.path("effects").values().toList(), id, stored.projectRevision, limit, cursor)
    }

    /** Applies a previewed plan once; a domain rejection is a durable result, a failure of the system is not. */
    fun commit(tx: Transaction, actor: Actor, projectId: String, planId: String, token: String, key: String): Any {
        val revision = PlanningStates.lock(tx, actor, projectId, write = true).revision
        val input = linkedMapOf("planId" to planId, "token" to token)
        return ledger.idempotent(tx, actor, projectId, "planning.commit", key, input) {
            val operationId = UUID.randomUUID().toString()
            tx.update("SAVEPOINT planning_apply")
            try {
                val result = apply(tx, actor, projectId, planId, token, revision, operationId)
                tx.update("RELEASE SAVEPOINT planning_apply")
                result
            } catch (error: ProblemException) {
                tx.update("ROLLBACK TO SAVEPOINT planning_apply")
                linkedMapOf(
                    "operationId" to operationId,
                    "status" to "rejected",
                    "error" to
                        linkedMapOf("code" to error.code, "message" to error.message, "action" to "refresh-preview"),
                )
            } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
                tx.update("ROLLBACK TO SAVEPOINT planning_apply")
                throw error
            }
        }
    }

    @Suppress("LongParameterList")
    private fun apply(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        planId: String,
        token: String,
        revision: Long,
        operationId: String,
    ): Any {
        val stored = readPlan(tx, actor, projectId, planId)
        val contract = json.treeToValue(stored.command, PlanningCommandContract::class.java)
        val command = contract.toDomain()
        requireCommandPermission(tx, actor, projectId, command)
        requireCondition(
            stored.credentialId == actor.credentialId && stored.initiatorId == actor.initiatorId &&
                Tokens.equalsInConstantTime(stored.tokenHash, Tokens.sha256Hex(token)),
            403,
            "PLAN_FORBIDDEN",
            "План недоступен для применения.",
        )
        val applied = tx.row(
            "SELECT result FROM app.planning_applied WHERE project_id = $1 AND plan_id = $2",
            projectId,
            stored.id,
        )
        if (applied != null) return applied.json("result")!!
        // A run's stop, expiry or superseded proposal also fences the generic commit endpoint.
        val run = tx.row(
            """
            SELECT r.completed_at IS NULL AND r.expires_at > clock_timestamp() AND r.latest_plan_id = $2 AND r.credential_id = $3 AS active
            FROM app.agent_run_plans p JOIN app.agent_runs r ON r.project_id = p.project_id AND r.id = p.run_id
            WHERE p.project_id = $1 AND p.plan_id = $2
            """.trimIndent(),
            projectId,
            stored.id,
            actor.credentialId,
        )
        requireCondition(
            run == null || run.boolean("active"),
            409,
            "RUN_INACTIVE",
            "Запуск остановлен или предложение заменено.",
        )
        requireCondition(stored.expiresAt.isAfter(Instant.now()), 409, "PLAN_EXPIRED", "Срок подтверждения истёк.")
        requireCondition(
            stored.projectRevision == revision && stored.policyVersion == PLANNING_POLICY,
            409,
            "PLAN_STALE",
            "Условия изменились. Просмотрите новый план.",
        )
        if (!actor.isHuman) requireApproval(tx, actor, projectId, stored)
        // Recompute rather than trusting stored inputs; the server-issued creation time is sealed in the preview.
        var state = PlanningStates.load(tx, projectId)
        val createdAt = stored.effects.path("createdTask").path("createdAt")
        if (createdAt.isString && state.creation != null) {
            state = state.copy(creation = state.creation.copy(createdAt = createdAt.asString()))
        }
        val current = PlanChange.plan(state, command)
        requireCondition(
            CommandLedger.canonical(json.valueToTree(current)) == CommandLedger.canonical(stored.effects),
            409,
            "PLAN_STALE",
            "Последствия изменились. Просмотрите новый план.",
        )
        PlanApplication.apply(tx, actor, projectId, operationId, current, json)
        val final = tx.row("SELECT planning_revision AS revision FROM app.projects WHERE id = $1", projectId)!!
        val receipt = linkedMapOf(
            "operationId" to operationId,
            "status" to "committed",
            "projectRevision" to final.long("revision"),
            "affectedCount" to current.effects.size,
            "releaseIds" to current.releases.map(Release::id),
        )
        tx.update(
            "INSERT INTO app.planning_applied(project_id, plan_id, result) VALUES ($1, $2, $3)",
            projectId,
            stored.id,
            json.valueToTree<JsonNode>(receipt),
        )
        return receipt
    }

    /**
     * Planning settings need «Настраивать проект»; the life of a release (create, edit, start, close, cancel, shift,
     * milestones) needs «Управлять релизами и спринтами» from a person. An agent's release commands still need an
     * approval by a person who may decide on them, as before.
     */
    private fun requireCommandPermission(tx: Transaction, actor: Actor, projectId: String, command: PlanningCommand) {
        when (command) {
            is PlanningCommand.Settings -> ProjectAccess.authorize(tx, actor, projectId, Capability.PROJECT_SETTINGS)

            is PlanningCommand.Start, is PlanningCommand.ReleaseEdit, is PlanningCommand.ReleaseCreate,
            is PlanningCommand.Close, is PlanningCommand.Cancel, is PlanningCommand.Shift,
            is PlanningCommand.MilestoneChange,
            -> if (actor.isHuman) ProjectAccess.authorize(tx, actor, projectId, Capability.RELEASES_MANAGE)

            // New dates of a release or a milestone are part of its life too; a task's dates are not.
            is PlanningCommand.Schedule ->
                if (actor.isHuman && command.entity.kind != "task") {
                    ProjectAccess.authorize(tx, actor, projectId, Capability.RELEASES_MANAGE)
                }

            is PlanningCommand.ScheduleBatch ->
                if (actor.isHuman &&
                    command.actions.any { it is PlanningCommand.Schedule && it.entity.kind != "task" }
                ) {
                    ProjectAccess.authorize(tx, actor, projectId, Capability.RELEASES_MANAGE)
                }

            else -> Unit
        }
    }

    private fun requireApproval(tx: Transaction, actor: Actor, projectId: String, stored: StoredPlan) {
        val approval = tx.row(
            """
            SELECT decided_by AS "decidedBy" FROM app.approvals WHERE project_id = $1 AND subject_kind = 'planning'
              AND subject_id = $2 AND action_hash = $3 AND requested_by = $4 AND status = 'approved' AND expires_at > clock_timestamp()
            """.trimIndent(),
            projectId,
            stored.id,
            stored.actionHash,
            actor.id,
        )
        val decided = requirePresent(approval, 403, "APPROVAL_REQUIRED", "Нужно решение человека по этому плану.")
        val approver = tx.row(
            """
            SELECT 1 AS found FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE project_id = $1 AND principal_id = $2 AND 'approvals.decide' = ANY(m.permissions) AND p.kind = 'human' AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
            decided.string("decidedBy"),
        )
        requireCondition(approver != null, 403, "APPROVAL_REVOKED", "Полномочия подтвердившего участника изменились.")
    }

    /** The stored outcome of a commit, for a caller that lost the response. */
    fun receipt(tx: Transaction, actor: Actor, projectId: String, key: String): JsonNode {
        PlanningStates.lock(tx, actor, projectId)
        val row = tx.row(
            """
            SELECT result FROM app.idempotency
            WHERE project_id = $1 AND actor_id = $2 AND operation = $3 AND key = $4
            """.trimIndent(),
            projectId,
            actor.id,
            "planning.commit",
            key,
        )
        val found = requirePresent(
            row,
            404,
            "RECEIPT_NOT_FOUND",
            "Подтверждённого результата пока нет. Повторите тот же запрос с тем же ключом.",
        )
        return found.json("result")!!
    }

    internal data class StoredPlan(
        val id: String,
        val credentialId: String,
        val initiatorId: String,
        val tokenHash: String,
        val projectRevision: Long,
        val policyVersion: String,
        val actionHash: String,
        val command: JsonNode,
        val effects: JsonNode,
        val expiresAt: Instant,
    )

    internal fun readPlan(tx: Transaction, actor: Actor, projectId: String, id: String): StoredPlan {
        val row = tx.row(
            """
            SELECT id, credential_id, initiator_id, token_hash, project_revision, policy_version, action_hash, command, effects, expires_at
            FROM app.planning_plans WHERE project_id = $1 AND id = $2 AND actor_id = $3
            """.trimIndent(),
            projectId,
            id,
            actor.id,
        )
        val plan = requirePresent(row, 404, "PLAN_NOT_FOUND", "План недоступен.")
        return StoredPlan(
            id = plan.string("id"),
            credentialId = plan.string("credential_id"),
            initiatorId = plan.string("initiator_id"),
            tokenHash = plan.string("token_hash"),
            projectRevision = plan.long("project_revision"),
            policyVersion = plan.string("policy_version"),
            actionHash = plan.string("action_hash"),
            command = plan.json("command")!!,
            effects = plan.json("effects")!!,
            expiresAt = plan.instant("expires_at"),
        )
    }

    /**
     * Collects previews that can never be applied any more, in a bounded batch, then enforces the budget. Applied and
     * run-linked plans are evidence and are neither collected nor counted.
     */
    private fun budgetPreviews(tx: Transaction, actor: Actor, projectId: String) {
        tx.update(
            """
            DELETE FROM app.planning_plans WHERE (project_id, id) IN (
              SELECT p.project_id, p.id FROM app.planning_plans p
              WHERE p.project_id = $1 AND p.expires_at < clock_timestamp() - make_interval(mins => $2::int)
                AND NOT EXISTS (SELECT 1 FROM app.planning_applied a WHERE a.project_id = p.project_id AND a.plan_id = p.id)
                AND NOT EXISTS (SELECT 1 FROM app.agent_run_plans r WHERE r.project_id = p.project_id AND r.plan_id = p.id)
              LIMIT 200)
            """.trimIndent(),
            projectId,
            PreviewBudget.RETENTION_MINUTES,
        )
        val usage = tx.row(
            """
            SELECT count(*) FILTER (WHERE actor_id = $2)::int AS "actorPlans", count(*)::int AS "projectPlans",
                   coalesce(sum(pg_column_size(command) + pg_column_size(effects) + pg_column_size(summary))
                     FILTER (WHERE actor_id = $2), 0)::float8 AS "actorBytes",
                   coalesce(sum(pg_column_size(command) + pg_column_size(effects) + pg_column_size(summary)), 0)::float8 AS "projectBytes"
            FROM app.planning_plans p WHERE p.project_id = $1
              AND NOT EXISTS (SELECT 1 FROM app.planning_applied a WHERE a.project_id = p.project_id AND a.plan_id = p.id)
            """.trimIndent(),
            projectId,
            actor.id,
        )!!
        requireCondition(
            usage.int("actorPlans") < PreviewBudget.ACTOR_PLANS &&
                usage.double("actorBytes") < PreviewBudget.ACTOR_BYTES,
            429,
            "PREVIEW_QUOTA",
            "Слишком много неприменённых предпросмотров. Примените или дождитесь истечения прежних.",
        )
        requireCondition(
            usage.int("projectPlans") < PreviewBudget.PROJECT_PLANS &&
                usage.double("projectBytes") < PreviewBudget.PROJECT_BYTES,
            429,
            "PREVIEW_QUOTA",
            "В проекте слишком много неприменённых предпросмотров.",
        )
    }

    /** Owners a command newly assigns; an unchanged owner of an edited task is not checked again. */
    private fun assignedOwners(command: PlanningCommand, state: PlanningState): List<String> = when (command) {
        is PlanningCommand.Bulk -> listOfNotNull(
            (command.fields.ownerId as? com.sprintique.planning.domain.Maybe.Given)?.value,
        )

        is PlanningCommand.TaskCreate -> listOfNotNull(command.task.ownerId)

        is PlanningCommand.TaskEdit -> {
            val current = state.tasks.firstOrNull { it.id == command.taskId }
            listOfNotNull(command.task.ownerId?.takeIf { it != current?.ownerId })
        }

        else -> emptyList()
    }

    private fun checkTags(tx: Transaction, projectId: String, command: PlanningCommand) {
        val (taskId, tagIds) = when (command) {
            is PlanningCommand.TaskEdit -> command.taskId to command.task.tagIds
            is PlanningCommand.TaskCreate -> command.taskId to command.task.tagIds
            else -> null to emptyList()
        }
        if (taskId != null && tagIds.isNotEmpty()) {
            val tags = tx.rows(
                """
                SELECT id FROM app.tags WHERE project_id = $1 AND id = ANY($2)
                AND (archived_at IS NULL OR id IN (SELECT tag_id FROM app.task_tags WHERE project_id = $1 AND task_id = $3))
                """.trimIndent(),
                projectId,
                tagIds,
                taskId,
            )
            requireCondition(tags.size == tagIds.size, 422, "TASK_TAG", "Тег недоступен в проекте.")
        }
        val added = (command as? PlanningCommand.Bulk)?.fields?.addTagIds
        if (!added.isNullOrEmpty()) {
            val tags = tx.rows(
                "SELECT id FROM app.tags WHERE project_id = $1 AND id = ANY($2) AND archived_at IS NULL",
                projectId,
                added,
            )
            requireCondition(tags.size == added.toSet().size, 422, "TASK_TAG", "Тег недоступен.")
        }
    }

    companion object {
        const val PAGE_SIZE = 100
        private const val PREVIEW_MINUTES = 10L
    }
}

/** Writes a recomputed plan: releases, a new task, task rows, tags, content, calendar, settings, history and events. */
internal object PlanApplication {
    fun apply(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operationId: String,
        result: PlanResult,
        json: JsonMapper,
    ) {
        for (release in result.releases) Releases.save(tx, projectId, release)
        saveTasks(tx, actor, projectId, result, json)
        saveCalendar(tx, actor, projectId, operationId, result)
        saveSettingsAndHistory(tx, actor, projectId, operationId, result, json)
        for (effect in result.effects) {
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                operationId,
                "task.plan.changed",
                effect.id,
                effect.after.revision.toLong(),
            )
        }
        for (release in result.releases) {
            val action = if (result.history?.releaseId ==
                release.id
            ) {
                "release.${result.history.kind}"
            } else {
                "release.scope.changed"
            }
            AuditTrail.recordOperation(tx, actor, projectId, operationId, action, release.id, release.revision.toLong())
        }
    }

    private fun saveTasks(tx: Transaction, actor: Actor, projectId: String, result: PlanResult, json: JsonMapper) {
        result.createdTask?.let { created ->
            val value = result.taskContent!!.value
            val next = tx.update(
                """
                UPDATE app.projects SET next_task_number = next_task_number + 1
                WHERE id = $1 AND next_task_number = $2
                """.trimIndent(),
                projectId,
                created.number,
            )
            requireCondition(next == 1, 409, "PLAN_STALE", "Номер задачи изменился.")
            tx.update(
                """
                INSERT INTO app.tasks(project_id, id, number, title, description, status, type, priority, owner_id, rank, revision,
                                      created_at, status_entered_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11)
                """.trimIndent(),
                projectId, created.id, created.number, value.title, value.description, value.status, value.type,
                value.priority, value.ownerId, value.rank, created.createdAt,
            )
        }
        if (result.tasks.isNotEmpty()) {
            tx.update(
                """
                UPDATE app.tasks t SET revision = n.revision, parent_id = n."parentId", release_id = n."releaseId",
                  assignment_mode = n."assignmentMode",
                  preparation = n.preparation,
                  result = n.result,
                  admitted = n.admitted,
                  owner_label = CASE WHEN t.owner_id IS DISTINCT FROM n."ownerId" THEN '' ELSE t.owner_label END,
                  owner_id = n."ownerId", priority = n.priority, rank = n.rank, planned_start = n."plannedStart"::date,
                  planned_end = n."plannedEnd"::date, due = n.due::date, updated_at = clock_timestamp()
                FROM jsonb_to_recordset($2::jsonb) AS n(id text, revision integer, "parentId" text, "releaseId" text,
                  "assignmentMode" text, preparation text, result text, admitted boolean, "ownerId" text, priority text,
                  rank double precision, "plannedStart" text, "plannedEnd" text, due text)
                WHERE t.project_id = $1 AND t.id = n.id
                """.trimIndent(),
                projectId,
                json.valueToTree<JsonNode>(result.tasks),
            )
        }
        for (effect in result.effects) {
            if (effect.before?.tagIds == effect.after.tagIds) continue
            tx.update("DELETE FROM app.task_tags WHERE project_id = $1 AND task_id = $2", projectId, effect.id)
            for (tagId in effect.after.tagIds) {
                tx.update(
                    "INSERT INTO app.task_tags(project_id, task_id, tag_id) VALUES ($1, $2, $3)",
                    projectId,
                    effect.id,
                    tagId,
                )
            }
        }
        result.taskContent?.let { (id, value) ->
            Assets.linkTaskAssets(
                tx,
                actor,
                projectId,
                id,
                TaskMedia(value.attachmentIds, value.coverAttachmentId, value.coverCrop, value.coverCropAttachmentId),
            )
            tx.update(
                """
                UPDATE app.tasks SET title = $3, description = $4, type = $5, rank = $6,
                  status_entered_at = CASE WHEN status = $7 THEN status_entered_at ELSE clock_timestamp() END, status = $7
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId, id, value.title, value.description, value.type, value.rank, value.status,
            )
        }
    }

    private fun saveCalendar(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operationId: String,
        result: PlanResult,
    ) {
        for (milestone in result.milestones) {
            Calendar.saveMilestone(tx, projectId, milestone)
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                operationId,
                "milestone.changed",
                milestone.id,
                milestone.revision.toLong(),
            )
        }
        for (id in result.removedConstraints) {
            tx.update("DELETE FROM app.temporal_constraints WHERE project_id = $1 AND id = $2", projectId, id)
            AuditTrail.recordOperation(tx, actor, projectId, operationId, "temporal.constraint.removed", id, 0)
        }
        for (constraint in result.constraints) {
            Calendar.saveConstraint(tx, projectId, constraint)
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                operationId,
                "temporal.constraint.changed",
                constraint.id,
                constraint.revision.toLong(),
            )
        }
    }

    @Suppress("LongParameterList")
    private fun saveSettingsAndHistory(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operationId: String,
        result: PlanResult,
        json: JsonMapper,
    ) {
        result.defaults?.let { defaults ->
            // An inherited time zone is stored as NULL, so the project follows later workspace changes.
            tx.update(
                """
                UPDATE app.projects SET planning_defaults = $2, timezone = $3, planning_revision = planning_revision + 1
                WHERE id = $1
                """.trimIndent(),
                projectId,
                linkedMapOf("format" to defaults.format, "days" to defaults.days),
                if (defaults.timezoneInherited == true) null else defaults.timezone,
            )
            AuditTrail.recordOperation(tx, actor, projectId, operationId, "planning.settings.changed", projectId, 0)
        }
        result.history?.let { history ->
            tx.update(
                """
                INSERT INTO app.release_snapshots(project_id, id, release_id, kind, operation_id, items)
                VALUES ($1, $2, $3, $4, $5, $6)
                """.trimIndent(),
                projectId,
                UUID.randomUUID().toString(),
                history.releaseId,
                history.kind,
                operationId,
                json.valueToTree<JsonNode>(history.items),
            )
        }
    }
}
