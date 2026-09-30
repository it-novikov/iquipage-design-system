package com.sprintique.web

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.problem.ProblemException
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.Base64

/**
 * The built interface. Only content-addressed build assets are cached, as immutable with an ETag; HTML, API, private
 * media and missing files keep the no-store default.
 */
@RestController
@Profile("api")
class StaticWebController(properties: SprintiqueProperties) {
    private val root: Path? = properties.webRoot.takeIf(String::isNotEmpty)?.let {
        Path.of(it).toAbsolutePath().normalize()
    }

    /** The interface; `/oauth/authorize` is its consent screen for OAuth clients, the same page on another path. */
    @GetMapping("/", "/oauth/authorize")
    fun index(): ResponseEntity<ByteArray> = html("index.html")

    /** Public documents required before a person chooses a sign-in method. */
    @GetMapping("/about")
    fun about(): ResponseEntity<ByteArray> = html("about.html")

    @GetMapping("/privacy")
    fun privacy(): ResponseEntity<ByteArray> = html("privacy.html")

    @GetMapping("/terms")
    fun terms(): ResponseEntity<ByteArray> = html("terms.html")

    @GetMapping("/favicon.ico")
    fun favicon(): ResponseEntity<Void> = ResponseEntity.noContent().build()

    @GetMapping("/assets/{file}")
    fun asset(
        @PathVariable file: String,
        @RequestHeader("If-None-Match", required = false) ifNoneMatch: String?,
    ): ResponseEntity<ByteArray> {
        val match = ASSET.matchEntire(file) ?: throw notFound()
        val path = requireRoot().resolve("assets").resolve(file).normalize()
        if (!path.startsWith(requireRoot().resolve("assets")) || !Files.isRegularFile(path)) throw notFound()
        val bytes = Files.readAllBytes(path)
        val type = MediaType.parseMediaType(TYPES.getValue(match.groupValues[1]))
        if (!HASHED.containsMatchIn(file)) return ResponseEntity.ok().contentType(type).body(bytes)
        val etag =
            "\"" +
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(bytes),
                ) +
                "\""
        val candidates = ifNoneMatch.orEmpty().split(',').map { it.trim().removePrefix("W/") }
        val builder = if (etag in candidates ||
            "*" in candidates
        ) {
            ResponseEntity.status(HttpStatus.NOT_MODIFIED)
        } else {
            ResponseEntity.ok()
        }
        builder.header("Cache-Control", "public, max-age=31536000, immutable").eTag(etag)
        return if (etag in candidates || "*" in candidates) builder.build() else builder.contentType(type).body(bytes)
    }

    private fun requireRoot(): Path = root ?: throw notFound()

    private fun html(name: String): ResponseEntity<ByteArray> {
        val file = requireRoot().resolve(name)
        if (!Files.isRegularFile(file)) throw notFound()
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(Files.readAllBytes(file))
    }

    private fun notFound() = ProblemException(404, "NOT_FOUND", "Файл недоступен.")

    private companion object {
        val ASSET = Regex("^[A-Za-z0-9_-]+\\.(js|css|woff2|webp|png|svg)$")
        val HASHED = Regex("-[A-Za-z0-9_-]{8,}\\.(?:js|css|woff2|webp|png|svg)$")
        val TYPES = mapOf(
            "js" to "text/javascript",
            "css" to "text/css",
            "woff2" to "font/woff2",
            "webp" to "image/webp",
            "png" to "image/png",
            "svg" to "image/svg+xml",
        )
    }
}
