package com.sprintique.task.domain

/** The editable content of a task, as a writer sends it. Wire values (`ready`, `bug`, …) as the API names them. */
data class TaskContent(
    val attachmentIds: List<String>,
    val coverAttachmentId: String?,
    /** The crop frame of the cover, stored as sent; [coverCropAttachmentId] is the image it frames. */
    val coverCrop: Any?,
    val coverCropAttachmentId: String?,
    val title: String,
    val description: String,
    val status: String,
    val type: String,
    val priority: String,
    val ownerId: String?,
    val due: String?,
    val rank: Double,
    val parentId: String?,
    val releaseId: String?,
    val tagIds: List<String>,
)
