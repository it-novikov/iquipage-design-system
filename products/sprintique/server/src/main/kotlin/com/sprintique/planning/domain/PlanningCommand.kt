package com.sprintique.planning.domain

import com.sprintique.task.domain.TaskContent
import com.sprintique.task.domain.TaskEstimate

/** A field a command may leave out: [Absent] keeps the current value, [Given] sets one (which may be null). */
sealed interface Maybe<out T> {
    data object Absent : Maybe<Nothing>

    data class Given<out T>(val value: T) : Maybe<T>
}

/** Which tasks a command applies to. */
sealed interface Selection {
    data class Tasks(val ids: List<String>) : Selection

    data class InRelease(val releaseId: String) : Selection

    data object Unassigned : Selection

    data object Project : Selection

    data class Matching(val filter: SelectionFilter) : Selection
}

/**
 * Tasks matching a filter. [releaseId] absent means any release; given null means the backlog. [roots] narrows the
 * match to these tasks and their descendants.
 */
data class SelectionFilter(
    val q: String = "",
    val matchReleaseNames: Boolean = false,
    val preparation: String = "all",
    val owner: String = "",
    val releaseId: Maybe<String?> = Maybe.Absent,
    val tagIds: List<String> = emptyList(),
    val tagMode: String = "any",
    val roots: List<String>? = null,
    val candidates: Boolean = false,
    val openOnly: Boolean = false,
)

/** Where selected tasks go: a release, their parent's release, or no release. */
sealed interface Assignment {
    data class Assigned(val releaseId: String) : Assignment

    data object Inherit : Assignment

    data object None : Assignment

    val mode: String
        get() = when (this) {
            is Assigned -> "assigned"
            Inherit -> "inherit"
            None -> "none"
        }
}

/**
 * The name, format and dates of a release. A timeboxed release (a sprint) has both dates. A [goal] left out keeps the
 * current one (none for a new release).
 */
data class ReleaseData(
    val name: String,
    val format: String,
    val plannedStart: String?,
    val plannedEnd: String?,
    val deadline: String?,
    val goal: Maybe<String?> = Maybe.Absent,
)

/** Where the unfinished rest of a closed or cancelled release goes. */
sealed interface Destination {
    data class ToRelease(val releaseId: String) : Destination

    data class NewRelease(val id: String, val value: ReleaseData) : Destination

    data object Backlog : Destination
}

data class TemporalValue(val source: PlanningEntity, val target: PlanningEntity, val relation: String, val lagDays: Int)

data class MilestoneData(val title: String, val date: String?, val releaseId: String?)

/** Fields a bulk change sets on every selected task; tags are added, never removed. */
data class BulkFields(
    val ownerId: Maybe<String?> = Maybe.Absent,
    val priority: Maybe<String> = Maybe.Absent,
    val plannedStart: Maybe<String?> = Maybe.Absent,
    val plannedEnd: Maybe<String?> = Maybe.Absent,
    val due: Maybe<String?> = Maybe.Absent,
    val addTagIds: List<String>? = null,
    val estimate: Maybe<TaskEstimate?> = Maybe.Absent,
)

data class RankChange(val taskId: String, val rank: Double)

/** Calendar actions, alone or in a batch. */
sealed interface ScheduleAction : PlanningCommand

/** Every change planning previews before it is applied. */
sealed interface PlanningCommand {
    data class TaskEdit(val taskId: String, val baseRevision: Long, val task: TaskContent) : PlanningCommand

    data class TaskCreate(val taskId: String, val task: TaskContent, val createInBoard: Boolean) : PlanningCommand

    data class Prepare(val selection: Selection, val preparation: String) : PlanningCommand

    data class Admission(val selection: Selection, val admitted: Boolean) : PlanningCommand

    data class Assign(val selection: Selection, val assignment: Assignment) : PlanningCommand

    data class Reparent(val taskId: String, val parentId: String?) : PlanningCommand

    /** Manual order among siblings: only the ranks change. */
    data class Rank(val ranks: List<RankChange>) : PlanningCommand

    data class Bulk(val selection: Selection, val fields: BulkFields) : PlanningCommand

    data class Start(val releaseId: String) : PlanningCommand

    data class ReleaseEdit(val releaseId: String, val value: ReleaseData) : PlanningCommand

    data class ReleaseCreate(val releaseId: String, val projectId: String, val value: ReleaseData) : PlanningCommand

    /** Closes an active release: [accepted] tasks keep it for good; the rest goes to [destination] or [overrides]. */
    data class Close(
        val releaseId: String,
        val accepted: Selection,
        val destination: Destination,
        val overrides: Map<String, String?>?,
    ) : PlanningCommand

    data class Cancel(val releaseId: String, val destination: Destination, val overrides: Map<String, String?>?) :
        PlanningCommand

    /** New dates of a task, release or milestone; a [deadline] left out keeps the current one. */
    data class Schedule(
        val entity: PlanningEntity,
        val plannedStart: String?,
        val plannedEnd: String?,
        val deadline: Maybe<String?> = Maybe.Absent,
    ) : ScheduleAction

    data class Constraint(val id: String, val value: TemporalValue) : ScheduleAction

    data class RemoveConstraint(val id: String) : ScheduleAction

    data class MilestoneChange(val id: String, val value: MilestoneData) : PlanningCommand

    data class Settings(val value: PlanningDefaults) : PlanningCommand

    data class Shift(val releaseId: String, val days: Int) : PlanningCommand

    data class ScheduleBatch(val actions: List<ScheduleAction>) : PlanningCommand

    /**
     * Puts [ids] into a container (`backlog` or a release) right after the root row [afterId] (null: first). With
     * [withChildren] an epic takes its descendants from the same container; without, they stay where they were.
     */
    data class Place(val ids: List<String>, val containerId: String, val afterId: String?, val withChildren: Boolean) :
        PlanningCommand

    /** Puts tasks back exactly as an undo of a [Place] recorded them. */
    data class Restore(val items: List<RestoreItem>) : PlanningCommand
}

/** A task's own placement before a move: its container (or inheritance), rank and board admission. */
data class RestoreItem(
    val id: String,
    val containerId: String,
    val inherit: Boolean,
    val rank: Double,
    val admitted: Boolean? = null,
)
