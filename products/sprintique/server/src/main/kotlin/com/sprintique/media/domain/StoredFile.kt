package com.sprintique.media.domain

import com.sprintique.problem.requireCondition
import java.security.MessageDigest
import java.util.HexFormat

/**
 * How the server treats one accepted format. Only [inline] formats — raster images and video — may be shown by the
 * page itself; every other format is served as a download. [previewable] images get WebP variants; [text] must be
 * valid UTF-8 without NUL bytes from the first byte to the last.
 */
class FileType(
    val mime: String,
    val inline: Boolean = false,
    val previewable: Boolean = false,
    val text: Boolean = false,
    private val signature: (ByteArray) -> Boolean,
) {
    /** Whether the first bytes of a file (up to [FileInspection.HEAD_BYTES]) carry this format's signature. */
    fun matches(head: ByteArray) = signature(head)
}

/** What an upload turned out to be, after its name and content were checked against each other. */
data class InspectedFile(val name: String, val type: FileType, val size: Long, val sha256: String) {
    val mime: String get() = type.mime
}

/**
 * The accepted formats and their signatures. The extension picks the declared type and the first bytes must agree;
 * a name with any other extension is stored as `application/octet-stream` and only ever served as a download.
 */
object FileInspection {
    /** The largest file: 2 GiB. */
    const val FILE_LIMIT = 2L * 1024 * 1024 * 1024

    /** The largest image the server decodes into previews; a larger one is kept as a plain file. */
    const val IMAGE_BYTES = 32L * 1024 * 1024

    /** How many leading bytes the signatures look at (a tar header names itself at offset 257). */
    const val HEAD_BYTES = 512

    private const val NAME_LIMIT = 180
    private val CONTROL = Regex("[\\x00-\\x1f\\x7f/\\\\]")

