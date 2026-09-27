package com.sprintique.planning.application

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Contracts
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.ViewText.BACKLOG
import com.sprintique.planning.application.ViewText.PRIORITIES
import com.sprintique.planning.application.ViewText.PRIORITY_LABELS
import com.sprintique.planning.application.ViewText.STATUS_LABELS
import com.sprintique.planning.application.ViewText.dateLabel
import com.sprintique.planning.application.ViewText.day
import com.sprintique.planning.application.ViewText.finished
import com.sprintique.planning.application.ViewText.isDone
import com.sprintique.planning.application.ViewText.memberNames
import com.sprintique.planning.application.ViewText.ownerLabel
import com.sprintique.planning.contract.CalendarIntent
import com.sprintique.planning.contract.PlanningCommandContract
import com.sprintique.planning.contract.SelectionContract
import com.sprintique.planning.contract.ViewFiltering
import com.sprintique.planning.contract.ViewIntent
import com.sprintique.planning.contract.ViewOptionsQuery
import com.sprintique.planning.contract.ViewQuery
import com.sprintique.planning.contract.ViewRowsQuery
import com.sprintique.planning.contract.ViewSelectQuery
import com.sprintique.planning.domain.Detail
import com.sprintique.planning.domain.Effect
import com.sprintique.planning.domain.HistoryItem
import com.sprintique.planning.domain.PlanningRow
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.planning.domain.PlanningState
import com.sprintique.planning.domain.Release
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.domain.TaskRules
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Locale
import java.util.UUID

