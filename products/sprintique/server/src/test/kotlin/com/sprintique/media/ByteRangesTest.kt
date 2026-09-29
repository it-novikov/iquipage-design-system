package com.sprintique.media

import com.sprintique.media.api.ByteRanges
import com.sprintique.media.api.ByteSelection
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ByteRangesTest {
    private val etag = "\"abc\""

    private fun select(range: String?, ifRange: String? = null, length: Long = 1000) =
        ByteRanges.select(range, ifRange, etag, length)

    @Test
    fun `a single range is answered in part, clipped to the file`() {
        assertThat(select("bytes=0-9")).isEqualTo(ByteSelection.Part(0, 9))
        assertThat(select("bytes=0-")).isEqualTo(ByteSelection.Part(0, 999))
        assertThat(select("bytes=950-")).isEqualTo(ByteSelection.Part(950, 999))
        assertThat(select("bytes=990-5000")).isEqualTo(ByteSelection.Part(990, 999))
        assertThat(select("bytes=-10")).isEqualTo(ByteSelection.Part(990, 999))
        assertThat(select("bytes=-5000")).isEqualTo(ByteSelection.Part(0, 999))
        assertThat(select("bytes=0-99999999999999999999")).isEqualTo(ByteSelection.Whole)
    }

    @Test
    fun `a range past the end cannot be satisfied`() {
        assertThat(select("bytes=1000-")).isEqualTo(ByteSelection.Unsatisfiable)
        assertThat(select("bytes=9999999999999999999-")).isEqualTo(ByteSelection.Unsatisfiable)
        assertThat(select("bytes=-0")).isEqualTo(ByteSelection.Unsatisfiable)
    }

    @Test
    fun `anything but one valid byte range, or a stale If-Range, gets the whole file`() {
        assertThat(select(null)).isEqualTo(ByteSelection.Whole)
        assertThat(select("bytes=0-1,5-9")).isEqualTo(ByteSelection.Whole)
        assertThat(select("items=0-9")).isEqualTo(ByteSelection.Whole)
        assertThat(select("bytes=9-0")).isEqualTo(ByteSelection.Whole)
        assertThat(select("bytes=-")).isEqualTo(ByteSelection.Whole)
        assertThat(select("bytes=0-9", ifRange = "\"old\"")).isEqualTo(ByteSelection.Whole)
        assertThat(select("bytes=0-9", ifRange = etag)).isEqualTo(ByteSelection.Part(0, 9))
    }
}