    private val PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    private val JPEG = bytes(0xFF, 0xD8, 0xFF)
    private val GIF87 = "GIF87a".toByteArray()
    private val GIF89 = "GIF89a".toByteArray()
    private val RIFF = "RIFF".toByteArray()
    private val WEBP = "WEBP".toByteArray()
    private val WAVE = "WAVE".toByteArray()
    private val PDF = "%PDF-".toByteArray()
    private val ZIP_LOCAL = bytes(0x50, 0x4B, 0x03, 0x04)
    private val ZIP_EMPTY = bytes(0x50, 0x4B, 0x05, 0x06)
    private val OLE = bytes(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
    private val RTF = "{\\rtf".toByteArray()
    private val SEVEN_ZIP = bytes(0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)
    private val RAR = bytes(0x52, 0x61, 0x72, 0x21, 0x1A, 0x07)
    private val USTAR = "ustar".toByteArray()
    private val GZIP = bytes(0x1F, 0x8B)
    private val EBML = bytes(0x1A, 0x45, 0xDF, 0xA3)
    private val OGG = "OggS".toByteArray()
    private val ID3 = "ID3".toByteArray()
    private val FTYP = "ftyp".toByteArray()
    private val AVIF_BRANDS = setOf("avif", "avis")
    private val BMP = "BM".toByteArray()
    private val TIFF_LE = bytes(0x49, 0x49, 0x2A, 0x00)
    private val TIFF_BE = bytes(0x4D, 0x4D, 0x00, 0x2A)
    private val HEIF_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1")
    private val QUICKTIME_ATOMS = setOf("moov", "mdat", "wide", "free", "skip", "pnot")
    private const val BOX_TYPE = 4
    private const val BRAND = 8
    private const val FOURCC = 4
    private const val RIFF_FORM = 8
    private const val TAR_MAGIC = 257
    private const val MPEG_SYNC = 0xE0
    private const val BYTE = 0xFF

    private val png = FileType("image/png", inline = true, previewable = true) { it.startsWith(PNG) }
    private val jpeg = FileType("image/jpeg", inline = true, previewable = true) { it.startsWith(JPEG) }
    private val webp = FileType("image/webp", inline = true, previewable = true) {
        it.startsWith(RIFF) && it.startsWith(WEBP, RIFF_FORM)
    }
    private val text = FileType("text/plain", text = true) { true }

    /** The fallback for any other name: stored as given, never inspected, always a download. */
    val GENERIC = FileType("application/octet-stream") { true }

    private val TYPES: Map<String, FileType> = mapOf(
        "png" to png, "jpg" to jpeg, "jpeg" to jpeg, "webp" to webp,
        "gif" to FileType("image/gif", inline = true) { it.startsWith(GIF87) || it.startsWith(GIF89) },
        "heic" to FileType("image/heic", signature = ::isHeif), "heif" to FileType("image/heif", signature = ::isHeif),
        "svg" to FileType("image/svg+xml", text = true, signature = ::isMarkup),
        "mp4" to FileType("video/mp4", inline = true, signature = ::isIsoMedia),
        "m4v" to FileType("video/x-m4v", inline = true, signature = ::isIsoMedia),
        "mov" to FileType("video/quicktime", inline = true, signature = ::isQuickTime),
        "webm" to FileType("video/webm", inline = true) { it.startsWith(EBML) },
        "mp3" to FileType("audio/mpeg", signature = ::isMpegAudio),
        "m4a" to FileType("audio/mp4", signature = ::isIsoMedia),
        "wav" to FileType("audio/wav") { it.startsWith(RIFF) && it.startsWith(WAVE, RIFF_FORM) },
        "ogg" to FileType("audio/ogg") { it.startsWith(OGG) },
        "pdf" to FileType("application/pdf") { it.startsWith(PDF) },
        "docx" to zipped("vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "xlsx" to zipped("vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "pptx" to zipped("vnd.openxmlformats-officedocument.presentationml.presentation"),
        "odt" to zipped("vnd.oasis.opendocument.text"),
        "ods" to zipped("vnd.oasis.opendocument.spreadsheet"),
        "odp" to zipped("vnd.oasis.opendocument.presentation"),
        "doc" to FileType("application/msword") { it.startsWith(OLE) },
        "xls" to FileType("application/vnd.ms-excel") { it.startsWith(OLE) },
        "ppt" to FileType("application/vnd.ms-powerpoint") { it.startsWith(OLE) },
        "rtf" to FileType("application/rtf") { it.startsWith(RTF) },
        "zip" to zipped("zip"),
        "7z" to FileType("application/x-7z-compressed") { it.startsWith(SEVEN_ZIP) },
        "rar" to FileType("application/vnd.rar") { it.startsWith(RAR) },
        "tar" to FileType("application/x-tar") { it.startsWith(USTAR, TAR_MAGIC) },
        "gz" to FileType("application/gzip") { it.startsWith(GZIP) },
        "txt" to text, "md" to text, "csv" to text, "json" to text, "log" to text,
    )

    private val INLINE = TYPES.values.filter { it.inline }.map { it.mime }.toSet()

    /** Formats a browser would run as a document if it were told their type; they are served as plain bytes. */
    private val ACTIVE = setOf("image/svg+xml", "text/html", "application/xhtml+xml", "application/xml", "text/xml")

    /** Whether a stored type may be shown by the page itself (raster images, video); everything else downloads. */
    fun isInline(mime: String) = mime in INLINE

    /** The type a download is served as: a format a browser could run as a document is never named. */
    fun servedMime(mime: String) = if (mime in ACTIVE) GENERIC.mime else mime

    /** The declared type of a file name; an unknown or missing extension is the generic download. */
    fun typeOf(name: String): FileType = TYPES[name.substringAfterLast('.', "").lowercase()] ?: GENERIC

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

    /** A whole file in memory at once; uploads stream through [ContentCheck] instead. */
    fun inspect(name: String, bytes: ByteArray): InspectedFile =
        ContentCheck(name, FILE_LIMIT).apply { update(bytes, 0, bytes.size) }.finish()

    /**
     * The name of a picture format people commonly have but image processing does not take (a phone's HEIC, an AVIF,
     * a GIF, SVG, BMP, TIFF), for a message that says what to do; null for anything else.
     */
    fun unsupportedImage(head: ByteArray): String? = when {
        isIsoMedia(head) && head.ascii(BRAND) in AVIF_BRANDS -> "AVIF"
        isHeif(head) -> "HEIC"
        head.startsWith(GIF87) || head.startsWith(GIF89) -> "GIF"
        head.startsWith(BMP) -> "BMP"
        head.startsWith(TIFF_LE) || head.startsWith(TIFF_BE) -> "TIFF"
        isMarkup(head.copyOf(minOf(head.size, HEAD_BYTES))) -> "SVG"
        else -> null
    }

    /** A short name of the picture format the first bytes announce, for logs; never the content. */
    fun imageFormat(head: ByteArray): String = when {
        png.matches(head) -> "PNG"
        jpeg.matches(head) -> "JPEG"
        webp.matches(head) -> "WebP"
        else -> unsupportedImage(head) ?: "unknown"
    }

    /** Whether the bytes start like one of the three image formats the image processing accepts. */
    fun isKnownImage(bytes: ByteArray): Boolean = png.matches(bytes) || jpeg.matches(bytes) || webp.matches(bytes)

    fun sha256Hex(bytes: ByteArray): String = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(bytes),
    )

    private fun zipped(subtype: String) = FileType("application/$subtype", signature = ::isZip)

    private fun isZip(head: ByteArray) = head.startsWith(ZIP_LOCAL) || head.startsWith(ZIP_EMPTY)

    private fun isIsoMedia(head: ByteArray) = head.startsWith(FTYP, BOX_TYPE)

    private fun isHeif(head: ByteArray) = isIsoMedia(head) && head.ascii(BRAND) in HEIF_BRANDS

    /** QuickTime files carry `ftyp` or, when older, open with one of the classic top-level atoms. */
    private fun isQuickTime(head: ByteArray) = isIsoMedia(head) || head.ascii(BOX_TYPE) in QUICKTIME_ATOMS

    /** An ID3 tag, or an MPEG audio frame sync (eleven set bits). */
    private fun isMpegAudio(head: ByteArray) = head.startsWith(ID3) ||
        (head.size > 1 && head[0].toInt() and BYTE == BYTE && head[1].toInt() and MPEG_SYNC == MPEG_SYNC)

    /** SVG is markup: after an optional byte order mark and white space, the first character opens a tag. */
    private fun isMarkup(head: ByteArray) = head.decodeToString().removePrefix("﻿").trimStart().startsWith("<")

    private fun ByteArray.startsWith(prefix: ByteArray, at: Int = 0) =
        size >= at + prefix.size && prefix.indices.all { this[at + it] == prefix[it] }

    /** The four ASCII characters at [at], or nothing when the file is shorter. */
    private fun ByteArray.ascii(at: Int) = if (size >= at + FOURCC) String(this, at, FOURCC, Charsets.US_ASCII) else ""

    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }
}

