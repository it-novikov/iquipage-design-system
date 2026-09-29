package com.sprintique.media.application

import com.sprintique.media.domain.ContentCheck
import com.sprintique.media.domain.FileInspection
import com.sprintique.media.domain.InspectedFile
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import java.io.Closeable
import java.io.InputStream

/** What the start of an upload settled: where the original goes and what the body must match. */
data class UploadPlan(
    val key: String,
    val name: String,
    val size: Long,
    val sha256: String,
    val targetType: String,
    /** False when the file is already stored: the body is then only checked against it, nothing is written. */
    val store: Boolean,
)

/**
 * A body that passed inspection and is not yet published: its original waits in memory (small files and previewable
 * images) or as uploaded parts that no key points to yet. Closing it discards whatever was not published.
 */
class ReceivedContent(
    val file: InspectedFile,
    val preview: ProcessedImage?,
    private val whole: ByteArray?,
    private val parts: ObjectWrite?,
) : Closeable {
    /** Makes the original and its previews visible under their keys. */
    fun publish(storage: ObjectStoragePort, key: (String) -> String) {
        if (whole != null) storage.put(key("original"), whole, file.mime) else parts?.complete()
        if (preview != null) {
            storage.put(key("display"), preview.display, "image/webp")
            storage.put(key("thumb"), preview.thumb, "image/webp")
        }
    }

    override fun close() {
        parts?.let { runCatching { it.abort() } }
    }
}

/**
 * Receives upload bodies without holding a large one: the body streams through [ContentCheck] in parts of
 * [PART_SIZE] into a multipart write, and only after the size and SHA-256 match the reservation may the caller
 * publish it. Small files and previewable images up to [FileInspection.IMAGE_BYTES] are held whole — the images
 * because they are decoded into previews. No database transaction is open while a body streams.
 */
class Uploads(private val storage: ObjectStoragePort, private val images: ImageTranscoder) {
    fun receive(plan: UploadPlan, body: InputStream): ReceivedContent {
        val check = ContentCheck(plan.name, plan.size)
        val type = check.type
        val held = plan.size <= PART_SIZE || (type.previewable && plan.size <= FileInspection.IMAGE_BYTES)
        val kept = plan.store && held
        val parts = if (plan.store && !held) storage.startWrite(plan.key, type.mime) else null
        var handedOver = false
        try {
            // One byte past the reservation is enough to notice a longer body: the check stops it there.
            val buffer = ByteArray(
                if (kept) {
                    plan.size.toInt() + 1
                } else if (parts != null) {
                    PART_SIZE
                } else {
                    CHUNK
                },
            )
            var filled = 0
            while (true) {
                val read = body.read(buffer, filled, buffer.size - filled)
                if (read < 0) break
                check.update(buffer, filled, read)
                filled += read
                if (!kept && filled == buffer.size) {
                    parts?.part(buffer, filled)
                    filled = 0
                }
            }
            val file = check.finish()
            requireCondition(
                file.size == plan.size && file.sha256 == plan.sha256,
                422,
                "FILE_HASH",
                ContentCheck.CHANGED,
            )
            if (filled > 0) parts?.part(buffer, filled)
            val whole = if (kept) buffer.copyOf(filled) else null
            val preview = if (whole != null && type.previewable) preview(whole, plan.targetType) else null
            handedOver = true
            return ReceivedContent(file, preview, whole, parts)
        } finally {
            if (!handedOver) parts?.let { runCatching { it.abort() } }
        }
    }

    /**
     * WebP previews of an image. A task keeps an image the decoder refuses to open for its size or animation as a
     * plain file; a map image or an avatar must be a still image within the bounds. Unreadable content fails.
     */
    private fun preview(bytes: ByteArray, targetType: String): ProcessedImage? = try {
        images.variants(bytes)
    } catch (problem: ProblemException) {
        if (targetType == "task" && problem.code in KEPT_WITHOUT_PREVIEW) null else throw problem
    }

    companion object {
        /** Parts of the multipart write, and the most a large upload holds in memory. */
        const val PART_SIZE = 8 * 1024 * 1024
        private const val CHUNK = 64 * 1024
        private val KEPT_WITHOUT_PREVIEW = setOf("IMAGE_SIZE", "IMAGE_ANIMATION")
    }
}
