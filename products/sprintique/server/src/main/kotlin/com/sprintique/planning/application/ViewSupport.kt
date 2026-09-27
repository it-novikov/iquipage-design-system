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
import org.springframework.stereotype.Component
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Locale
import java.util.UUID

internal data class ViewContext(
    val revision: Long,
    val state: PlanningState,
    val rows: List<PlanningRow>,
    val write: Boolean,
    val admin: Boolean,
)

/** What the planning projection and the intents share: the read context, stored history, selections, cursors. */
@Component
class ViewSupport(private val json: JsonMapper, private val contracts: Contracts) {
    /** Stored history rows are read leniently: older entries may carry fields this version no longer writes. */
    internal val stored: JsonMapper = json.rebuild().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()

    internal fun context(tx: Transaction, actor: Actor, projectId: String): ViewContext {
        val revision = PlanningStates.lock(tx, actor, projectId).revision
        val state = PlanningStates.load(tx, projectId)
        val access = ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val write = access.role != "reader" && actor.mayRead(Capability.TASKS_WRITE)
        // The interactive screen has no agent approval step; agents use the canonical proposal API.
        val interactive = write && actor.isHuman
        return ViewContext(
            revision, state, PlanningRows.project(state), interactive,
            interactive && access.role == "admin",
        )
    }

    /** The items of the release's last close or cancel; null if it never finished. */
    internal fun finalSnapshot(tx: Transaction, projectId: String, releaseId: String): List<HistoryItem>? {
        val row = tx.row(
            """
            SELECT items FROM app.release_snapshots WHERE project_id = $1 AND kind IN ('closed', 'cancelled') AND release_id = $2
            ORDER BY created_at DESC, id DESC LIMIT 1
            """.trimIndent(),
            projectId,
            releaseId,
        ) ?: return null
        return row.json("items")!!.values().map { stored.treeToValue(it, HistoryItem::class.java) }
    }

    /** The view's filters as a planning selection over open tasks, optionally under [roots]. */
    internal fun filterSelection(filters: ViewFiltering, roots: List<String>?): SelectionContract {
        val filter = linkedMapOf<String, Any?>(
            "q" to filters.query,
            "matchReleaseNames" to true,
            "preparation" to filters.preparation.wire,
            "owner" to filters.owner,
            "tagIds" to filters.tagIds,
            "tagMode" to filters.tagMode.wire,
        )
        if (filters.releaseId.isNotEmpty()) {
            filter["releaseId"] =
                if (filters.releaseId == BACKLOG) null else filters.releaseId
        }
        if (roots != null) filter["roots"] = roots
        filter["openOnly"] = true
        return contracts.tree<SelectionContract>(linkedMapOf("kind" to "filter", "filter" to filter))
    }

    internal fun matches(filters: ViewFiltering, rows: List<PlanningRow>, releases: List<Release>): Set<String> {
        val selection = filterSelection(filters, null) as SelectionContract.Matching
        val open = selection.filter.copy(openOnly = false)
        return PlanningRows.selected(SelectionContract.Matching(open).toDomain(), rows, releases)
    }

    /** Siblings share the task's group (release or backlog) and parent, in planned order. */
    internal fun siblings(rows: List<PlanningRow>, taskId: String): List<PlanningRow> {
        val task = requirePresent(rows.firstOrNull { it.id == taskId }, 404, "TASK_NOT_FOUND", "Задача недоступна.")
        requireCondition(task.result == "open", 409, "RESULT_PINNED", "Принятый результат нельзя переставить.")
        val group = task.effectiveReleaseId ?: BACKLOG
        return rows.filter {
            (it.effectiveReleaseId ?: BACKLOG) == group && it.parentId == task.parentId &&
                it.result == "open"
        }
            .sortedWith(compareBy<PlanningRow> { it.rank }.then { a, b -> ViewOrder.natural(a.displayId, b.displayId) })
    }

    internal fun binding(projectId: String, scope: String, value: Any): String =
        Tokens.sha256Hex(CommandLedger.canonical(json.valueToTree(listOf(projectId, scope, value))))
}
