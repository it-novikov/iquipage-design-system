package com.sprintique.media

import com.sprintique.media.domain.FileInspection
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class FileInspectionTest {
    @Test
    fun `a file whose content matches its extension is accepted with its hash`() {
        val file = FileInspection.inspect("notes.md", "# Заметки".toByteArray())
        assertThat(file.mime).isEqualTo("text/plain")
        assertThat(file.isImage).isFalse()
        assertThat(file.sha256).hasSize(64)
    }

    @Test
    fun `content that contradicts the extension is refused`() {
        assertThatThrownBy {
            FileInspection.inspect("photo.png", "not a png".toByteArray())
        }.hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy {
            FileInspection.inspect("log.txt", byteArrayOf(0x41, 0))
        }.hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy {
            FileInspection.inspect("bad.txt", byteArrayOf(0xC3.toByte(), 0x28))
        }.hasFieldOrPropertyWithValue("code", "FILE_CONTENT")
        assertThatThrownBy {
            FileInspection.inspect("tool.exe", byteArrayOf(1))
        }.hasFieldOrPropertyWithValue("code", "FILE_TYPE")
        assertThatThrownBy {
            FileInspection.inspect("empty.txt", ByteArray(0))
        }.hasFieldOrPropertyWithValue("code", "FILE_SIZE")
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
