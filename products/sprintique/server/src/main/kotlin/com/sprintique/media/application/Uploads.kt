package com.sprintique.media.application

import com.sprintique.media.domain.ContentCheck
import com.sprintique.media.domain.FileInspection
import com.sprintique.media.domain.InspectedFile
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import java.io.Closeable
import java.io.InputStream
import java.time.Instant
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

/** What the start of an upload settled: where the original goes and what the body must match. */
data class UploadPlan(
    val key: String,
    val name: String,
    val size: Long,
    val sha256: String,
    val targetType: String,
    /** False when the file is already stored: the body is then only checked against it, nothing is written. */
    val store: Boolean,
    /** The reservation's expiry: a body still arriving then is cut off. */
    val deadline: Instant = Instant.MAX,
)

/**
 * A body that passed inspection and is not yet published: its original waits in memory (small files and previewable
 * images) or as uploaded parts that no key points to yet. Closing it discards whatever was not published and gives
 * its memory back.
 */
class ReceivedContent(
    val file: InspectedFile,
    val preview: ProcessedImage?,
    private val whole: ByteArray?,
    private val parts: ObjectWrite?,
    private val release: () -> Unit = {},
) : Closeable {
    private var closed = false

    /** Makes the original and its previews visible under their keys. */
    fun publish(storage: ObjectStoragePort, key: (String) -> String) {
        if (whole != null) storage.put(key("original"), whole, file.mime) else parts?.complete()
        if (preview != null) {
            storage.put(key("display"), preview.display, "image/webp")
            storage.put(key("thumb"), preview.thumb, "image/webp")
        }
    }

    override fun close() {
        if (closed) return
        closed = true
        parts?.let { runCatching { it.abort() } }
        release()
    }
}

/**
 * Receives upload bodies without holding a large one: the body streams through [ContentCheck] in parts of
 * [PART_SIZE] into a multipart write, and only after the size and SHA-256 match the reservation may the caller
 * publish it. Small files and previewable images up to [FileInspection.IMAGE_BYTES] are held whole — the images
 * because they are decoded into previews — within a process-wide budget of [HELD_BUDGET] bytes. No database
 * transaction is open while a body streams; a body that outlives its reservation, trickles in slower than
 * [MIN_RATE] bytes a second once [GRACE_NANOS] have passed, or is held and takes longer than [HELD_NANOS], is cut off.
 */
