package com.sprintique.media.domain

import com.sprintique.problem.requireCondition
import java.security.MessageDigest
import java.util.HexFormat

/** What an upload turned out to be, after its name and content were checked against each other. */
data class InspectedFile(val name: String, val mime: String, val size: Int, val isImage: Boolean, val sha256: String)

/**
 * The accepted formats and their signatures. The extension picks the declared type; the first bytes must agree.
 * Text must be valid UTF-8 without NUL bytes.
 */
object FileInspection {
    const val FILE_LIMIT = 10 * 1024 * 1024
    private const val NAME_LIMIT = 180
    private val CONTROL = Regex("[\\x00-\\x1f\\x7f/\\\\]")
    private val TYPES = mapOf(
        "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "webp" to "image/webp",
        "pdf" to "application/pdf",
        "txt" to "text/plain", "md" to "text/plain", "csv" to "text/plain", "json" to "text/plain",
        "log" to "text/plain",
        "zip" to "application/zip",
    )
    private val PNG = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)
    private val JPEG = byteArrayOf(-1, -40, -1)
    private val RIFF = byteArrayOf(82, 73, 70, 70)
    private val WEBP = "WEBP".toByteArray()
    private val PDF = byteArrayOf(37, 80, 68, 70, 45)
    private val ZIP_LOCAL = byteArrayOf(80, 75, 3, 4)
    private val ZIP_EMPTY = byteArrayOf(80, 75, 5, 6)

    /** The trimmed name, or a validation failure when it is empty, too long or contains control or path characters. */
    fun requireFileName(name: String): String {
        val trimmed = name.trim()
        requireCondition(
            trimmed.length in 1..NAME_LIMIT && !CONTROL.containsMatchIn(trimmed),
            400,
            "VALIDATION",
            "Проверьте поля запроса.",
        )
        return trimmed
    }

    fun inspect(name: String, bytes: ByteArray): InspectedFile {
        requireFileName(name)
        requireCondition(
            bytes.isNotEmpty() && bytes.size <= FILE_LIMIT,
            422,
            "FILE_SIZE",
            "Файл должен быть непустым и не больше 10 МБ.",
        )
        val mime = TYPES[name.substringAfterLast('.').lowercase()]
        requireCondition(mime != null, 422, "FILE_TYPE", "Этот формат файла не поддерживается.")
        requireCondition(contentMatches(mime, bytes), 422, "FILE_CONTENT", "Содержимое не соответствует формату файла.")
        return InspectedFile(name, mime, bytes.size, mime.startsWith("image/"), sha256Hex(bytes))
    }

    /** Whether the bytes start like one of the three image formats the image processing accepts. */
    fun isKnownImage(bytes: ByteArray): Boolean = startsWith(bytes, PNG) || startsWith(bytes, JPEG) || isWebp(bytes)

    fun sha256Hex(bytes: ByteArray): String = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(bytes),
    )

    private fun contentMatches(mime: String, bytes: ByteArray): Boolean = when (mime) {
        "image/png" -> startsWith(bytes, PNG)
        "image/jpeg" -> startsWith(bytes, JPEG)
        "image/webp" -> isWebp(bytes)
        "application/pdf" -> startsWith(bytes, PDF)
        "application/zip" -> startsWith(bytes, ZIP_LOCAL) || startsWith(bytes, ZIP_EMPTY)
        else -> isStrictUtf8(bytes) && bytes.none { it == 0.toByte() }
    }

    private fun isWebp(bytes: ByteArray) = startsWith(bytes, RIFF) && bytes.size >= WEBP_TAG_END &&
        bytes.copyOfRange(WEBP_TAG_START, WEBP_TAG_END).contentEquals(WEBP)

    private fun startsWith(bytes: ByteArray, prefix: ByteArray) =
        bytes.size >= prefix.size && prefix.indices.all { bytes[it] == prefix[it] }

    private fun isStrictUtf8(bytes: ByteArray): Boolean = try {
        Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes))
        true
    } catch (_: java.nio.charset.CharacterCodingException) {
        false
    }

    private const val WEBP_TAG_START = 8
    private const val WEBP_TAG_END = 12
}

/** Where the variants of an asset live in object storage. No client-provided value is part of the key. */
object StoredObjects {
    fun key(
        projectId: String,
        assetId: String,
        sha256: String,
        variant: String,
    ) = "assets/$projectId/$assetId/$sha256/$variant"
}
