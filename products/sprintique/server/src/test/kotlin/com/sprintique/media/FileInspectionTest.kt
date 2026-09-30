package com.sprintique.media

import com.sprintique.media.domain.ContentCheck
import com.sprintique.media.domain.FileInspection
import com.sprintique.media.domain.Utf8Validator
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class FileInspectionTest {
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    private fun iso(brand: String) = bytes(0, 0, 0, 0x18) + "ftyp$brand".toByteArray() + ByteArray(16)

    private fun tar() = ByteArray(1024).also { "ustar".toByteArray().copyInto(it, 257) }

    private val zip = bytes(0x50, 0x4B, 0x03, 0x04)
    private val ole = bytes(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)

    /** A sample whose first bytes carry each accepted format's signature. */
    private val samples = mapOf(
        "photo.png" to (bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) to "image/png"),
        "photo.JPG" to (bytes(0xFF, 0xD8, 0xFF, 0xE0) to "image/jpeg"),
        "photo.webp" to ("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ".toByteArray() to "image/webp"),
        "anim.gif" to ("GIF89a".toByteArray() to "image/gif"),
        "camera.heic" to (iso("heic") to "image/heic"),
        "camera.heif" to (iso("mif1") to "image/heif"),
        "logo.svg" to ("﻿  <svg xmlns=\"http://www.w3.org/2000/svg\"/>".toByteArray() to "image/svg+xml"),
        "clip.mp4" to (iso("isom") to "video/mp4"),
        "clip.m4v" to (iso("M4V ") to "video/x-m4v"),
        "clip.mov" to (iso("qt  ") to "video/quicktime"),
        "old.mov" to (bytes(0, 0, 0, 8) + "moov".toByteArray() to "video/quicktime"),
        "clip.webm" to (bytes(0x1A, 0x45, 0xDF, 0xA3, 0x9F) to "video/webm"),
        "song.mp3" to ("ID3\u0004".toByteArray() to "audio/mpeg"),
        "frame.mp3" to (bytes(0xFF, 0xFB, 0x90, 0x64) to "audio/mpeg"),
        "voice.m4a" to (iso("M4A ") to "audio/mp4"),
        "take.wav" to ("RIFF\u0000\u0000\u0000\u0000WAVEfmt ".toByteArray() to "audio/wav"),
        "take.ogg" to ("OggS\u0000".toByteArray() to "audio/ogg"),
        "doc.pdf" to ("%PDF-1.7".toByteArray() to "application/pdf"),
        "report.docx" to (zip to "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "sheet.xlsx" to (zip to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "deck.pptx" to (zip to "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        "text.odt" to (zip to "application/vnd.oasis.opendocument.text"),
        "sheet.ods" to (zip to "application/vnd.oasis.opendocument.spreadsheet"),
        "deck.odp" to (zip to "application/vnd.oasis.opendocument.presentation"),
        "old.doc" to (ole to "application/msword"),
        "old.xls" to (ole to "application/vnd.ms-excel"),
        "old.ppt" to (ole to "application/vnd.ms-powerpoint"),
        "note.rtf" to ("{\\rtf1\\ansi".toByteArray() to "application/rtf"),
        "bundle.zip" to (bytes(0x50, 0x4B, 0x05, 0x06) to "application/zip"),
        "bundle.7z" to (bytes(0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, 0, 4) to "application/x-7z-compressed"),
        "bundle.rar" to ("Rar!\u001A\u0007\u0001\u0000".toByteArray() to "application/vnd.rar"),
        "bundle.tar" to (tar() to "application/x-tar"),
        "bundle.gz" to (bytes(0x1F, 0x8B, 8) to "application/gzip"),
        "notes.md" to ("# Заметки".toByteArray() to "text/plain"),
        "tool.exe" to (bytes(0x4D, 0x5A, 0) to "application/octet-stream"),
        "Makefile" to ("all:".toByteArray() to "application/octet-stream"),
    )

    @Test
    fun `every accepted format is recognised by its signature, anything else is a generic download`() {
        for ((name, sample) in samples) {
            val (content, mime) = sample
            assertThat(FileInspection.inspect(name, content).mime).describedAs(name).isEqualTo(mime)
        }
    }

    @Test
    fun `content that contradicts the extension is refused`() {
        for (name in samples.keys.filter { FileInspection.typeOf(it).mime != "application/octet-stream" }) {
            assertThatThrownBy { FileInspection.inspect(name, "\u0000 not this format".toByteArray()) }
                .describedAs(name).hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        }
        assertThatThrownBy { FileInspection.inspect("clip.heic", iso("isom")) }
            .hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy { FileInspection.inspect("log.txt", byteArrayOf(0x41, 0)) }
            .hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy { FileInspection.inspect("bad.txt", bytes(0xC3, 0x28)) }
            .hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy { FileInspection.inspect("empty.txt", ByteArray(0)) }
            .hasFieldOrPropertyWithValue("code", "FILE_SIZE")
    }

    @Test
    fun `only raster images and video are shown inline, active formats are served as plain bytes`() {
        val inline = samples.values.map { it.second }.filter(FileInspection::isInline).toSet()
        assertThat(inline).containsExactlyInAnyOrder(
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/x-m4v",
            "video/quicktime",
            "video/webm",
        )
        assertThat(FileInspection.servedMime("image/svg+xml")).isEqualTo("application/octet-stream")
        assertThat(FileInspection.servedMime("text/html")).isEqualTo("application/octet-stream")
        assertThat(FileInspection.servedMime("application/pdf")).isEqualTo("application/pdf")
    }

    @Test
    fun `a streamed body is checked across chunks and stops as soon as it runs past its size`() {
        val text = "Строка с многобайтовыми символами — ёжик.\n".repeat(200).toByteArray()
        val check = ContentCheck("notes.txt", text.size.toLong())
        // One byte at a time splits every multi-byte character across two updates.
        for (index in text.indices) check.update(text, index, 1)
        val file = check.finish()
        assertThat(file.size).isEqualTo(text.size.toLong())
        assertThat(file.sha256).isEqualTo(FileInspection.sha256Hex(text))

        val short = ContentCheck("clip.mp4", 4)
        assertThatThrownBy { short.update(iso("isom"), 0, 24) }.hasFieldOrPropertyWithValue("code", "FILE_HASH")

        // The signature is judged once the head is full, long before the end of a large body.
        val video = ContentCheck("clip.mp4", Long.MAX_VALUE)
        assertThatThrownBy { video.update(ByteArray(FileInspection.HEAD_BYTES), 0, FileInspection.HEAD_BYTES) }
            .hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
    }

    @Test
    fun `utf-8 is strict about overlong forms, surrogates, range and unfinished sequences`() {
        fun valid(vararg values: Int) = Utf8Validator().apply { update(bytes(*values), 0, values.size) }.complete()
        assertThat(valid(0x41, 0xD0, 0x96, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80)).isTrue()
        assertThat(valid(0xC0, 0xAF)).isFalse()
        assertThat(valid(0xE0, 0x80, 0xAF)).isFalse()
        assertThat(valid(0xED, 0xA0, 0x80)).isFalse()
        assertThat(valid(0xF4, 0x90, 0x80, 0x80)).isFalse()
        assertThat(valid(0xE2, 0x82)).isFalse()
        assertThat(valid(0x41, 0x00)).isFalse()
    }

    @Test
    fun `a name with a path or control character is invalid`() {
        assertThatThrownBy {
            FileInspection.inspect("../x.txt", "a".toByteArray())
        }.hasFieldOrPropertyWithValue("code", "VALIDATION")
        assertThatThrownBy {
            FileInspection.inspect("a\u0007.txt", "a".toByteArray())
        }.hasFieldOrPropertyWithValue("code", "VALIDATION")
    }
}