/**
 * Inspects an upload while it streams: the first bytes must carry the signature of the declared format, text must stay
 * valid UTF-8 without NUL bytes to the end, and the size and SHA-256 cover every byte. A body longer than [limit]
 * fails as soon as it passes it.
 */
class ContentCheck(name: String, private val limit: Long) {
    private val name = FileInspection.requireFileName(name)
    val type: FileType = FileInspection.typeOf(this.name)
    private val digest = MessageDigest.getInstance("SHA-256")
    private val head = ByteArray(FileInspection.HEAD_BYTES)
    private var headLength = 0
    private var headChecked = false
    private val utf8 = if (type.text) Utf8Validator() else null

    var size = 0L
        private set

    fun update(bytes: ByteArray, offset: Int, length: Int) {
        size += length
        requireCondition(size <= limit, 422, "FILE_HASH", CHANGED)
        digest.update(bytes, offset, length)
        if (headLength < head.size) {
            val copied = minOf(length, head.size - headLength)
            System.arraycopy(bytes, offset, head, headLength, copied)
            headLength += copied
            if (headLength == head.size) checkHead()
        }
        utf8?.update(bytes, offset, length)
        requireCondition(utf8?.valid != false, 422, "FILE_CONTENT", MISMATCH)
    }

    /** The inspected file once the body has ended; comparing its size and hash with a reservation is the caller's. */
    fun finish(): InspectedFile {
        requireCondition(size > 0, 422, "FILE_SIZE", "Файл должен быть непустым и не больше 2 ГБ.")
        if (!headChecked) checkHead()
        requireCondition(utf8?.complete() != false, 422, "FILE_CONTENT", MISMATCH)
        return InspectedFile(name, type, size, HexFormat.of().formatHex(digest.digest()))
    }

