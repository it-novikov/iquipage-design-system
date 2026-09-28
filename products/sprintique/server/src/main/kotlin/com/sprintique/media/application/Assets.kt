package com.sprintique.media.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.media.domain.FileInspection
import com.sprintique.media.domain.StoredObjects
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.time.Instant

/** A reservation of an upload before its bytes arrive. */
data class Reservation(
    val id: String,
    val targetType: String,
    val targetId: String,
    val name: String,
    val size: Long,
    val sha256: String,
)

/** The outcome of an upload: its metadata, or a rejection recorded as quarantine before the error is reported. */
sealed interface UploadResult {
    data class Stored(val asset: Map<String, Any?>) : UploadResult

    data class Rejected(val problem: ProblemException) : UploadResult
}

/**
 * Private files of tasks, maps and project avatars. Every media mutation locks project, then asset — the same order as
 * task, map and avatar saves — and rechecks credentials and policy after waiting: admission is not a grant.
 */
object Assets {
    private const val QUOTA_BYTES = 5L * 1024 * 1024 * 1024
    private const val PENDING_UPLOADS = 100
    const val MAP_IMAGE_LIMIT = 40

    private val PROJECTION = """
        id, project_id AS "projectId", target_type AS "targetType", target_id AS "targetId", actor_id AS "actorId", name, size, sha256,
        state, mime, image, width, height, revision, created_at AS "createdAt", expires_at AS "expiresAt"
    """.trimIndent()

    fun key(
        asset: Row,
        variant: String,
    ) = StoredObjects.key(asset.string("projectId"), asset.string("id"), asset.string("sha256"), variant)

    /** What clients see: a ready upload is "staged", images always have a WebP preview. */
    fun publicMetadata(asset: Row): Map<String, Any?> {
        val values = LinkedHashMap<String, Any?>(asset)
        if (asset.string("targetType") == "task") values["taskId"] = asset.string("targetId")
        if (asset.string("state") == "ready") values["state"] = "staged"
        values["previewMime"] = if (asset.boolean("image")) "image/webp" else null
        return values
    }

    private fun row(tx: Transaction, projectId: String, id: String, lock: Boolean = false): Row {
        val found = tx.row(
            "SELECT $PROJECTION FROM app.assets WHERE project_id = $1 AND id = $2${if (lock) " FOR UPDATE" else ""}",
            projectId,
            id,
        )
        return requirePresent(found, 404, "FILE_NOT_FOUND", "Файл недоступен.")
    }

    private fun access(tx: Transaction, actor: Actor, projectId: String, targetType: String, write: Boolean) {
        val capability = when {
            targetType == "map" -> if (write) Capability.MAPS_WRITE else Capability.MAPS_READ
            write -> Capability.TASKS_WRITE
            else -> Capability.TASKS_READ
        }
        ProjectAccess.authorize(tx, actor, projectId, capability)
        if (targetType == "project-avatar") {
            ProjectAccess.authorize(
                tx,
                actor,
                projectId,
                if (write) Capability.CATALOG_WRITE else Capability.TASKS_READ,
            )
        }
    }

    private fun lockProject(tx: Transaction, actor: Actor, projectId: String, targetType: String) {
        access(tx, actor, projectId, targetType, true)
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        ProjectAccess.requireActiveCredential(tx, actor)
        access(tx, actor, projectId, targetType, true)
    }

    private fun writable(tx: Transaction, actor: Actor, projectId: String, id: String): Row {
        val initial = row(tx, projectId, id)
        lockProject(tx, actor, projectId, initial.string("targetType"))
        return row(tx, projectId, id, lock = true)
    }

    private fun isFreshUploadOf(asset: Row, actor: Actor) =
        asset.string(
            "state",
        ) == "ready" && asset.string("actorId") == actor.id && asset.instant("expiresAt").isAfter(Instant.now())

