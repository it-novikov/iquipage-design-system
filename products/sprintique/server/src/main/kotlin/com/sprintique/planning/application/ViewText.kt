package com.sprintique.planning.application

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Contracts
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
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

/** Labels and small rules of the planning screen. */
internal object ViewText {
    const val BACKLOG = "backlog"
    private const val GROUP_PAGE = 100
    private const val ROW_PAGE = 200
    private const val OPTION_PAGE = 50
    private const val RELEASE_PAGE = 100
    private const val CHANGE_LIMIT = 200
    private const val CONSTRAINT_LIMIT = 10_000
    private const val STEP = 1024.0
    val PRIORITIES = listOf("critical", "high", "normal", "low")
    val PRIORITY_LABELS = mapOf(
        "low" to "Низкий", "normal" to "Обычный", "high" to "Высокий",
        "critical" to "Критичный",
    )
    val STATUS_LABELS = mapOf(
        "ready" to "Готово к работе",
        "in_progress" to "В работе",
        "review" to "На проверке",
        "ready_for_testing" to "К тестированию",
        "testing" to "Тестирование",
        "ready_for_release" to "Готово к релизу",
    )

    fun finished(release: Release) = release.lifecycle == "closed" || release.lifecycle == "cancelled"

    fun isDone(row: PlanningRow) = row.result == "accepted" || row.status == "ready_for_release"

    /** Dates travel raw (`YYYY-MM-DD`); this label stays for older clients. */
    fun dateLabel(release: Release) =
        listOf(day(release.plannedStart), day(release.plannedEnd)).filter(String::isNotEmpty).joinToString(" – ")

    fun day(value: String?) = com.sprintique.planning.domain.PlanDetails.day(value)

    fun memberNames(state: PlanningState) = state.members.associate { it.id to it.name }

    /** The member's name, or pre-membership free text marked until someone reassigns the task. */
    fun ownerLabel(row: PlanningRow, names: Map<String, String>): String = when {
        row.ownerId != null -> names[row.ownerId] ?: "Бывший участник"
        row.legacyOwner.isNotEmpty() -> "${row.legacyOwner} (не участник)"
        else -> ""
    }
}