    private fun checkHead() {
        headChecked = true
        requireCondition(type.matches(head.copyOf(headLength)), 422, "FILE_CONTENT", MISMATCH)
    }

    companion object {
        const val MISMATCH = "Содержимое не соответствует формату файла."
        const val CHANGED = "Содержимое загрузки изменилось. Выберите файл заново."
    }
}

/**
 * Strict UTF-8 across chunk boundaries (the byte ranges of the WHATWG decoder): no overlong forms, no surrogates,
 * nothing past U+10FFFF — and no NUL byte, which no text file the product accepts contains.
 */
class Utf8Validator {
    private var needed = 0
    private var lower = CONTINUATION_LOW
    private var upper = CONTINUATION_HIGH

    var valid = true
        private set

    fun update(bytes: ByteArray, offset: Int, length: Int) {
        var index = offset
        val end = offset + length
        while (valid && index < end) {
            val byte = bytes[index++].toInt() and BYTE
            if (needed == 0) lead(byte) else continuation(byte)
        }
    }

    /** Whether everything so far was valid and no sequence is left open. */
    fun complete() = valid && needed == 0

    private fun lead(byte: Int) {
        when (byte) {
            0 -> valid = false
            in 1..ASCII_HIGH -> Unit
            in TWO_LOW..TWO_HIGH -> needed = 1
            THREE_E0 -> expect(2, lower = THREE_E0_LOW)
            THREE_ED -> expect(2, upper = THREE_ED_HIGH)
            in THREE_LOW..THREE_HIGH -> needed = 2
            FOUR_F0 -> expect(LONGEST, lower = FOUR_F0_LOW)
            FOUR_F4 -> expect(LONGEST, upper = FOUR_F4_HIGH)
            in FOUR_LOW..FOUR_HIGH -> needed = LONGEST
            else -> valid = false
        }
    }

    private fun expect(count: Int, lower: Int = CONTINUATION_LOW, upper: Int = CONTINUATION_HIGH) {
        needed = count
        this.lower = lower
        this.upper = upper
    }

    private fun continuation(byte: Int) {
        if (byte !in lower..upper) {
            valid = false
            return
        }
        lower = CONTINUATION_LOW
        upper = CONTINUATION_HIGH
        needed--
    }

    private companion object {
        const val BYTE = 0xFF
        const val ASCII_HIGH = 0x7F
        const val CONTINUATION_LOW = 0x80
        const val CONTINUATION_HIGH = 0xBF
        const val TWO_LOW = 0xC2
        const val TWO_HIGH = 0xDF
        const val THREE_E0 = 0xE0
        const val THREE_E0_LOW = 0xA0
        const val THREE_ED = 0xED
        const val THREE_ED_HIGH = 0x9F
        const val THREE_LOW = 0xE1
        const val THREE_HIGH = 0xEF
        const val FOUR_F0 = 0xF0
        const val FOUR_F0_LOW = 0x90
        const val FOUR_F4 = 0xF4
        const val FOUR_F4_HIGH = 0x8F
        const val FOUR_LOW = 0xF1
        const val FOUR_HIGH = 0xF3

        /** Continuation bytes after a four-byte lead. */
        const val LONGEST = 3
    }
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