    fun reserve(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        input: Reservation,
        key: String,
        ledger: CommandLedger,
    ): Any {
        lockProject(tx, actor, projectId, input.targetType)
        return ledger.idempotent(tx, actor, projectId, "asset.reserve:${input.id}", key, input) {
            val quota = tx.row(
                """
                SELECT coalesce(sum(size), 0)::float8 AS bytes,
                       count(*) FILTER (WHERE state IN ('uploading', 'ready') AND actor_id = $2)::int AS pending
                FROM app.assets WHERE project_id = $1 AND state <> 'deleted'
                """.trimIndent(),
                projectId, actor.id,
            )!!
            requireCondition(
                quota.double("bytes") + input.size <= QUOTA_BYTES && quota.int("pending") < PENDING_UPLOADS,
                422,
                "STORAGE_QUOTA",
                "Лимит хранения или незавершённых загрузок исчерпан.",
            )
            tx.update(
                """
                INSERT INTO app.assets(project_id, id, target_type, target_id, actor_id, name, size, sha256)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """.trimIndent(),
                projectId, input.id, input.targetType, input.targetId, actor.id, input.name, input.size, input.sha256,
            )
            val reserved = row(tx, projectId, input.id)
            CleanupJobs.enqueue(tx, projectId, input.id, 1, reserved.instant("expiresAt"))
            AuditTrail.record(tx, actor, projectId, "asset.reserved", input.id, 1)
            publicMetadata(reserved)
        }
    }

    /**
     * Stores the bytes of a reservation. A rejected file (wrong hash, unreadable image, expired reservation) is
     * quarantined in this transaction and reported after it commits, so the rejection itself is durable.
     */
    fun upload(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        bytes: ByteArray,
        storage: ObjectStoragePort,
        images: ImageTranscoder,
    ): UploadResult {
        val asset = writable(tx, actor, projectId, id)
        requireCondition(asset.string("actorId") == actor.id, 403, "FILE_OWNER", "Загрузку завершает её автор.")
        requireCondition(
            asset.string("state") in setOf("uploading", "ready", "attached"),
            409,
            "FILE_STATE",
            "Загрузка завершена или удалена. Выберите файл заново.",
        )
        try {
            val content = FileInspection.inspect(asset.string("name"), bytes)
            requireCondition(
                content.size.toLong() == asset.long("size") && content.sha256 == asset.string("sha256"),
                422,
                "FILE_HASH",
                "Содержимое загрузки изменилось. Выберите файл заново.",
            )
            if (asset.string("state") != "uploading") return UploadResult.Stored(publicMetadata(asset))
            requireCondition(
                asset.instant("expiresAt").isAfter(Instant.now()),
                410,
                "UPLOAD_EXPIRED",
                "Срок загрузки истёк.",
            )
            val processed = if (content.isImage) images.variants(bytes) else null
            requireCondition(
                asset.string("targetType") == "task" || content.isImage,
                422,
                "IMAGE_REQUIRED",
                "Для обложки карты и аватара нужно изображение.",
            )
            storage.put(key(asset, "original"), bytes, content.mime)
            if (processed != null) {
                storage.put(key(asset, "display"), processed.display, "image/webp")
                storage.put(key(asset, "thumb"), processed.thumb, "image/webp")
            }
            ProjectAccess.requireActiveCredential(tx, actor)
            access(tx, actor, projectId, asset.string("targetType"), true)
            tx.update(
                """
                UPDATE app.assets SET state = 'ready', revision = revision + 1, mime = $3, image = $4, width = $5, height = $6,
                       updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId, id, content.mime, content.isImage, processed?.width, processed?.height,
            )
            AuditTrail.record(tx, actor, projectId, "asset.ready", id, asset.long("revision") + 1)
            return UploadResult.Stored(publicMetadata(row(tx, projectId, id)))
        } catch (problem: ProblemException) {
            if (problem.status !in setOf(410, 422) || asset.string("state") != "uploading") throw problem
            val revision = asset.long("revision") + 1
            tx.update(
                """
                UPDATE app.assets SET state = 'quarantined', revision = revision + 1, expires_at = clock_timestamp(),
                       updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId, id,
            )
            AuditTrail.record(tx, actor, projectId, "asset.quarantined", id, revision)
            CleanupJobs.enqueue(tx, projectId, id, revision, Instant.now())
            return UploadResult.Rejected(problem)
        }
    }

