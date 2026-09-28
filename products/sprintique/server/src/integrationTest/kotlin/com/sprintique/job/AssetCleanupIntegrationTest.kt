package com.sprintique.job

import com.sprintique.database.IntegrationDatabase
import com.sprintique.job.application.AssetCleanup
import com.sprintique.job.infrastructure.WorkerRole
import com.sprintique.media.application.ObjectStoragePort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.util.UUID

/** J01–J03: the worker's narrow role, fenced cleanup of discarded files, retries after a storage outage. */
class AssetCleanupIntegrationTest {
    private val admin = IntegrationDatabase.admin
    private val projects = mutableListOf<String>()

    /** The queue is shared with the API suites that run next: no job of this class may stay due. */
    @AfterEach
    fun cancelJobs() {
        admin.transaction { tx ->
            tx.update(
                """
                UPDATE work.jobs SET state = 'cancelled' WHERE project_id = ANY($1) AND state IN ('pending', 'running')
                """.trimIndent(),
                projects,
            )
        }
    }

    private class RecordingStorage(private val failing: Boolean = false) : ObjectStoragePort {
        val removed = mutableListOf<String>()

        override fun put(key: String, bytes: ByteArray, mime: String) = Unit

        override fun get(key: String) = ByteArray(0)

        override fun remove(key: String) {
            check(!failing) { "synthetic S3 outage" }
            removed += key
        }

        override fun requireReady() = Unit
    }

    @Test
    fun `the worker role can only call queue functions and the runtime role is refused`() {
        WorkerRole.require(IntegrationDatabase.worker)
        assertThatThrownBy {
            WorkerRole.require(IntegrationDatabase.runtime)
        }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `a discarded file loses all its stored variants and becomes deleted`() {
        val (projectId, assetId, sha) = discarded("detached")
        val storage = RecordingStorage()
        assertThat(AssetCleanup(IntegrationDatabase.worker, storage).collectOne()).isTrue()
        assertThat(storage.removed).containsExactly(
            "assets/$projectId/$assetId/$sha/original",
            "assets/$projectId/$assetId/$sha/display",
            "assets/$projectId/$assetId/$sha/thumb",
        )
        assertThat(state(projectId, assetId)).isEqualTo("deleted")
        assertThat(job(projectId, assetId)["state"]).isEqualTo("done")
    }

    @Test
    fun `an attached file survives a stale cleanup job`() {
        val (projectId, assetId) = discarded("attached")
        val storage = RecordingStorage()
        assertThat(AssetCleanup(IntegrationDatabase.worker, storage).collectOne()).isTrue()
        assertThat(storage.removed).isEmpty()
        assertThat(state(projectId, assetId)).isEqualTo("attached")
    }

    @Test
    fun `a storage outage reschedules the job with its error`() {
        val (projectId, assetId) = discarded("detached")
        AssetCleanup(IntegrationDatabase.worker, RecordingStorage(failing = true)).collectOne()
        val row = job(projectId, assetId)
        assertThat(row["state"]).isEqualTo("pending")
        assertThat(row["attempts"]).isEqualTo(1)
        assertThat(row["last_error"]).isEqualTo("ASSET_GC_FAILED")
    }

    /** A project with one file in `state`, expired, and its due cleanup job. */
    private fun discarded(state: String): Triple<String, String, String> {
        val suffix = UUID.randomUUID().toString().take(8)
        val person = "person-$suffix"
        val workspace = UUID.randomUUID().toString()
        val project = "project-$suffix"
        val asset = "asset-$suffix"
        projects += project
        val sha = "a".repeat(64)
        admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject)
                VALUES ($1, 'human', 'Алиса', 'https://test.example', $1)
                """.trimIndent(),
                person,
            )
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Команда', $2)", workspace, person)
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, 'Проект', $3, 'JOB')",
                project,
                workspace,
                "jobs-$suffix",
            )
            tx.update(
                """
                INSERT INTO app.assets(project_id, id, target_type, target_id, actor_id, name, size, sha256, state, expires_at)
                VALUES ($1, $2, 'task', 'task', $3, 'cleanup.txt', 15, $4, $5, clock_timestamp() - interval '1 minute')
                """.trimIndent(),
                project,
                asset,
                person,
                sha,
                state,
            )
            tx.update(
                """
                INSERT INTO work.jobs(project_id, kind, dedupe_key, payload, available_at)
                VALUES ($1, 'asset.gc', $2, jsonb_build_object('assetId', $2::text), clock_timestamp() - interval '1 minute')
                """.trimIndent(),
                project,
                asset,
            )
        }
        return Triple(project, asset, sha)
    }

    private fun state(projectId: String, assetId: String) = admin.transaction { tx ->
        tx.row("SELECT state FROM app.assets WHERE project_id = $1 AND id = $2", projectId, assetId)!!.string("state")
    }

    private fun job(projectId: String, assetId: String) = admin.transaction { tx ->
        tx.row(
            "SELECT state, attempts, last_error FROM work.jobs WHERE project_id = $1 AND payload->>'assetId' = $2",
            projectId,
            assetId,
        )!!
    }
}