class Uploads(
    private val storage: ObjectStoragePort,
    private val images: ImageTranscoder,
    private val nanoTime: () -> Long = System::nanoTime,
    private val now: () -> Instant = Instant::now,
) {
    fun receive(plan: UploadPlan, body: InputStream): ReceivedContent {
        val check = ContentCheck(plan.name, plan.size)
        val type = check.type
        val held = plan.size <= PART_SIZE || (type.previewable && plan.size <= FileInspection.IMAGE_BYTES)
        val kept = plan.store && held
        val release = if (kept) reserveMemory(plan.size.toInt()) else ({})
        var handedOver = false
        var parts: ObjectWrite? = null
        try {
            parts = if (plan.store && !held) storage.startWrite(plan.key, type.mime) else null
            val buffer = ByteArray(
                if (kept) {
                    plan.size.toInt()
                } else if (parts != null) {
                    PART_SIZE
                } else {
                    CHUNK
                },
            )
            val filled = stream(plan, body, check, buffer, kept, parts)
            val file = check.finish()
            requireCondition(
                file.size == plan.size && file.sha256 == plan.sha256,
                422,
                "FILE_HASH",
                ContentCheck.CHANGED,
            )
            if (filled > 0) parts?.part(buffer, filled)
            val whole = if (kept) buffer else null
            val preview = if (whole != null && type.previewable) preview(whole, plan.targetType) else null
            handedOver = true
            return ReceivedContent(file, preview, whole, parts, release)
        } finally {
            if (!handedOver) {
                parts?.let { runCatching { it.abort() } }
                release()
            }
        }
    }

    /** Reads the body into [buffer], flushing full parts; returns how much of the last part is filled. */
    private fun stream(
        plan: UploadPlan,
        body: InputStream,
        check: ContentCheck,
        buffer: ByteArray,
        kept: Boolean,
        parts: ObjectWrite?,
    ): Int {
        val started = nanoTime()
        var filled = 0
        while (true) {
            val read = if (filled < buffer.size) body.read(buffer, filled, buffer.size - filled) else probe(body, check)
            if (read < 0) return filled
            check.update(buffer, filled, read)
            filled += read
            if (!kept && filled == buffer.size) {
                parts?.part(buffer, filled)
                filled = 0
            }
            requirePace(plan, check.size, started, kept)
        }
    }

    /** A held body fills its buffer exactly; one more byte means it is longer than reserved, and the check says so. */
    private fun probe(body: InputStream, check: ContentCheck): Int {
        val extra = body.read()
        if (extra >= 0) check.update(byteArrayOf(extra.toByte()), 0, 1)
        return -1
    }

    /** A held body occupies memory from its first byte, so it must also arrive within [HELD_NANOS]. */
    private fun requirePace(plan: UploadPlan, received: Long, started: Long, kept: Boolean) {
        requireCondition(now().isBefore(plan.deadline), 410, "UPLOAD_EXPIRED", "Срок загрузки истёк.")
        val elapsed = nanoTime() - started
        val slow = elapsed > GRACE_NANOS && received < MIN_RATE * (elapsed / NANOS)
        if (slow || (kept && elapsed > HELD_NANOS)) {
            throw ProblemException(
                REQUEST_TIMEOUT,
                "UPLOAD_TOO_SLOW",
                "Загрузка идёт слишком медленно. Проверьте связь.",
            )
        }
    }

    private fun reserveMemory(bytes: Int): () -> Unit {
        requireCondition(
            HELD.tryAcquire(bytes, WAIT_SECONDS, TimeUnit.SECONDS),
            503,
            "BUSY",
            "Сервис занят. Повторите через несколько секунд.",
        )
        var released = false
        return {
            if (!released) {
                released = true
                HELD.release(bytes)
            }
        }
    }

    /**
     * WebP previews of an image. A task keeps an image the decoder refuses for its size, animation or time as a
     * plain file; a map image or an avatar must be a still image within the bounds. Unreadable content fails.
     */
    private fun preview(bytes: ByteArray, targetType: String): ProcessedImage? = try {
        images.variants(bytes)
    } catch (problem: ProblemException) {
        when {
            targetType == "task" && problem.code in KEPT_WITHOUT_PREVIEW -> null

            // Out of time under load is not the image's fault: a map image or avatar may simply be sent again.
            problem.code == "IMAGE_TIMEOUT" -> throw ProblemException(429, "IMAGE_BUSY", BUSY_IMAGES)

            else -> throw problem
        }
    }

    companion object {
        /** Parts of the multipart write, and the most a large upload holds in memory. */
        const val PART_SIZE = 8 * 1024 * 1024

        /** Bytes all held uploads together may occupy; a new one waits a little, then is told to retry. */
        const val HELD_BUDGET = 96 * 1024 * 1024

        /** The slowest sustained upload accepted once the first minute has passed: 16 KiB a second. */
        const val MIN_RATE = 16L * 1024
        const val GRACE_NANOS = 60_000_000_000L

        /** How long a held body (at most 32 MiB) may take to arrive: five minutes. */
        const val HELD_NANOS = 300_000_000_000L
        private const val BUSY_IMAGES = "Сервис обрабатывает изображения. Повторите через несколько секунд."
        private const val NANOS = 1_000_000_000L
        private const val REQUEST_TIMEOUT = 408
        private const val WAIT_SECONDS = 20L
        private const val CHUNK = 64 * 1024
        private val HELD = Semaphore(HELD_BUDGET, true)
        private val KEPT_WITHOUT_PREVIEW = setOf("IMAGE_SIZE", "IMAGE_ANIMATION", "IMAGE_TIMEOUT")
    }
}
