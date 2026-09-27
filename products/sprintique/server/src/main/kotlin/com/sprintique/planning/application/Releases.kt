package com.sprintique.planning.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.planning.domain.Release
import com.sprintique.planning.domain.ReleaseData
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.requireCondition
import java.util.UUID

/** Releases outside previews: the plain editor of a planned release, the release list and storage. */
object Releases {
    fun save(tx: Transaction, projectId: String, release: Release) {
        val finished = release.lifecycle == "closed" || release.lifecycle == "cancelled"
        tx.update(
            """
            INSERT INTO app.releases(project_id, id, name, status, target_date, revision, archived_at, lifecycle, format,
                                     planned_start, planned_end, deadline, scope_revision)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $5, $12)
            ON CONFLICT(project_id, id) DO UPDATE SET name = $3, status = $4, target_date = $5, revision = $6, archived_at = $7,
              lifecycle = $8, format = $9, planned_start = $10, planned_end = $11, deadline = $5, scope_revision = $12
            """.trimIndent(),
            projectId,
            release.id,
            release.name,
            if (finished) "released" else "planned",
            release.deadline,
            release.revision,
            release.archivedAt,
            release.lifecycle,
            release.format,
            release.plannedStart,
            release.plannedEnd,
            release.scopeRevision,
        )
    }

    /** A planned release edited directly; an active or finished one changes only through a preview. */
    @Suppress("LongParameterList")
    fun write(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        value: ReleaseData,
        request: Any,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        requireCondition(actor.isHuman, 403, "APPROVAL_REQUIRED", "Агент должен предложить изменение для проверки.")
        return ledger.idempotent(tx, actor, projectId, "planning.release:$id", key, request) {
            val state = PlanningStates.load(tx, projectId)
            val previous = state.releases.firstOrNull { it.id == id }
            requireCondition((previous?.revision ?: 0).toLong() == baseRevision, 409, "CONFLICT", "Релиз уже изменён.")
            if (previous != null && previous.lifecycle != "planned") {
                throw TemporalRules.previewRequired(
                    "Активный состав и завершённый релиз нельзя менять через обычный редактор.",
                )
            }
            val release = Release(
                id = id,
                projectId = projectId,
                name = value.name,
                revision = baseRevision.toInt() + 1,
                scopeRevision = previous?.scopeRevision ?: 0.0,
                lifecycle = "planned",
                format = value.format,
                plannedStart = value.plannedStart,
                plannedEnd = value.plannedEnd,
                deadline = value.deadline,
                archivedAt = null,
            )
            TemporalRules.validate(state.copy(releases = state.releases.filter { it.id != id } + release))
            save(tx, projectId, release)
            AuditTrail.recordOperation(
                tx,
                actor,
                projectId,
                UUID.randomUUID().toString(),
                if (previous != null) "release.updated" else "release.created",
                id,
                release.revision.toLong(),
            )
            release
        }
    }

    /** Releases with their task counts: all, ready, accepted and on the board. */
    fun list(tx: Transaction, actor: Actor, projectId: String, limit: Int, cursor: String?): Map<String, Any?> {
        val lock = PlanningStates.lock(tx, actor, projectId)
        val state = PlanningStates.load(tx, projectId)
        val counts = HashMap<String, MutableMap<String, Int>>()
        for (row in PlanningRows.project(state)) {
            val releaseId = row.effectiveReleaseId ?: continue
            val count = counts.getOrPut(releaseId) {
                linkedMapOf(
                    "total" to 0, "ready" to 0, "accepted" to 0,
                    "onBoard" to 0,
                )
            }
            count.merge("total", 1, Int::plus)
            if (row.preparation == "ready") count.merge("ready", 1, Int::plus)
            if (row.result == "accepted") count.merge("accepted", 1, Int::plus)
            if (row.boardEligible) count.merge("onBoard", 1, Int::plus)
        }
        val releases = state.releases.map { release ->
            PlanningJson.release(release) +
                (
                    "counts" to
                        (counts[release.id] ?: linkedMapOf("total" to 0, "ready" to 0, "accepted" to 0, "onBoard" to 0))
                    )
        }
        return PlanningJson.page(Pages.page(releases, "$projectId:releases", lock.revision, limit, cursor)) +
            ("timezone" to lock.timezone)
    }
}
