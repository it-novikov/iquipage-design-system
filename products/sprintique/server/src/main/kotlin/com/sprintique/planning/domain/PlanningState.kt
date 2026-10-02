package com.sprintique.planning.domain

import com.sprintique.task.domain.TaskEstimate
import java.time.Instant

/** A task as planning sees it. Wire values (`draft`, `inherit`, …) are kept as the API writes them. */
data class TaskState(
    val id: String,
    val displayId: String,
    val revision: Int,
    val parentId: String?,
    val title: String,
    val type: String,
    val status: String,
    val attachmentIds: List<String>,
    val coverAttachmentId: String?,
    /** The stored crop document, carried through unchanged. */
    val coverCrop: Any?,
    val ownerId: String?,
    val legacyOwner: String,
    val priority: String,
    val rank: Double,
    val statusEnteredAt: String,
    val createdAt: String,
    val preparation: String,
    val result: String,
    val admitted: Boolean,
    val assignmentMode: String,
    val releaseId: String?,
    val plannedStart: String?,
    val plannedEnd: String?,
    val due: String?,
    val tagIds: List<String>,
    /** As entered; null when the task has no estimate. */
    val estimate: TaskEstimate? = null,
) {
    /** The planning projection of this task once its effective release, board admission and children are known. */
    fun toRow(effectiveReleaseId: String?, assignmentSourceId: String?, boardEligible: Boolean, childCount: Int) =
        PlanningRow(
            attachmentIds = attachmentIds,
            coverAttachmentId = coverAttachmentId,
            coverCrop = coverCrop,
            id = id,
            displayId = displayId,
            revision = revision,
            parentId = parentId,
            title = title,
            type = type,
            status = status,
            ownerId = ownerId,
            legacyOwner = legacyOwner,
            priority = priority,
            rank = rank,
            statusEnteredAt = statusEnteredAt,
            createdAt = createdAt,
            tagIds = tagIds,
            preparation = preparation,
            result = result,
            admitted = admitted,
            plannedStart = plannedStart,
            plannedEnd = plannedEnd,
            due = due,
            assignmentMode = assignmentMode,
            releaseId = releaseId,
            effectiveReleaseId = effectiveReleaseId,
            assignmentSourceId = assignmentSourceId,
            boardEligible = boardEligible,
            childCount = childCount,
            estimate = estimate,
        )
}

/**
 * A task with what planning derives for it: the release it effectively belongs to (its own or inherited), the task
 * that decided it, whether it is on the board, and its number of children. The fields read back from stored previews
 * and history, so the optional ones have defaults.
 */
data class PlanningRow(
    val attachmentIds: List<String> = emptyList(),
    val coverAttachmentId: String? = null,
    val coverCrop: Any? = null,
    val id: String,
    val displayId: String,
    val revision: Int,
    val parentId: String?,
    val title: String,
    val type: String,
    val status: String,
    val ownerId: String?,
    val legacyOwner: String = "",
    val priority: String,
    val rank: Double,
    val statusEnteredAt: String,
    val createdAt: String,
    val tagIds: List<String>,
    val preparation: String,
    val result: String,
    val admitted: Boolean,
    val plannedStart: String?,
    val plannedEnd: String? = null,
    val due: String?,
    val assignmentMode: String,
    val releaseId: String?,
    val effectiveReleaseId: String?,
    val assignmentSourceId: String?,
    val boardEligible: Boolean,
    val childCount: Int,
    val estimate: TaskEstimate? = null,
)

data class Release(
    val id: String,
    val projectId: String,
    val name: String,
    val revision: Int,
    val scopeRevision: Double,
    val lifecycle: String,
    val format: String,
    val plannedStart: String?,
    val plannedEnd: String?,
    val deadline: String?,
    val archivedAt: Instant?,
    /** What the sprint or release is for, in one line; null when not set. */
    val goal: String? = null,
)

data class Milestone(val id: String, val title: String, val date: String?, val revision: Int, val releaseId: String?)

/** A task, release or milestone named by a temporal constraint. */
data class PlanningEntity(val kind: String, val id: String)

data class TemporalConstraint(
    val id: String,
    val revision: Int,
    val source: PlanningEntity,
    val target: PlanningEntity,
    /** Two letters: which end of the source (`S`tart or `F`inish) precedes which end of the target. */
    val relation: String,
    val lagDays: Int,
)

/** An active "depends on" link between tasks: [fromId] waits for [toId]. */
data class Dependency(val id: String, val fromId: String, val toId: String)

/**
 * The project's release defaults and time zone; the zone is null where row security hides the workspace. Estimates
 * are kept in time (hours, days, weeks) or in story points; a day and a week are [hoursPerDay] and [hoursPerWeek].
 */
data class PlanningDefaults(
    val format: String,
    val days: Int,
    val timezone: String?,
    val timezoneInherited: Boolean?,
    val estimateFormat: String = "time",
    val hoursPerDay: Int = 8,
    val hoursPerWeek: Int = 40,
)

/** What a task created by a planning command receives: the next number of the project and the creation time. */
data class CreationContext(val projectId: String, val key: String, val number: Int, val createdAt: String)

/**
 * Someone the plan names as a task owner: a member of the project (a person or a service account), or a service account
 * that still owns tasks here after it left the project or was deleted. [state] is `active`, `suspended`, `deleted` or
 * `former`; [assignable] is whether it may be given a task now (SPR-7).
 */
data class ProjectPerson(
    val id: String,
    val name: String,
    val kind: String = "human",
    val state: String = "active",
    val assignable: Boolean = true,
    val accountOwner: String? = null,
) {
    /** How the plan shows a task owner: a service account is marked as one, and so is one that can no longer act. */
    val label: String
        get() = if (kind != "service") {
            name
        } else {
            when (state) {
                "suspended" -> "$name (сервисный аккаунт, приостановлен)"
                "deleted" -> "$name (сервисный аккаунт, удалён)"
                "former" -> "$name (сервисный аккаунт, не в проекте)"
                else -> "$name (сервисный аккаунт)"
            }
        }
}

data class PlanningState(
    val tasks: List<TaskState>,
    val releases: List<Release>,
    val milestones: List<Milestone>,
    val constraints: List<TemporalConstraint>,
    val dependencies: List<Dependency> = emptyList(),
    val defaults: PlanningDefaults? = null,
    val creation: CreationContext? = null,
    val members: List<ProjectPerson> = emptyList(),
)
