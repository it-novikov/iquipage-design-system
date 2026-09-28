package com.sprintique.media

import com.sprintique.media.infrastructure.ImageIoImageTranscoder
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.time.Duration
import java.util.zip.CRC32
import javax.imageio.ImageIO

class ImageTranscoderTest {
    private val transcoder = ImageIoImageTranscoder()

    @Test
    fun `an image keeps its size below the display limit and gets a smaller thumbnail`() {
        val result = transcoder.variants(png(1000, 500))
        assertThat(result.width to result.height).isEqualTo(1000 to 500)
        assertThat(size(result.display)).isEqualTo(1000 to 500)
        assertThat(size(result.thumb)).isEqualTo(720 to 360)
        assertThat(result.display.copyOfRange(8, 12).decodeToString()).isEqualTo("WEBP")
    }

    @Test
    fun `a camera photo is turned the way the EXIF orientation says`() {
        val result = transcoder.variants(jpegWithOrientation(40, 20, orientation = 6))
        assertThat(size(result.display)).isEqualTo(20 to 40)
    }

    @Test
    fun `an avatar is a square WebP cut from the centre`() {
        assertThat(size(transcoder.avatar(png(300, 200)))).isEqualTo(256 to 256)
    }

    @Test
    fun `a tiny avatar and a non-image are refused`() {
        assertThatThrownBy { transcoder.avatar(png(20, 20)) }.hasFieldOrPropertyWithValue("code", "IMAGE_SIZE")
        assertThatThrownBy {
            transcoder.avatar("GIF89a".toByteArray())
        }.hasFieldOrPropertyWithValue("code", "FILE_TYPE")
    }

    @Test
    fun `a pixel bomb is refused from its header without decoding`() {
        val bomb = pngHeaderOnly(100_000, 100_000)
        assertThatThrownBy { transcoder.variants(bomb) }.hasFieldOrPropertyWithValue("code", "IMAGE_SIZE")
        assertThatThrownBy { transcoder.avatar(bomb) }.hasFieldOrPropertyWithValue("code", "IMAGE_DECODE")
    }

    @Test
    fun `corrupt image data fails as an unreadable image`() {
        val broken = png(64, 64).let { it.copyOf(it.size - 40) }
        assertThatThrownBy {
            transcoder.variants(broken)
        }.isInstanceOf(ProblemException::class.java).hasFieldOrPropertyWithValue("code", "IMAGE_DECODE")
    }

    @Test
    fun `a decode past the time limit is aborted`() {
        val impatient = ImageIoImageTranscoder(Duration.ofMillis(1))
        assertThatThrownBy { impatient.variants(png(3000, 3000)) }.hasFieldOrPropertyWithValue("code", "IMAGE_DECODE")
    }

    @Test
    fun `decodes that outlive their caller hold their slots until they end, then give them back`() {
        val impatient = ImageIoImageTranscoder(Duration.ofMillis(50))
        repeat(2) {
            assertThatThrownBy {
                impatient.variants(png(3000, 3000))
            }.hasFieldOrPropertyWithValue("code", "IMAGE_DECODE")
        }
        val small = png(64, 64)
        val deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos()
        var outcome: Any
        do {
            outcome = runCatching { impatient.avatar(small) }.fold({ "done" }, { (it as ProblemException).code })
            if (outcome == "IMAGE_BUSY") Thread.sleep(50)
        } while (outcome == "IMAGE_BUSY" && System.nanoTime() < deadline)
        // Any answer but IMAGE_BUSY means a slot was free again (a small image may still miss 50 ms on a cold JVM).
        assertThat(outcome).isNotEqualTo("IMAGE_BUSY")
    }

    private fun image(width: Int, height: Int): BufferedImage = BufferedImage(
        width,
        height,
        BufferedImage.TYPE_INT_RGB,
    ).apply {
        createGraphics().apply {
            color = Color(30, 120, 200)
            fillRect(0, 0, width, height)
            dispose()
        }
    }

    private fun png(width: Int, height: Int) = ByteArrayOutputStream().also {
        ImageIO.write(image(width, height), "png", it)
    }.toByteArray()

    private fun size(webp: ByteArray): Pair<Int, Int> = ImageIO.read(webp.inputStream()).let { it.width to it.height }

    private fun pngHeaderOnly(width: Int, height: Int): ByteArray {
        val header = ByteBuffer.allocate(13).putInt(width).putInt(height).put(8).put(2).put(0).put(0).put(0).array()
        return byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10) + chunk("IHDR", header) + chunk("IEND", ByteArray(0))
    }

    private fun chunk(type: String, data: ByteArray): ByteArray {
        val crc = CRC32().apply {
            update(type.toByteArray())
            update(data)
        }.value.toInt()
        return ByteBuffer.allocate(
            12 + data.size,
        ).putInt(data.size).put(type.toByteArray()).put(data).putInt(crc).array()
    }

    private fun jpegWithOrientation(width: Int, height: Int, orientation: Int): ByteArray {
        val jpeg = ByteArrayOutputStream().also { ImageIO.write(image(width, height), "jpeg", it) }.toByteArray()
        val tiff = ByteBuffer.allocate(26)
            .put("MM".toByteArray()).putShort(42).putInt(8)
            .putShort(1).putShort(0x0112).putShort(3).putInt(1).putShort(orientation.toShort()).putShort(0).putInt(0)
            .array()
        val body = "Exif".toByteArray() + byteArrayOf(0, 0) + tiff
        val app1 = byteArrayOf(-1, -31) + ByteBuffer.allocate(2).putShort((body.size + 2).toShort()).array() + body
        return jpeg.copyOfRange(0, 2) + app1 + jpeg.copyOfRange(2, jpeg.size)
    }
}
