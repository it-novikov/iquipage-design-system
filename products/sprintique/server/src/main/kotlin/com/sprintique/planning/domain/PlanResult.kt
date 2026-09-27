package com.sprintique.planning.domain

import com.sprintique.task.domain.TaskContent

/** A task before and after a planned change; [before] is null for a task the change creates. */
data class Effect(val id: String, val before: PlanningRow?, val after: PlanningRow)

/** One task in a release's history: its state at the event and after it, and what became of it. */
data class HistoryItem(val before: PlanningRow, val task: PlanningRow, val outcome: String)

/** A release's history entry written when it starts, closes or is cancelled. */
data class ReleaseHistory(val releaseId: String, val kind: String, val items: List<HistoryItem>)

data class CreatedTask(val id: String, val projectId: String, val number: Int, val createdAt: String)

data class TaskContentChange(val id: String, val value: TaskContent)

/** A line of a preview for people: what changes besides task rows. */
data class Detail(val label: String, val description: String)

/**
 * Everything a command changes, computed from the current state and nothing else. A preview stores it; applying
 * the plan recomputes it and proceeds only if nothing differs.
 */
data class PlanResult(
    val taskContent: TaskContentChange?,
    val createdTask: CreatedTask?,
    val tasks: List<TaskState>,
    val releases: List<Release>,
    val effects: List<Effect>,
    val selectedCount: Int,
    val milestones: List<Milestone>,
    val constraints: List<TemporalConstraint>,
    val removedConstraints: List<String>,
    val defaults: PlanningDefaults?,
    val details: List<Detail>,
    val history: ReleaseHistory?,
)
