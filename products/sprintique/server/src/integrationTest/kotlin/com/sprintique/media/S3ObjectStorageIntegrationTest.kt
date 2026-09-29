package com.sprintique.media

import com.sprintique.configuration.StorageProperties
import com.sprintique.media.application.ObjectWrite
import com.sprintique.media.infrastructure.S3ObjectStorageAdapter
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

/** Runs against the private test bucket named by SPRINTIQUE_TEST_S3_CONFIG; a skip is reported as not passed. */
class S3ObjectStorageIntegrationTest {
    private val storage: S3ObjectStorageAdapter by lazy {
        val file = System.getenv("SPRINTIQUE_TEST_S3_CONFIG")
        assumeTrue(
            file != null && Files.isRegularFile(Path.of(file)),
            "SPRINTIQUE_TEST_S3_CONFIG is not set: object storage NOT verified",
        )
        val config = JsonMapper.builder().build().readTree(Path.of(file).toFile())
        S3ObjectStorageAdapter(
            StorageProperties(
                endpoint = config.path("endpoint").asString(),
                region = config.path("region").asString(),
                bucket = config.path("bucket").asString(),
                accessKeyId = config.path("accessKeyId").asString(),
                secretAccessKey = config.path("secretAccessKey").asString(),
            ),
        )
    }
    private val prefix = "integration-test/${UUID.randomUUID()}"

    @Test
    fun `an object is stored, read back and removed idempotently`() {
        storage.requireReady()
        val key = "$prefix/original"
        storage.put(key, "содержимое".toByteArray(), "text/plain")
        assertThat(storage.read(key).use { it.readAllBytes() }.decodeToString()).isEqualTo("содержимое")
        storage.remove(key)
        storage.remove(key)
        assertThatThrownBy { storage.read(key).close() }.isNotNull()
    }

    @Test
    fun `a multipart write appears only when complete and is read back in ranges`() {
        val key = "$prefix/large"
        val part = ByteArray(ObjectWrite.MIN_PART) { (it % 251).toByte() }
        val tail = ByteArray(1000) { 7 }
        try {
            storage.startWrite(key, "application/octet-stream").use { write ->
                write.part(part, part.size)
                write.part(tail, tail.size)
                assertThatThrownBy { storage.read(key).close() }.isNotNull()
                write.complete()
            }
            val length = part.size.toLong() + tail.size
            assertThat(storage.read(key, 0L..9L).use { it.readAllBytes() }).isEqualTo(part.copyOf(10))
            val across = storage.read(key, part.size - 5L..part.size + 4L).use { it.readAllBytes() }
            assertThat(across).isEqualTo(part.copyOfRange(part.size - 5, part.size) + tail.copyOf(5))
            assertThat(storage.read(key, length - 1..length - 1).use { it.readAllBytes() }).containsExactly(7)
            assertThat(storage.read(key).use { it.readAllBytes() }.size.toLong()).isEqualTo(length)
        } finally {
            storage.remove(key)
        }
    }

    @Test
    fun `an aborted or abandoned multipart write leaves nothing behind`() {
        val aborted = "$prefix/aborted"
        storage.startWrite(aborted, "application/octet-stream").use { it.part(ByteArray(16), 16) }
        assertThatThrownBy { storage.read(aborted).close() }.isNotNull()

        // A process that dies mid-upload never aborts: removing the key abandons its parts.
        val abandoned = "$prefix/abandoned"
        val write = storage.startWrite(abandoned, "application/octet-stream")
        write.part(ByteArray(16), 16)
        storage.remove(abandoned)
        assertThatThrownBy { write.complete() }.isNotNull()
        assertThatThrownBy { storage.read(abandoned).close() }.isNotNull()
    }
}
