package com.sprintique.media.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.database.Row
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.media.application.Assets
import com.sprintique.media.application.ImageTranscoder
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.application.Publishing
import com.sprintique.media.application.ReceivedContent
import com.sprintique.media.application.Reservation
import com.sprintique.media.application.UploadResult
import com.sprintique.media.application.UploadStart
import com.sprintique.media.application.Uploads
import com.sprintique.media.domain.FileInspection
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.web.RequestIds
import com.sprintique.web.RequestValidationException
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.util.DisconnectedClientHelper
import tools.jackson.databind.JsonNode
import tools.jackson.databind.annotation.JsonDeserialize
import java.net.URLEncoder

enum class AssetTarget(@get:JsonValue val wire: String) { TASK("task"), MAP("map"), PROJECT_AVATAR("project-avatar") }

@Schema(name = "AssetReservation")
data class AssetReservationRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val id: String,
    val targetType: AssetTarget,
    @field:Pattern(regexp = RESOURCE_ID)
    val targetId: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 180)
    @field:Pattern(regexp = "^[^\\x00-\\x1f\\x7f/\\\\]*$")
    val name: String,
    @field:Min(1) @field:Max(FileInspection.FILE_LIMIT)
    val size: Long,
    @field:Pattern(regexp = "^[a-f0-9]{64}$")
    val sha256: String,
)

/**
 * Private files: reservations, streamed uploads with full validation, and streamed downloads with byte ranges for the
 * people who may read them. No database transaction is open while a body is on the wire.
 */
