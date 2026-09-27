package com.sprintique.media.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.media.application.Assets
import com.sprintique.media.application.ImageTranscoder
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.application.Reservation
import com.sprintique.media.application.UploadResult
import com.sprintique.media.domain.FileInspection
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.web.RequestValidationException
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
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
    @field:Min(1) @field:Max(FileInspection.FILE_LIMIT.toLong())
    val size: Long,
    @field:Pattern(regexp = "^[a-f0-9]{64}$")
    val sha256: String,
)

/** Private files: reservations, uploads with full validation, previews and originals for people who may read them. */
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
            "imagesOnlyForCover" to true,
        )
    }

    @PostMapping("/api/v1/projects/{projectId}/assets")
    @Accepts(AssetReservationRequest::class)
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

    /** A rejected file is quarantined in the transaction; the error reaches the client after that commit. */
    @PutMapping(
        "/api/v1/projects/{projectId}/assets/{id}/content",
        consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE],
    )
    fun upload(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: ByteArray?,
        request: HttpServletRequest,
    ): Any {
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        requireCondition(body != null, 400, "FILE_BODY", "Передайте содержимое файла.")
        val result = requests.run(
            request,
        ) { tx, actor -> Assets.upload(tx, actor, projectId, id, body, requireStorage(), images) }
        return when (result) {
            is UploadResult.Stored -> result.asset
            is UploadResult.Rejected -> throw result.problem
        }
    }

    @GetMapping("/api/v1/projects/{projectId}/assets/{id}/{variant}")
    fun download(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @PathVariable variant: String,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        if (variant !in VARIANTS) throw RequestValidationException()
        val asset = requests.run(
            request,
        ) { tx, actor -> Assets.readable(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id)) }
        requireCondition(
            variant == "original" || asset.boolean("image"),
            404,
            "FILE_VARIANT",
            "Предпросмотр недоступен.",
        )
        val bytes = requireStorage().get(Assets.key(asset, variant))
        // Rechecked after storage I/O: a revoked session cannot finish a later download.
        requests.run(request) { tx, actor -> Assets.readable(tx, actor, projectId, id) }
        val type = if (variant == "original") asset.string("mime") else "image/webp"
        val name = URLEncoder.encode(asset.string("name"), Charsets.UTF_8).replace("+", "%20")
            .replace("'", "%27").replace("(", "%28").replace(")", "%29").replace("*", "%2A")
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(type))
            .header("Content-Security-Policy", "default-src 'none'; sandbox")
            .header("Content-Disposition", "attachment; filename=\"download\"; filename*=UTF-8''$name")
            .body(bytes)
    }

    private companion object {
        val VARIANTS = setOf("original", "display", "thumb")
    }
}
