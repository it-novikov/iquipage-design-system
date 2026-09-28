package com.sprintique.media

import com.sprintique.configuration.StorageProperties
import com.sprintique.media.domain.FileInspection
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

    private companion object {
        const val NOT_CONFIGURED = "SPRINTIQUE_TEST_S3_CONFIG is not set: object storage NOT verified"
    }

    @Test
    fun `an object is stored, read back and removed idempotently`() {
        storage.requireReady()
        val key = "$prefix/original"
        storage.put(key, "содержимое".toByteArray(), "text/plain")
        assertThat(storage.get(key).decodeToString()).isEqualTo("содержимое")
        storage.remove(key)
        storage.remove(key)
        assertThatThrownBy { storage.get(key) }.isNotNull()
    }

    @Test
    fun `a read stops at the canonical file limit`() {
        val key = "$prefix/oversized"
        storage.put(key, ByteArray(FileInspection.FILE_LIMIT + 1), "application/octet-stream")
        try {
            assertThatThrownBy { storage.get(key) }.hasMessageContaining("canonical limit")
        } finally {
            storage.remove(key)
        }
    }
}