@RestController
@Profile("api")
class MediaController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
    private val images: ImageTranscoder,
    private val storage: ObjectProvider<ObjectStoragePort>,
) {
    private fun requireStorage(): ObjectStoragePort =
        storage.ifAvailable ?: throw ProblemException(503, "STORAGE_UNAVAILABLE", "Файловый сервис не настроен.")

    @GetMapping("/api/v1/media/capabilities")
    fun capabilities(request: HttpServletRequest) = requests.run(request) { _, _ ->
        linkedMapOf(
            "available" to (storage.ifAvailable != null),
            "maxFileBytes" to FileInspection.FILE_LIMIT,
            "maxPreviewBytes" to FileInspection.IMAGE_BYTES,
            "imagesOnlyForCover" to true,
        )
    }

    @PostMapping("/api/v1/projects/{projectId}/assets")
    @Accepts(AssetReservationRequest::class)
    @Idempotent
    fun reserve(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            requireStorage()
            RequestInputs.id(projectId)
            val input = contracts.parse<AssetReservationRequest>(body)
            val reservation = Reservation(
                input.id,
                input.targetType.wire,
                input.targetId,
                input.name,
                input.size,
                input.sha256,
            )
            Assets.reserve(tx, actor, projectId, reservation, RequestInputs.idempotencyKey(request), ledger)
        }

    @GetMapping("/api/v1/projects/{projectId}/assets/{id}")
    fun describe(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        Assets.describe(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
    }

    @DeleteMapping("/api/v1/projects/{projectId}/assets/{id}")
    fun discard(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        Assets.discard(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
    }

    /**
     * The body streams: a short transaction opens the upload, the bytes go through inspection into storage with no
     * transaction open, a short transaction marks the upload `publishing`, the objects are completed with no
     * transaction or lock held, and a last short transaction marks it ready. A rejected file is quarantined in its
     * own transaction; the error reaches the client after that commit.
     */
    @PutMapping(
        "/api/v1/projects/{projectId}/assets/{id}/content",
        consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE],
    )
    fun upload(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest): Any {
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val storage = requireStorage()
        val start = requests.run(request) { tx, actor ->
            Assets.startUpload(tx, actor, projectId, id, request.contentLengthLong)
        }
        val plan = when (start) {
            is UploadStart.Accepted -> start.plan
            is UploadStart.Rejected -> throw start.problem
        }
        val content = try {
            Uploads(storage, images).receive(plan, request.inputStream)
        } catch (problem: ProblemException) {
            throw requests.run(request) { tx, actor -> Assets.rejectUpload(tx, actor, projectId, id, problem) }
        }
        val result = content.use { publish(request, projectId, id, it, storage) }
        return when (result) {
            is UploadResult.Stored -> result.asset
            is UploadResult.Rejected -> throw result.problem
        }
    }

    private fun publish(
        request: HttpServletRequest,
        projectId: String,
        id: String,
        content: ReceivedContent,
        storage: ObjectStoragePort,
    ): UploadResult {
        val step = requests.run(request) { tx, actor -> Assets.startPublishing(tx, actor, projectId, id, content) }
        if (step !is Publishing.Go) return (step as Publishing.Done).result
        var published = false
        try {
            content.publish(storage) { variant -> Assets.key(step.asset, variant) }
            published = true
        } finally {
            if (!published) {
                runCatching {
                    requests.run(request) { tx, _ -> Assets.failPublishing(tx, projectId, id, step) }
                }
            }
        }
        return requests.run(request) { tx, actor -> Assets.finishPublishing(tx, actor, projectId, id, step, content) }
    }

    /**
     * A file streams from storage in windows, with a single byte range when asked; access is checked again before
     * every window after the first, so a revoked session loses a long download within one window. Raster images and
     * video may be shown by the page; everything else is a download. Storage is reached before any header is set,
     * so a failure there is still an ordinary problem response.
     */
    @GetMapping("/api/v1/projects/{projectId}/assets/{id}/{variant}")
    fun download(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @PathVariable variant: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        if (variant !in VARIANTS) throw RequestValidationException()
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val storage = requireStorage()
        val asset = readable(request, projectId, id)
        requireCondition(
            variant == "original" || asset.boolean("image"),
            404,
            "FILE_VARIANT",
            "Предпросмотр недоступен.",
        )
        val key = Assets.key(asset, variant)
        val head = request.method == "HEAD"
        if (variant != "original") {
            val stream = if (head) null else storage.read(key)
            stream.use {
                response.setHeader("Content-Security-Policy", FILE_POLICY)
                response.contentType = "image/webp"
                response.setHeader("Content-Disposition", "inline")
                streaming(request, response) { it?.transferTo(response.outputStream) }
            }
            return
        }
        val mime = asset.string("mime")
        val length = asset.long("size")
        val etag = "\"${asset.string("sha256")}\""
        val selection = ByteRanges.select(request.getHeader("Range"), request.getHeader("If-Range"), etag, length)
        if (selection == ByteSelection.Unsatisfiable) {
            response.status = RANGE_NOT_SATISFIABLE
            response.setHeader("Content-Range", "bytes */$length")
            response.setContentLengthLong(0)
            return
        }
        val (first, last) = if (selection is ByteSelection.Part) selection.first to selection.last else 0L to length - 1
        var position = first
        var window = if (head) null else storage.read(key, first..minOf(last, first + WINDOW - 1))
        response.setHeader("Content-Security-Policy", FILE_POLICY)
        response.contentType = FileInspection.servedMime(mime)
        response.setHeader("Accept-Ranges", "bytes")
        // A body that fails midway must end with its connection, or the reader (nginx included) waits for the rest.
        response.setHeader("Connection", "close")
        response.setHeader("ETag", etag)
        response.setHeader("Content-Disposition", disposition(asset.string("name"), FileInspection.isInline(mime)))
        if (selection is ByteSelection.Part) {
            response.status = PARTIAL_CONTENT
            response.setHeader("Content-Range", "bytes $first-$last/$length")
        }
        response.setContentLengthLong(last - first + 1)
        streaming(request, response) {
            while (window != null) {
                val end = minOf(last, position + WINDOW - 1)
                window.use { it.transferTo(response.outputStream) }
                position = end + 1
                window = if (position > last) {
                    null
                } else {
                    readable(request, projectId, id)
                    storage.read(key, position..minOf(last, position + WINDOW - 1))
                }
            }
        }
    }

    /**
     * Writes a file body. Once its first bytes are sent nothing else may follow them — a problem body would land
     * inside the declared length and a resumed download would keep it — so any later failure ends the response
     * short, and the client sees fewer bytes than announced once the connection closes. A reader that leaves (a
     * player that seeks) and access that ends mid-download are ordinary ends; a storage or database failure is
     * logged without its message.
     */
    private inline fun streaming(request: HttpServletRequest, response: HttpServletResponse, body: () -> Unit) {
        try {
            body()
        } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
            if (!response.isCommitted) throw error
            if (error !is ProblemException && !DisconnectedClientHelper.isClientDisconnectedException(error)) {
                log.warn("File stream failed request_id={} error={}", RequestIds.of(request), error.javaClass.name)
            }
        }
    }

    private fun readable(request: HttpServletRequest, projectId: String, id: String): Row =
        requests.run(request) { tx, actor -> Assets.readable(tx, actor, projectId, id) }

    private fun disposition(name: String, inline: Boolean): String {
        val encoded = URLEncoder.encode(name, Charsets.UTF_8).replace("+", "%20")
            .replace("'", "%27").replace("(", "%28").replace(")", "%29").replace("*", "%2A")
        return "${if (inline) "inline" else "attachment"}; filename=\"download\"; filename*=UTF-8''$encoded"
    }

    private companion object {
        private val log = LoggerFactory.getLogger(MediaController::class.java)

        val VARIANTS = setOf("original", "display", "thumb")

        const val FILE_POLICY = "default-src 'none'; sandbox; frame-ancestors 'none'"

        /** The longest stretch served between two access checks. */
        const val WINDOW = 16L * 1024 * 1024
        const val PARTIAL_CONTENT = 206
        const val RANGE_NOT_SATISFIABLE = 416
    }
}