    fun readable(tx: Transaction, actor: Actor, projectId: String, id: String): Row {
        val asset = row(tx, projectId, id)
        access(tx, actor, projectId, asset.string("targetType"), false)
        requireCondition(
            isFreshUploadOf(asset, actor) || asset.string("state") == "attached",
            404,
            "FILE_NOT_FOUND",
            "Файл недоступен.",
        )
        return asset
    }

    fun describe(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
    ) = publicMetadata(readable(tx, actor, projectId, id))

    fun discard(tx: Transaction, actor: Actor, projectId: String, id: String): Map<String, Boolean> {
        val asset = writable(tx, actor, projectId, id)
        requireCondition(
            asset.string("actorId") == actor.id,
            403,
            "FILE_OWNER",
            "Удалить несохранённую загрузку может её автор.",
        )
        requireCondition(asset.string("state") != "attached", 409, "FILE_ATTACHED", "Сначала уберите файл из объекта.")
        if (asset.string("state") in setOf("uploading", "ready")) {
            val revision = asset.long("revision") + 1
            tx.update(
                """
                UPDATE app.assets SET state = 'detached', expires_at = clock_timestamp(), revision = revision + 1
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId, id,
            )
            AuditTrail.record(tx, actor, projectId, "asset.discarded", id, revision)
            CleanupJobs.enqueue(tx, projectId, id, revision, Instant.now())
        }
        return mapOf("discarded" to true)
    }

    private fun lockedRows(tx: Transaction, projectId: String, ids: Collection<String>): List<Row> =
        if (ids.isEmpty()) {
            emptyList()
        } else {
            tx.rows(
                "SELECT $PROJECTION FROM app.assets WHERE project_id = $1 AND id = ANY($2) ORDER BY id FOR UPDATE",
                projectId,
                ids.sorted(),
            )
        }

    private fun detach(tx: Transaction, projectId: String, asset: Row) {
        val expires = tx.row(
            """
            UPDATE app.assets SET state = 'detached', revision = revision + 1, updated_at = clock_timestamp(),
                   expires_at = clock_timestamp() + interval '24 hours'
            WHERE project_id = $1 AND id = $2 RETURNING expires_at AS expires
            """.trimIndent(),
            projectId, asset.string("id"),
        )!!.instant("expires")
        CleanupJobs.enqueue(tx, projectId, asset.string("id"), asset.long("revision") + 1, expires)
    }

    private fun attach(tx: Transaction, projectId: String, id: String) {
        tx.update(
            """
            UPDATE app.assets SET state = 'attached', revision = revision + 1, updated_at = clock_timestamp() WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            projectId, id,
        )
    }

    /** The files and cover of a task, inside the task's own transaction (including planning commits). */
    fun linkTaskAssets(tx: Transaction, actor: Actor, projectId: String, taskId: String, media: TaskMedia) {
        val old = tx.row(
            "SELECT attachment_ids AS ids FROM app.tasks WHERE project_id = $1 AND id = $2",
            projectId,
            taskId,
        )
        val previous = requirePresent(old, 404, "TASK_NOT_FOUND", "Задача недоступна.").strings("ids")
        requireCondition(
            media.coverAttachmentId == null || media.coverAttachmentId in media.attachmentIds,
            422,
            "TASK_COVER",
            "Обложка должна быть вложением задачи.",
        )
        requireCondition(
            media.coverCropAttachmentId == null || media.coverCropAttachmentId == media.coverAttachmentId,
            422,
            "TASK_CROP",
            "Кадр относится к другой обложке.",
        )
        val rows = lockedRows(tx, projectId, (previous + media.attachmentIds).toSet())
        for (id in media.attachmentIds) {
            val asset = rows.firstOrNull { it.string("id") == id }
            val usable = asset != null && asset.string("targetType") == "task" && asset.string("targetId") == taskId &&
                ((asset.string("state") == "attached" && id in previous) || isFreshUploadOf(asset, actor))
            requireCondition(usable, 422, "TASK_FILE_ACCESS", "Файл недоступен или срок загрузки истёк.")
            if (id == media.coverAttachmentId) {
                requireCondition(
                    asset.boolean("image"),
                    422,
                    "TASK_COVER",
                    "Обложкой может быть только проверенное изображение.",
                )
            }
        }
        for (asset in rows) {
            val id = asset.string("id")
            val state = when {
                id in media.attachmentIds -> "attached"
                id in previous -> "detached"
                else -> asset.string("state")
            }
            if (state == asset.string("state")) continue
            val expires = tx.row(
                """
                UPDATE app.assets SET state = $3, revision = revision + 1, updated_at = clock_timestamp(),
                       expires_at = clock_timestamp() + interval '24 hours'
                WHERE project_id = $1 AND id = $2 RETURNING expires_at AS expires
                """.trimIndent(),
                projectId, id, state,
            )!!.instant("expires")
            if (state == "detached") CleanupJobs.enqueue(tx, projectId, id, asset.long("revision") + 1, expires)
        }
        tx.update(
            """
            UPDATE app.tasks SET attachment_ids = $3, cover_attachment_id = $4, cover_crop = $5 WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            projectId, taskId, media.attachmentIds, media.coverAttachmentId, media.coverCrop,
        )
    }

    /** Map history pins referenced images; deleting a note does not corrupt an immutable version. */
    fun linkMapAssets(tx: Transaction, actor: Actor, projectId: String, mapId: String, ids: List<String>) {
        requireCondition(ids.size <= MAP_IMAGE_LIMIT, 422, "MAP_IMAGE_LIMIT", "На карте может быть до 40 изображений.")
        val unique = ids.toSortedSet()
        if (unique.isEmpty()) return
        val rows = lockedRows(tx, projectId, unique)
        requireCondition(rows.size == unique.size, 422, "MAP_FILE_ACCESS", "Изображение недоступно.")
        for (asset in rows) {
            val usable = asset.boolean(
                "image",
            ) && asset.string("targetType") == "map" && asset.string("targetId") == mapId &&
                (asset.string("state") == "attached" || isFreshUploadOf(asset, actor))
            requireCondition(
                usable,
                422,
                "MAP_FILE_ACCESS",
                "Изображение не принадлежит этой карте или срок загрузки истёк.",
            )
            if (asset.string("state") == "ready") attach(tx, projectId, asset.string("id"))
        }
    }

    /** The project's avatar, under the project lock; no private file can be borrowed from a task or another project. */
    fun linkProjectAvatar(tx: Transaction, actor: Actor, projectId: String, id: String?) {
        val previous = tx.row(
            "SELECT avatar_asset_id AS id FROM app.projects WHERE id = $1",
            projectId,
        )!!.stringOrNull("id")
        val rows = lockedRows(tx, projectId, listOfNotNull(previous, id).toSet())
        if (id != null) {
            val asset = rows.firstOrNull { it.string("id") == id }
            val usable = asset != null && asset.boolean("image") && asset["width"] == asset["height"] &&
                asset.string("targetType") == "project-avatar" && asset.string("targetId") == projectId &&
                ((previous == id && asset.string("state") == "attached") || isFreshUploadOf(asset, actor))
            requireCondition(usable, 422, "PROJECT_AVATAR", "Выберите квадратное изображение через редактор аватара.")
            if (asset.string("state") != "attached") attach(tx, projectId, id)
        }
        if (previous != null && previous != id) detach(tx, projectId, rows.first { it.string("id") == previous })
        tx.update("UPDATE app.projects SET avatar_asset_id = $2 WHERE id = $1", projectId, id)
    }
}

/** The media fields of a task write. `coverCrop` is kept as the client sent it, after validation. */
data class TaskMedia(
    val attachmentIds: List<String>,
    val coverAttachmentId: String?,
    val coverCrop: Any?,
    val coverCropAttachmentId: String?,
)

/** The only producer of cleanup jobs is typed application code, never job JSON from the network. */
object CleanupJobs {
    fun enqueue(tx: Transaction, projectId: String, assetId: String, revision: Long, at: Instant) {
        tx.update(
            """
            INSERT INTO work.jobs(project_id, kind, dedupe_key, payload, available_at) VALUES ($1, 'asset.gc', $2, $3, $4)
            ON CONFLICT (project_id, kind, dedupe_key) DO NOTHING
            """.trimIndent(),
            projectId, "$assetId:$revision", mapOf("assetId" to assetId), at,
        )
    }
}
