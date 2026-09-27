package com.sprintique.planning.application

import com.sprintique.planning.application.ViewText.PRIORITY_LABELS
import com.sprintique.planning.application.ViewText.STATUS_LABELS
import com.sprintique.planning.application.ViewText.ownerLabel
import com.sprintique.planning.domain.Effect
import com.sprintique.planning.domain.PlanningRow
import com.sprintique.planning.domain.Release

/** How a previewed task change reads for people. */
internal object ViewChanges {
    fun taskChange(effect: Effect, releases: List<Release>, names: Map<String, String>): Map<String, String> {
        val parts = placement(effect.before, effect.after, releases) + content(effect.before, effect.after, names)
        return linkedMapOf(
            "label" to "${effect.after.displayId} ${effect.after.title}",
            "description" to parts.joinToString(". ").ifEmpty { "Обновить содержимое задачи" },
        )
    }

    /** Where the task stands: creation, preparation, release, parent, board, result and dates. */
    private fun placement(before: PlanningRow?, after: PlanningRow, releases: List<Release>) = buildList {
        if (before == null) add("Создать задачу")
        if (before?.preparation != after.preparation) {
            add(if (after.preparation == "ready") "Подготовить к работе" else "Сохранить черновиком")
        }
        if (before?.effectiveReleaseId != after.effectiveReleaseId) {
            add("Релиз: " + (releases.firstOrNull { it.id == after.effectiveReleaseId }?.name ?: "Бэклог"))
        }
        if (before?.parentId != after.parentId) {
            add(if (after.parentId != null) "Изменить родительскую задачу" else "Убрать родительскую задачу")
        }
        if (before?.boardEligible != after.boardEligible) {
            add(if (after.boardEligible) "Появится на доске" else "Уйдёт с доски")
        }
        if (before?.result !=
            after.result
        ) {
            add(if (after.result == "accepted") "Результат принят" else "Результат открыт")
        }
        if (before?.plannedStart != after.plannedStart || before?.plannedEnd != after.plannedEnd) {
            add("План: ${after.plannedStart ?: "без начала"} — ${after.plannedEnd ?: "без окончания"}")
        }
        if (before?.due != after.due) add("Дедлайн: " + (after.due ?: "не задан"))
    }

    /** What the task says: owner, order, priority, status, tags and files. */
    private fun content(before: PlanningRow?, after: PlanningRow, names: Map<String, String>) = buildList {
        if (before?.ownerId != after.ownerId) add("Исполнитель: " + ownerLabel(after, names).ifEmpty { "не назначен" })
        if (before != null && before.rank != after.rank) add("Изменить порядок")
        if (before?.priority != after.priority) add("Приоритет: " + (PRIORITY_LABELS[after.priority] ?: after.priority))
        if (before?.status != after.status) add("Статус: " + (STATUS_LABELS[after.status] ?: after.status))
        if (before?.tagIds != after.tagIds) add("Теги: ${after.tagIds.size}")
        if (filesChanged(before, after)) add("Обновить файлы и обложку")
    }

    private fun filesChanged(before: PlanningRow?, after: PlanningRow) =
        before == null || before.attachmentIds != after.attachmentIds ||
            before.coverAttachmentId != after.coverAttachmentId
}
