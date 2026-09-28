package com.sprintique.planning.application

import com.sprintique.planning.domain.PlanningRow
import com.sprintique.planning.domain.PlanningState
import com.sprintique.planning.domain.Release

/** Labels and small rules of the planning screen. */
internal object ViewText {
    const val BACKLOG = "backlog"
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
