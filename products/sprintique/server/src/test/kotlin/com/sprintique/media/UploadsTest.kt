package com.sprintique.media

import com.sprintique.media.application.ImageTranscoder
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.application.ObjectWrite
import com.sprintique.media.application.ProcessedImage
import com.sprintique.media.application.UploadPlan
import com.sprintique.media.application.Uploads
import com.sprintique.media.domain.FileInspection
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class UploadsTest {
    /** Records what reached storage, part by part. */
    private class RecordingStorage : ObjectStoragePort {
        val objects = mutableMapOf<String, ByteArray>()
        val parts = mutableListOf<Int>()
        var started = 0
        var aborted = 0

        override fun put(key: String, bytes: ByteArray, mime: String) {
            objects[key] = bytes
        }

        override fun startWrite(key: String, mime: String): ObjectWrite {
            started++
            val received = java.io.ByteArrayOutputStream()
            return object : ObjectWrite {
                var done = false

                override fun part(bytes: ByteArray, length: Int) {
                    parts += length
                    received.write(bytes, 0, length)
                }

                override fun complete() {
                    done = true
                    objects[key] = received.toByteArray()
                }

                override fun abort() {
                    if (!done) aborted++
                    done = true
                }
            }
        }

        override fun read(key: String, range: LongRange?): InputStream = ByteArrayInputStream(objects.getValue(key))

        override fun remove(key: String) {
            objects.remove(key)
        }

        override fun requireReady() = Unit
    }

    private class FakeImages(private val failure: String? = null) : ImageTranscoder {
        override fun avatar(bytes: ByteArray) = bytes

        override fun variants(bytes: ByteArray): ProcessedImage {
            if (failure != null) throw ProblemException(422, failure, "Изображение")
            return ProcessedImage(2, 1, byteArrayOf(1), byteArrayOf(2))
        }
    }

    private val png = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10) + ByteArray(64)

    private fun plan(name: String, bytes: ByteArray, store: Boolean = true, target: String = "task") =
        UploadPlan("k", name, bytes.size.toLong(), FileInspection.sha256Hex(bytes), target, store)

    @Test
    fun `a large body streams in parts and appears under its key only when published`() {
        val storage = RecordingStorage()
        val bytes = ByteArray(Uploads.PART_SIZE * 2 + 1234) { (it % 251).toByte() }
        val received = Uploads(storage, FakeImages()).receive(plan("archive.bin", bytes), ByteArrayInputStream(bytes))
        assertThat(storage.parts).containsExactly(Uploads.PART_SIZE, Uploads.PART_SIZE, 1234)
        assertThat(storage.objects).isEmpty()
        received.use { it.publish(storage) { variant -> "k/$variant" } }
        assertThat(storage.objects["k"]).isEqualTo(bytes)
        assertThat(storage.aborted).isZero()
    }

    @Test
    fun `a body that differs from the reservation is never published and its parts are discarded`() {
        val storage = RecordingStorage()
        val bytes = ByteArray(Uploads.PART_SIZE + 10)
        val changed = bytes.copyOf().also { it[it.size - 1] = 1 }
        assertThatThrownBy {
            Uploads(storage, FakeImages()).receive(plan("archive.bin", bytes), ByteArrayInputStream(changed))
        }.hasFieldOrPropertyWithValue("code", "FILE_HASH")
        assertThatThrownBy {
            Uploads(storage, FakeImages()).receive(plan("archive.bin", bytes), ByteArrayInputStream(bytes + 0))
        }.hasFieldOrPropertyWithValue("code", "FILE_HASH")
        assertThat(storage.aborted).isEqualTo(2)
        assertThat(storage.objects).isEmpty()
    }

    @Test
    fun `a wrong signature stops a large body at its head`() {
        val storage = RecordingStorage()
        val bytes = ByteArray(Uploads.PART_SIZE * 3)
        assertThatThrownBy {
            Uploads(storage, FakeImages()).receive(plan("clip.mp4", bytes), ByteArrayInputStream(bytes))
        }.hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThat(storage.parts).isEmpty()
        assertThat(storage.aborted).isEqualTo(1)
    }

    @Test
    fun `a stored file sent again is only checked, and a small file waits in memory`() {
        val storage = RecordingStorage()
        val bytes = "повтор".toByteArray()
        Uploads(storage, FakeImages()).receive(plan("a.txt", bytes, store = false), ByteArrayInputStream(bytes))
            .use { it.publish(storage) { variant -> "k/$variant" } }
        assertThat(storage.started).isZero()
        assertThat(storage.objects).isEmpty()
        Uploads(storage, FakeImages()).receive(plan("a.txt", bytes), ByteArrayInputStream(bytes))
            .use { it.publish(storage) { variant -> "k/$variant" } }
        assertThat(storage.started).isZero()
        assertThat(storage.objects["k/original"]).isEqualTo(bytes)
    }

    @Test
    fun `a task keeps an image too large to preview as a plain file, a map image must be previewable`() {
        val storage = RecordingStorage()
        val kept = Uploads(storage, FakeImages("IMAGE_SIZE")).receive(plan("big.png", png), ByteArrayInputStream(png))
        assertThat(kept.preview).isNull()
        assertThat(kept.file.mime).isEqualTo("image/png")
        assertThatThrownBy {
            Uploads(storage, FakeImages("IMAGE_SIZE"))
                .receive(plan("big.png", png, target = "map"), ByteArrayInputStream(png))
        }.hasFieldOrPropertyWithValue("code", "IMAGE_SIZE")
        assertThatThrownBy {
            Uploads(storage, FakeImages("IMAGE_DECODE")).receive(plan("bad.png", png), ByteArrayInputStream(png))
        }.hasFieldOrPropertyWithValue("code", "IMAGE_DECODE")
        val preview = Uploads(storage, FakeImages()).receive(plan("ok.png", png), ByteArrayInputStream(png))
        preview.use { it.publish(storage) { variant -> "k/$variant" } }
        assertThat(storage.objects.keys).containsExactlyInAnyOrder("k/original", "k/display", "k/thumb")
    }
}
