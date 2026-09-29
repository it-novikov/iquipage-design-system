package com.sprintique.media

import com.sprintique.command.CommandLedger
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.media.application.Assets
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.application.ObjectWrite
import com.sprintique.media.application.Publishing
import com.sprintique.media.application.Reservation
import com.sprintique.media.application.UploadStart
import com.sprintique.media.application.Uploads
import com.sprintique.media.infrastructure.ImageIoImageTranscoder
import com.sprintique.task.application.Tasks
import com.sprintique.task.domain.TaskContent
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.HexFormat
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * R4-B03 and R1: an upload takes the project lock first and the file second, and only for short transactions. While its
 * objects are written to storage it is `publishing` and holds no lock: task saves go on, the file cannot be attached
 * or discarded until it is ready.
 */
class MediaLockIntegrationTest {
    private val runtime = IntegrationDatabase.runtime
    private val ledger = CommandLedger(JsonMapper.builder().build())
    private val bytes = "Isolated media lock regression".toByteArray()

    /** Stalls the first write until released, then keeps it. */
    private class StallingStorage : ObjectStoragePort {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)

        override fun put(key: String, bytes: ByteArray, mime: String) {
            entered.countDown()
            release.await(WAIT, TimeUnit.SECONDS)
        }

        override fun startWrite(key: String, mime: String): ObjectWrite = error("A small file is written whole")

        override fun read(key: String, range: LongRange?): InputStream = ByteArrayInputStream(ByteArray(0))

        override fun remove(key: String) = Unit

        override fun requireReady() = Unit
    }

    @Test
    fun `a publishing upload holds no lock, and its file is attachable only once ready`() {
        val (actor, projectId) = seed()
        val sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
        asPerson(actor) { tx ->
            Assets.reserve(
                tx,
                actor,
                projectId,
                Reservation("concurrent-file", "task", "lock-task", "lock.txt", bytes.size.toLong(), sha),
                UUID.randomUUID().toString(),
                ledger,
            )
        }
        asPerson(actor) { tx -> Tasks.put(tx, actor, projectId, "lock-task", 0, content()) }
        val storage = StallingStorage()
        Executors.newVirtualThreadPerTaskExecutor().use { executor ->
            val upload = executor.submit<Any> {
                val start = asPerson(actor) { tx ->
                    Assets.startUpload(tx, actor, projectId, "concurrent-file", bytes.size.toLong())
                }
                val plan = (start as UploadStart.Accepted).plan
                Uploads(storage, ImageIoImageTranscoder()).receive(plan, ByteArrayInputStream(bytes)).use { content ->
                    val step = asPerson(actor) { tx ->
                        Assets.startPublishing(tx, actor, projectId, "concurrent-file", content)
                    } as Publishing.Go
                    content.publish(storage) { variant -> "k/$variant" }
                    asPerson(actor) { tx ->
                        Assets.finishPublishing(tx, actor, projectId, "concurrent-file", step, content)
                    }
                }
            }
            try {
                assertThat(storage.entered.await(WAIT, TimeUnit.SECONDS)).isTrue()
                // Nothing waits on the stalled storage write: another save of the task commits at once.
                val other = executor.submit<Any> {
                    asPerson(actor) { tx -> Tasks.put(tx, actor, projectId, "lock-task", 1, content(title = "Другое")) }
                }
                other.get(WAIT, TimeUnit.SECONDS)
                assertThatThrownBy {
                    asPerson(actor) { tx ->
                        Tasks.put(tx, actor, projectId, "lock-task", 2, content(listOf("concurrent-file")))
                    }
                }.hasFieldOrPropertyWithValue("code", "TASK_FILE_ACCESS")
                assertThatThrownBy {
                    asPerson(actor) { tx -> Assets.discard(tx, actor, projectId, "concurrent-file") }
                }.hasFieldOrPropertyWithValue("code", "FILE_BUSY")
            } finally {
                storage.release.countDown()
            }
            upload.get(WAIT, TimeUnit.SECONDS)
            val saved = asPerson(actor) { tx ->
                Tasks.put(tx, actor, projectId, "lock-task", 2, content(listOf("concurrent-file")))
            }
            @Suppress("UNCHECKED_CAST")
            assertThat((saved as Map<String, Any?>)["attachmentIds"]).isEqualTo(listOf("concurrent-file"))
        }
    }

    private fun <T> asPerson(actor: Actor, block: (Transaction) -> T): T = runtime.transaction { tx ->
        tx.row("SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', '', true)", actor.id)
        block(tx)
    }

    private fun content(attachments: List<String> = emptyList(), title: String = "Lock task") = TaskContent(
        attachmentIds = attachments,
        coverAttachmentId = null,
        coverCrop = null,
        coverCropAttachmentId = null,
        title = title,
        description = "",
        status = "ready",
        type = "task",
        priority = "normal",
        ownerId = null,
        due = null,
        rank = 1024.0,
        parentId = null,
        releaseId = null,
        tagIds = emptyList(),
    )

    /** A person with a live session who administers a fresh project. */
    private fun seed(): Pair<Actor, String> {
        val suffix = UUID.randomUUID().toString().take(8)
        val person = "person-$suffix"
        val credential = "credential-$suffix"
        val workspace = UUID.randomUUID().toString()
        val project = "project-$suffix"
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO auth.principals(id, kind, name, issuer, subject)
                VALUES ($1, 'human', 'Алиса', 'https://test.example', $1)
                """.trimIndent(),
                person,
            )
            tx.update(
                """
                INSERT INTO auth.credentials(id, principal_id, token_hash, kind, csrf, initiator_id, expires_at)
                VALUES ($1, $2, $3, 'session', 'csrf', $2, clock_timestamp() + interval '1 hour')
                """.trimIndent(),
                credential,
                person,
                "hash-$suffix",
            )
            tx.update("INSERT INTO app.workspaces(id, name, created_by) VALUES ($1, 'Команда', $2)", workspace, person)
            tx.update(
                "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1, $2, 'admin')",
                workspace,
                person,
            )
            tx.update(
                "INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2, 'Проект', $3, 'LCK')",
                project,
                workspace,
                "locks-$suffix",
            )
            tx.update(
                "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'admin')",
                project,
                person,
            )
        }
        return Actor(person, "Алиса", PrincipalKind.HUMAN, credential, "csrf", null, emptySet(), person) to project
    }

    private companion object {
        const val WAIT = 10L
    }
}
