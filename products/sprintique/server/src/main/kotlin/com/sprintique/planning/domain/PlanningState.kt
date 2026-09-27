package com.sprintique.planning.domain

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

/** The project's release defaults and time zone; the zone is null where row security hides the workspace. */
data class PlanningDefaults(val format: String, val days: Int, val timezone: String?, val timezoneInherited: Boolean?)

/** What a task created by a planning command receives: the next number of the project and the creation time. */
data class CreationContext(val projectId: String, val key: String, val number: Int, val createdAt: String)

data class ProjectPerson(val id: String, val name: String)

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
