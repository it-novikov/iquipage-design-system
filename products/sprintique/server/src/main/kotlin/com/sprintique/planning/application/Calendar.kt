package com.sprintique.planning.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.planning.domain.Milestone
import com.sprintique.planning.domain.MilestoneData
import com.sprintique.planning.domain.TemporalConstraint
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.planning.domain.TemporalValue
import com.sprintique.problem.requireCondition
import java.util.UUID

/** Milestones and date constraints written directly by people. */
object Calendar {
    fun saveMilestone(tx: Transaction, projectId: String, milestone: Milestone) {
        tx.update(
            """
            INSERT INTO app.milestones(project_id, id, title, date, revision, release_id) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(project_id, id) DO UPDATE SET title = $3, date = $4, revision = $5, release_id = $6
            """.trimIndent(),
            projectId, milestone.id, milestone.title, milestone.date, milestone.revision, milestone.releaseId,
        )
    }

    fun saveConstraint(tx: Transaction, projectId: String, constraint: TemporalConstraint) {
        tx.update(
            """
            INSERT INTO app.temporal_constraints(project_id, id, source_kind, source_id, target_kind, target_id, relation, lag_days, revision)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT(project_id, id) DO UPDATE SET source_kind = $3, source_id = $4, target_kind = $5, target_id = $6,
              relation = $7, lag_days = $8, revision = $9
            """.trimIndent(),
            projectId, constraint.id, constraint.source.kind, constraint.source.id, constraint.target.kind,
            constraint.target.id, constraint.relation, constraint.lagDays, constraint.revision,
        )
    }

    @Suppress("LongParameterList")
    fun writeMilestone(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        value: MilestoneData,
        request: Any,
        key: String,
        ledger: CommandLedger,
    ): Any {
        requireHumanWriter(tx, actor, projectId)
        return ledger.idempotent(tx, actor, projectId, "milestone:$id", key, request) {
            val state = PlanningStates.load(tx, projectId)
            val previous = state.milestones.firstOrNull { it.id == id }
            requireCondition((previous?.revision ?: 0).toLong() == baseRevision, 409, "CONFLICT", "Веха изменена.")
            for (releaseId in listOfNotNull(previous?.releaseId, value.releaseId)) {
                val release = state.releases.firstOrNull { it.id == releaseId }
                requireCondition(
                    release != null && release.lifecycle != "closed" && release.lifecycle != "cancelled" &&
                        release.archivedAt == null,
                    409,
                    "RELEASE_IMMUTABLE",
                    "Релиз завершён или недоступен.",
                )
            }
            val milestone = Milestone(id, value.title, value.date, baseRevision.toInt() + 1, value.releaseId)
            TemporalRules.validate(state.copy(milestones = state.milestones.filter { it.id != id } + milestone))
            saveMilestone(tx, projectId, milestone)
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                UUID.randomUUID().toString(),
                "milestone.changed",
                id,
                milestone.revision.toLong(),
            )
            milestone
        }
    }

    @Suppress("LongParameterList")
    fun writeConstraint(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        value: TemporalValue,
        request: Any,
        key: String,
        ledger: CommandLedger,
    ): Any {
        requireHumanWriter(tx, actor, projectId)
        return ledger.idempotent(tx, actor, projectId, "constraint:$id", key, request) {
            val state = PlanningStates.load(tx, projectId)
            val previous = state.constraints.firstOrNull { it.id == id }
            requireCondition(
                (previous?.revision ?: 0).toLong() == baseRevision,
                409,
                "CONFLICT",
                "Зависимость изменена.",
            )
            val constraint =
                TemporalConstraint(
                    id,
                    baseRevision.toInt() + 1,
                    value.source,
                    value.target,
                    value.relation,
                    value.lagDays,
                )
            TemporalRules.validate(state.copy(constraints = state.constraints.filter { it.id != id } + constraint))
            saveConstraint(tx, projectId, constraint)
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                UUID.randomUUID().toString(),
                "temporal.constraint.changed",
                id,
                constraint.revision.toLong(),
            )
            constraint
        }
    }

    private fun requireHumanWriter(tx: Transaction, actor: Actor, projectId: String) {
        PlanningStates.lock(tx, actor, projectId, write = true)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Изменения календаря сейчас доступны человеку.")
    }
}
