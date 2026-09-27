package com.sprintique.task.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UniqueItems
import com.sprintique.task.application.TaskContent
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

enum class TaskStatus(@get:JsonValue val wire: String) {
    READY("ready"),
    IN_PROGRESS("in_progress"),
    REVIEW("review"),
    READY_FOR_TESTING("ready_for_testing"),
    TESTING("testing"),
    READY_FOR_RELEASE("ready_for_release"),
}

enum class TaskType(@get:JsonValue val wire: String) { TASK("task"), BUG("bug"), EPIC("epic") }

enum class TaskPriority(@get:JsonValue val wire: String) {
    LOW("low"),
    NORMAL("normal"),
    HIGH("high"),
    CRITICAL("critical"),
}

/**
 * The part of the cover image shown on cards, in image-relative units. Per axis the frame either lies inside the
 * image (0 ≤ x ≤ 1 − w) or contains it whole ("Вписать": 1 − w ≤ x ≤ 0).
 */
@Schema(name = "CoverCrop")
data class CoverCropRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val attachmentId: String,
    @field:DecimalMin("-20") @field:DecimalMax("1")
    val x: Double,
    @field:DecimalMin("-20") @field:DecimalMax("1")
    val y: Double,
    @field:Positive @field:DecimalMax("20")
    val width: Double,
    @field:Positive @field:DecimalMax("20")
    val height: Double,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isFrameValid: Boolean get() = axisValid(x, width) && axisValid(y, height)

    fun toDocument(): Map<String, Any> =
        linkedMapOf("attachmentId" to attachmentId, "x" to x, "y" to y, "width" to width, "height" to height)

    private companion object {
        const val TOLERANCE = 1e-6

        fun axisValid(position: Double, size: Double) = if (size <= 1) {
            position >= -TOLERANCE && position <= 1 - size + TOLERANCE
        } else {
            position <= TOLERANCE && position >= 1 - size - TOLERANCE
        }
    }
}

@Schema(name = "TaskInput")
data class TaskInputRequest(
    @field:Size(max = 50) @field:UniqueItems @field:ResourceIds
    val attachmentIds: List<String> = emptyList(),
    @field:Pattern(regexp = RESOURCE_ID)
    val coverAttachmentId: String? = null,
    @field:Valid
    val coverCrop: CoverCropRequest? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 240)
    val title: String,
    @field:Size(max = 10_000)
    val description: String = "",
    val status: TaskStatus = TaskStatus.READY,
    val type: TaskType = TaskType.TASK,
    val priority: TaskPriority = TaskPriority.NORMAL,
    /** A current human member of the project; null means unassigned. */
    @field:Pattern(regexp = RESOURCE_ID)
    val ownerId: String? = null,
    @field:IsoDate
    val due: String? = null,
    val rank: Double = DEFAULT_RANK,
    @field:Pattern(regexp = RESOURCE_ID)
    val parentId: String? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String? = null,
    @field:Size(max = 30) @field:UniqueItems @field:ResourceIds
    val tagIds: List<String> = emptyList(),
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isRankFinite: Boolean get() = rank.isFinite()

    fun toContent() = TaskContent(
        attachmentIds = attachmentIds,
        coverAttachmentId = coverAttachmentId,
        coverCrop = coverCrop?.toDocument(),
        coverCropAttachmentId = coverCrop?.attachmentId,
        title = title,
        description = description,
        status = status.wire,
        type = type.wire,
        priority = priority.wire,
        ownerId = ownerId,
        due = due,
        rank = rank,
        parentId = parentId,
        releaseId = releaseId,
        tagIds = tagIds,
    )

    companion object {
        const val DEFAULT_RANK = 1024.0
    }
}

@Schema(name = "PutTask")
data class PutTaskRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val task: TaskInputRequest,
    val createInBoard: Boolean = false,
)

/** A board move: the new column and order, nothing else. */
@Schema(name = "MoveTask")
data class MoveTaskRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val status: TaskStatus = TaskStatus.READY,
    val rank: Double = TaskInputRequest.DEFAULT_RANK,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isRankFinite: Boolean get() = rank.isFinite()
}

enum class TaskLinkKind(@get:JsonValue val wire: String) { DEPENDS("depends"), RELATED("related") }

@Schema(name = "TaskLinkInput")
data class TaskLinkInputRequest(
    val kind: TaskLinkKind,
    @field:Pattern(regexp = RESOURCE_ID)
    val fromId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val toId: String,
    val archived: Boolean = false,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isBetweenTwoTasks: Boolean get() = fromId != toId
}

@Schema(name = "PutTaskLink")
data class PutTaskLinkRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: TaskLinkInputRequest,
)
