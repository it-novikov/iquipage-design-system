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

    /**
     * A new task (no `before`) lists every line, an existing one only what differs — as the previous backend did,
     * where `undefined !== value` held for every field of a new task.
     */
    private fun <T> PlanningRow?.differs(after: PlanningRow, field: (PlanningRow) -> T) =
        this == null || field(this) != field(after)

    /** Where the task stands: creation, preparation, release, parent, board, result and dates. */
    private fun placement(before: PlanningRow?, after: PlanningRow, releases: List<Release>) = buildList {
        if (before == null) add("Создать задачу")
        if (before.differs(after) { it.preparation }) {
            add(if (after.preparation == "ready") "Подготовить к работе" else "Сохранить черновиком")
        }
        if (before.differs(after) { it.effectiveReleaseId }) {
            add("Релиз: " + (releases.firstOrNull { it.id == after.effectiveReleaseId }?.name ?: "Бэклог"))
        }
        if (before.differs(after) { it.parentId }) {
            add(if (after.parentId != null) "Изменить родительскую задачу" else "Убрать родительскую задачу")
        }
        if (before.differs(after) { it.boardEligible }) {
            add(if (after.boardEligible) "Появится на доске" else "Уйдёт с доски")
        }
        if (before.differs(after) { it.result }) {
            add(if (after.result == "accepted") "Результат принят" else "Результат открыт")
        }
        if (before.differs(after) { it.plannedStart } || before.differs(after) { it.plannedEnd }) {
            add("План: ${after.plannedStart ?: "без начала"} — ${after.plannedEnd ?: "без окончания"}")
        }
        if (before.differs(after) { it.due }) add("Дедлайн: " + (after.due ?: "не задан"))
    }

    /** What the task says: owner, order, priority, status, tags and files. */
    private fun content(before: PlanningRow?, after: PlanningRow, names: Map<String, String>) = buildList {
        if (before.differs(after) { it.ownerId }) {
            add("Исполнитель: " + ownerLabel(after, names).ifEmpty { "не назначен" })
        }
        if (before != null && before.rank != after.rank) add("Изменить порядок")
        if (before.differs(after) { it.priority }) {
            add("Приоритет: " + (PRIORITY_LABELS[after.priority] ?: after.priority))
        }
        if (before.differs(after) { it.status }) add("Статус: " + (STATUS_LABELS[after.status] ?: after.status))
        if (before.differs(after) { it.tagIds }) add("Теги: ${after.tagIds.size}")
        if (filesChanged(before, after)) add("Обновить файлы и обложку")
    }

    private fun filesChanged(before: PlanningRow?, after: PlanningRow) =
        before == null || before.attachmentIds != after.attachmentIds ||
            before.coverAttachmentId != after.coverAttachmentId
}