/** Turns the planning screen's intents into planning commands and previews them. */
@Component
@Profile("api")
class ViewIntents(
    private val contracts: Contracts,
    private val planning: Planning,
    private val support: ViewSupport,
) {
    /** Turns an intent into a planning command, previews it and describes the changes for people. */
    fun previewIntent(tx: Transaction, actor: Actor, projectId: String, intent: ViewIntent): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        requireCondition(c.write, 403, "READ_ONLY", "Изменение недоступно.")
        expectedRevision(intent)?.let {
            requireCondition(
                it == c.revision.toString(),
                409,
                "PROJECTION_STALE",
                "План изменился. Обновите представление.",
            )
        }
        val selection = (intent as? ViewIntent.Selecting)?.let { selectionOf(tx, actor, projectId, it, c.revision) }
        val value = commandOf(intent, projectId, selection, c.rows)
        if (intent is ViewIntent.Batch) {
            for (action in intent.actions) {
                action.expectedProjectionRevision?.let {
                    requireCondition(it == c.revision.toString(), 409, "PROJECTION_STALE", "План изменился.")
                }
            }
        }
        val command = contracts.tree<PlanningCommandContract>(value)
        val result = planning.preview(tx, actor, projectId, command)

        @Suppress("UNCHECKED_CAST")
        val effects = result["effects"] as List<com.sprintique.planning.domain.Effect>

        @Suppress("UNCHECKED_CAST")
        val details = result["details"] as List<com.sprintique.planning.domain.Detail>

        @Suppress("UNCHECKED_CAST")
        val releases = result["releases"] as List<Release>
        val names = memberNames(c.state)
        val changes = details.map { linkedMapOf("label" to it.label, "description" to it.description) } +
            effects.map { ViewChanges.taskChange(it, releases + c.state.releases, names) }
        val affected = result["affectedCount"] as Int
        return linkedMapOf(
            "token" to "${result["id"]}.${result["token"]}",
            "expiresAt" to result["expiresAt"],
            "summary" to
                "Затронуто задач: $affected. На доску: ${result["enteringBoard"]}, с доски: ${result["leavingBoard"]}.",
            "changes" to changes.take(CHANGE_LIMIT),
            "moreChanges" to maxOf(0, details.size + affected - minOf(CHANGE_LIMIT, changes.size)),
            "blockers" to emptyList<Any>(),
        )
    }

    /** The planning command an intent stands for, in the JSON shape of the command contract. */
    @Suppress("CyclomaticComplexMethod", "LongMethod")
    private fun commandOf(
        intent: ViewIntent,
        projectId: String,
        selection: Any?,
        rows: List<PlanningRow>,
    ): Map<String, Any?> =
        when (intent) {
            is ViewIntent.TaskEdit -> linkedMapOf(
                "kind" to "task.edit",
                "taskId" to intent.taskId,
                "baseRevision" to intent.baseRevision,
                "task" to intent.task,
            )

            is ViewIntent.TaskCreate -> linkedMapOf(
                "kind" to "task.create",
                "taskId" to intent.taskId,
                "task" to intent.task,
                "createInBoard" to intent.createInBoard,
            )

            is ViewIntent.Prepare -> linkedMapOf(
                "kind" to "prepare",
                "selection" to selection,
                "preparation" to "ready",
            )

            is ViewIntent.Unprepare -> linkedMapOf(
                "kind" to "prepare", "selection" to selection,
                "preparation" to "draft",
            )

            is ViewIntent.Take -> linkedMapOf("kind" to "admission", "selection" to selection, "admitted" to true)

            is ViewIntent.Move -> linkedMapOf(
                "kind" to "assign",
                "selection" to selection,
                "assignment" to if (intent.groupId == BACKLOG) {
                    mapOf("mode" to "none")
                } else {
                    mapOf("mode" to "assigned", "releaseId" to intent.groupId)
                },
            )

            // The owner field carries a member id; an empty value unassigns.
            is ViewIntent.Bulk -> linkedMapOf(
                "kind" to "bulk",
                "selection" to selection,
                "fields" to when (intent.field) {
                    ViewIntent.BulkField.OWNER -> mapOf(
                        "ownerId" to intent.value?.takeIf {
                            it.isString && it.asString().isNotEmpty()
                        },
                    )

                    ViewIntent.BulkField.TAGS -> mapOf("addTagIds" to intent.value)

                    else -> mapOf(intent.field.wire to intent.value)
                },
            )

            is ViewIntent.Reorder -> linkedMapOf(
                "kind" to "rank",
                "ranks" to reorderRanks(rows, intent.taskIds.single(), intent.beforeId),
            )

            is ViewIntent.Start -> linkedMapOf("kind" to "start", "releaseId" to intent.groupId)

            is ViewIntent.EditRelease -> linkedMapOf(
                "kind" to "release.edit",
                "releaseId" to intent.groupId,
                "value" to intent.values.toCommandValue(),
            )

            is ViewIntent.CreateRelease -> linkedMapOf(
                "kind" to "release.create",
                "releaseId" to UUID.randomUUID().toString(),
                "projectId" to projectId,
                "value" to intent.values.toCommandValue(),
            )

            is ViewIntent.Close -> finish("close", intent)

            is ViewIntent.Cancel -> finish("cancel", intent)

            is CalendarIntent -> calendar(intent)

            is ViewIntent.Batch -> linkedMapOf("kind" to "schedule.batch", "actions" to intent.actions.map(::calendar))

            is ViewIntent.Milestone -> linkedMapOf(
                "kind" to "milestone",
                "id" to (intent.entityId ?: UUID.randomUUID().toString()),
                "value" to intent.values,
            )

            is ViewIntent.Settings -> linkedMapOf(
                "kind" to "settings",
                "value" to linkedMapOf(
                    "format" to intent.values.format.wire,
                    "days" to intent.values.days,
                    "timezone" to intent.values.timeZone,
                    "timezoneInherited" to (intent.values.inheritTimeZone == true),
                ),
            )

            is ViewIntent.ShiftDates -> linkedMapOf(
                "kind" to "shift", "releaseId" to intent.groupId,
                "days" to intent.days,
            )
        }

    private fun finish(kind: String, intent: ViewIntent.Finishing): Map<String, Any?> {
        requireCondition(
            (intent.newRelease != null) != (intent.destinationId != null),
            400,
            "DESTINATION_REQUIRED",
            "Выберите одного получателя остатка.",
        )
        val destination = when {
            intent.newRelease != null -> linkedMapOf(
                "kind" to "new",
                "id" to UUID.randomUUID().toString(),
                "value" to intent.newRelease!!.toCommandValue(),
            )

            intent.destinationId == BACKLOG -> mapOf("kind" to "unassigned")

            else -> mapOf("kind" to "release", "releaseId" to intent.destinationId)
        }
        val command = linkedMapOf<String, Any?>(
            "kind" to kind,
            "releaseId" to intent.groupId,
            "destination" to destination,
            "overrides" to intent.destinations.mapValues { (_, to) -> if (to == BACKLOG) null else to },
        )
        if (kind == "close") {
            command["accepted"] = if (intent.acceptAllCandidates) {
                mapOf("kind" to "filter", "filter" to mapOf("releaseId" to intent.groupId, "candidates" to true))
            } else {
                mapOf("kind" to "tasks", "ids" to emptyList<String>())
            }
        }
        return command
    }

    private fun calendar(intent: CalendarIntent): Map<String, Any?> = when (intent) {
        is ViewIntent.Schedule -> linkedMapOf<String, Any?>(
            "kind" to "schedule",
            "entity" to linkedMapOf("id" to intent.entityId, "kind" to intent.entityKind.wire),
            "plannedStart" to intent.values.start,
            "plannedEnd" to intent.values.end,
        ).apply { intent.values.deadline?.let { put("deadline", it.orElse(null)) } }

        is ViewIntent.RemoveTemporal -> linkedMapOf("kind" to "constraint.remove", "id" to intent.entityId)

        is ViewIntent.Temporal -> linkedMapOf(
            "kind" to "constraint",
            "id" to (intent.entityId ?: UUID.randomUUID().toString()),
            "value" to linkedMapOf(
                "source" to linkedMapOf("kind" to "task", "id" to intent.values.fromId),
                "target" to linkedMapOf("kind" to "task", "id" to intent.values.toId),
                "relation" to intent.values.type.wire,
                "lagDays" to intent.values.lagDays,
            ),
        )
    }

    private fun expectedRevision(intent: ViewIntent): String? = when (intent) {
        is ViewIntent.Selecting -> intent.expectedProjectionRevision
        is ViewIntent.Reorder -> intent.expectedProjectionRevision
        is CalendarIntent -> intent.expectedProjectionRevision
        is ViewIntent.Batch -> intent.expectedProjectionRevision
        else -> null
    }

    private fun selectionOf(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        intent: ViewIntent.Selecting,
        revision: Long,
    ): Any {
        val ids = intent.taskIds
        val token = intent.selectionToken
        requireCondition(ids == null || token == null, 400, "SELECTION_INVALID", "Укажите один способ выбора.")
        if (token == null) return linkedMapOf("kind" to "tasks", "ids" to ids.orEmpty())
        val row = tx.row(
            """
            SELECT filter, project_revision AS revision FROM app.planning_selections
            WHERE project_id = $1 AND id = $2 AND actor_id = $3 AND credential_id = $4 AND expires_at > clock_timestamp()
            """.trimIndent(),
            projectId,
            token,
            actor.id,
            actor.credentialId,
        )
        val stored = requirePresent(row, 404, "SELECTION_UNAVAILABLE", "Выбор устарел или недоступен.")
        requireCondition(
            stored.long("revision") == revision,
            409,
            "SELECTION_STALE",
            "Состав изменился. Выберите задачи заново.",
        )
        return stored.json("filter")!!
    }

    /**
     * Usually one rank between the neighbours at the drop point (`beforeId` null is the end). When neighbours tie or
     * the gap is exhausted, the siblings are renumbered in the new order.
     */
    private fun reorderRanks(rows: List<PlanningRow>, taskId: String, beforeId: String?): List<Map<String, Any>> {
        val others = support.siblings(rows, taskId).filter { it.id != taskId }
        val at = if (beforeId == null) others.size else others.indexOfFirst { it.id == beforeId }
        requireCondition(
            at >= 0,
            422,
            "REORDER_SCOPE",
            "Переставлять можно только среди задач того же уровня в той же группе.",
        )
        val previous = if (at > 0) others[at - 1].rank else null
        val next = if (at < others.size) others[at].rank else null
        val rank = when {
            previous == null && next == null -> STEP
            previous == null -> next!! - STEP
            next == null -> previous + STEP
            else -> (previous + next) / 2
        }
        if (fitsBetween(rank, previous, next)) {
            return listOf(linkedMapOf("taskId" to taskId, "rank" to rank))
        }
        val ordered = others.take(at).map(PlanningRow::id) + taskId + others.drop(at).map(PlanningRow::id)
        return ordered.mapIndexed { index, id -> linkedMapOf("taskId" to id, "rank" to (index + 1) * STEP) }
    }

    private fun fitsBetween(rank: Double, previous: Double?, next: Double?) =
        (previous == null || rank > previous) && (next == null || rank < next)

    private companion object {
        const val CHANGE_LIMIT = 200
        const val STEP = 1024.0
    }
}
