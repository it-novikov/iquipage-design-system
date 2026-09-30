package com.sprintique.media.infrastructure

import com.sprintique.media.application.ImageTranscoder
import com.sprintique.media.application.ProcessedImage
import com.sprintique.media.domain.FileInspection
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Duration
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageReader
import javax.imageio.ImageWriteParam
import javax.imageio.ImageWriter
import javax.imageio.stream.MemoryCacheImageOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Untrusted images are decoded only by pure-Java readers chosen explicitly (JDK PNG, TwelveMonkeys JPEG and WebP);
 * the native libwebp only encodes pixels that were already decoded. Size is checked before decoding, any reader
 * warning fails the image, a decode past the time limit is aborted, and at most two images are decoded at once —
 * counting decodes that outlived their caller.
 */
@Component
@Profile("api")
class ImageIoImageTranscoder(private val timeout: Duration = DEFAULT_TIMEOUT) : ImageTranscoder {
    private val slots = Semaphore(CONCURRENT_DECODERS)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()

    init {
        ImageIO.scanForPlugins()
    }

    override fun avatar(bytes: ByteArray): ByteArray {
        requireCondition(
            bytes.isNotEmpty() && bytes.size <= AVATAR_SOURCE_BYTES,
            422,
            "FILE_SIZE",
            "Файл должен быть непустым и не больше 10 МБ.",
        )
        requireCondition(
            FileInspection.isKnownImage(bytes),
            422,
            "FILE_TYPE",
            "Выберите изображение PNG, JPEG или WebP.",
        )
        val output = bounded(bytes) { decoder ->
            val header = decoder.header()
            requireCondition(
                min(header.width, header.height) >= AVATAR_MINIMUM,
                422,
                "IMAGE_SIZE",
                "Изображение должно быть не меньше 32 px.",
            )
            // Past the pixel limit the photo fails like any unreadable image, as before.
            if (header.pixels > IMAGE_PIXELS) throw decodeFailure()
            encodeWebp(cover(decoder.oriented(), AVATAR_SIZE), AVATAR_QUALITY)
        }
        requireCondition(output.size <= AVATAR_BYTES, 422, "IMAGE_SIZE", "Не удалось уменьшить изображение.")
        return output
    }

    override fun variants(bytes: ByteArray): ProcessedImage = bounded(bytes) { decoder ->
        requireCondition(bytes.size <= FileInspection.IMAGE_BYTES, 422, "IMAGE_SIZE", "Слишком большое изображение.")
        val header = decoder.header()
        requireCondition(header.pixels <= IMAGE_PIXELS, 422, "IMAGE_SIZE", "Слишком большое изображение.")
        val image = decoder.oriented()
        ProcessedImage(
            width = header.width,
            height = header.height,
            display = encodeWebp(inside(image, DISPLAY_SIZE), DISPLAY_QUALITY),
            thumb = encodeWebp(inside(image, THUMB_SIZE), THUMB_QUALITY),
        )
    }

    private fun <T> bounded(bytes: ByteArray, work: (Decoder) -> T): T {
        requireCondition(
            slots.tryAcquire(),
            429,
            "IMAGE_BUSY",
            "Сервис обрабатывает изображения. Повторите через несколько секунд.",
        )
        // The slot is held until the work itself ends, not until the caller stops waiting: a decode past the time
        // limit still occupies a decoder, so it still counts against the bound.
        val decoder = AtomicReference<Decoder?>()
        val future = try {
            executor.submit<T> {
                try {
                    work(Decoder(bytes).also(decoder::set))
                } finally {
                    decoder.get()?.let { runCatching { it.dispose() } }
                    slots.release()
                }
            }
        } catch (error: RejectedExecutionException) {
            slots.release()
            throw error
        }
        return try {
            future.get(timeout.toMillis(), TimeUnit.MILLISECONDS)
        } catch (@Suppress("SwallowedException") _: TimeoutException) {
            // Asks the reader to stop; the work ends on its own thread and gives the slot back there.
            decoder.get()?.let { runCatching { it.abort() } }
            throw ProblemException(
                422,
                "IMAGE_TIMEOUT",
                "Изображение обрабатывается слишком долго. Выберите другой файл.",
            )
        } catch (@Suppress("SwallowedException") error: ExecutionException) {
            // A reader failure is reported as an unreadable image; its cause says nothing useful to the client.
            throw error.cause as? ProblemException ?: decodeFailure()
        }
    }

    private class Header(val width: Int, val height: Int) {
        val pixels: Long get() = width.toLong() * height
    }

    /** One image's reader: header first, pixels only after the size checks passed. */
    private class Decoder(private val bytes: ByteArray) {
        private val reader: ImageReader = readerFor(bytes)
        private var warned = false

        init {
            reader.setInput(ImageIO.createImageInputStream(ByteArrayInputStream(bytes)), false, true)
            reader.addIIOReadWarningListener { _, _ -> warned = true }
        }

        fun header(): Header {
            val header = try {
                Header(reader.getWidth(0), reader.getHeight(0))
            } catch (_: java.io.IOException) {
                throw decodeFailure()
            }
            val frames = runCatching { reader.getNumImages(true) }.getOrDefault(1)
            requireCondition(frames <= 1, 422, "IMAGE_ANIMATION", "Поддерживаются только неподвижные изображения.")
            return header
        }

        fun oriented(): BufferedImage {
            val image = try {
                reader.read(0)
            } catch (_: java.io.IOException) {
                throw decodeFailure()
            }
            if (warned) throw decodeFailure()
            return orient(image, ExifOrientation.of(bytes))
        }

        fun abort() = reader.abort()

        fun dispose() = reader.dispose()
    }

    companion object {
        private val DEFAULT_TIMEOUT: Duration = Duration.ofSeconds(10)
        private const val CONCURRENT_DECODERS = 2
        const val IMAGE_PIXELS = 40_000_000L
        private const val AVATAR_SIZE = 256
        private const val AVATAR_MINIMUM = 32
        private const val AVATAR_BYTES = 262_144

        /** A person's photo arrives whole in one request (`BodySizeFilter.AVATAR_LIMIT`). */
        private const val AVATAR_SOURCE_BYTES = 10 * 1024 * 1024
        private const val AVATAR_QUALITY = 0.82f
        private const val DISPLAY_SIZE = 2048
        private const val DISPLAY_QUALITY = 0.84f
        private const val THUMB_SIZE = 720
        private const val THUMB_QUALITY = 0.78f

        private const val PNG_READER = "com.sun.imageio.plugins.png.PNGImageReader"
        private const val JPEG_READER = "com.twelvemonkeys.imageio.plugins.jpeg.JPEGImageReader"
        private const val WEBP_READER = "com.twelvemonkeys.imageio.plugins.webp.WebPImageReader"
        private const val WEBP_WRITER = "com.luciad.imageio.webp.WebPWriter"

        private fun decodeFailure() = ProblemException(
            422,
            "IMAGE_DECODE",
            "Не удалось прочитать изображение. Выберите другой файл.",
        )

        private fun readerFor(bytes: ByteArray): ImageReader {
            val (format, className) = when {
                bytes.size > 1 && bytes[0] == 0x89.toByte() && bytes[1] == 'P'.code.toByte() -> "png" to PNG_READER
                bytes.size > 1 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() -> "jpeg" to JPEG_READER
                else -> "webp" to WEBP_READER
            }
            return ImageIO.getImageReadersByFormatName(format).asSequence().firstOrNull {
                it.javaClass.name == className
            }
                ?: error("Image reader $className is not on the classpath")
        }

        private fun webpWriter(): ImageWriter =
            ImageIO.getImageWritersByMIMEType("image/webp").asSequence().firstOrNull {
                it.javaClass.name == WEBP_WRITER
            }
                ?: error("WebP writer is not on the classpath")

        private fun encodeWebp(image: BufferedImage, quality: Float): ByteArray {
            val writer = webpWriter()
            val output = ByteArrayOutputStream()
            try {
                MemoryCacheImageOutputStream(output).use { stream ->
                    writer.output = stream
                    val parameters = writer.defaultWriteParam.apply {
                        compressionMode = ImageWriteParam.MODE_EXPLICIT
                        compressionType = compressionTypes[0]
                        compressionQuality = quality
                    }
                    writer.write(null, IIOImage(image, null, null), parameters)
                }
            } finally {
                writer.dispose()
            }
            return output.toByteArray()
        }

        /** Fits the image inside a square of `size` without enlarging it. */
        private fun inside(image: BufferedImage, size: Int): BufferedImage {
            val scale = min(1.0, min(size.toDouble() / image.width, size.toDouble() / image.height))
            if (scale >= 1.0) return image
            return scale(image, max(1, (image.width * scale).roundToInt()), max(1, (image.height * scale).roundToInt()))
        }

        /** Fills a `size`×`size` square, cropping the centre of the longer side. */
        private fun cover(image: BufferedImage, size: Int): BufferedImage {
            val side = min(image.width, image.height)
            val square = image.getSubimage((image.width - side) / 2, (image.height - side) / 2, side, side)
            return scale(square, size, size)
        }

        /** Halves while far from the target, then one bicubic step: sharp downscales without aliasing. */
        private fun scale(image: BufferedImage, width: Int, height: Int): BufferedImage {
            var current = image
            while (current.width / 2 >= width && current.height / 2 >= height) {
                current =
                    draw(current, current.width / 2, current.height / 2, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            }
            return draw(current, width, height, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        }

        private fun draw(source: BufferedImage, width: Int, height: Int, interpolation: Any): BufferedImage {
            val type = if (source.colorModel.hasAlpha()) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_INT_RGB
            val target = BufferedImage(width, height, type)
            val graphics = target.createGraphics()
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation)
                graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
                graphics.drawImage(source, 0, 0, width, height, null)
            } finally {
                graphics.dispose()
            }
            return target
        }

        /** Applies EXIF orientation 2–8 so the stored image looks the way the camera held it. */
        private fun orient(image: BufferedImage, orientation: Int): BufferedImage {
            if (orientation !in
                ExifOrientation.MIRRORED..ExifOrientation.ROTATED_COUNTERCLOCKWISE
            ) {
                return normalized(image)
            }
            val swaps = orientation >= ExifOrientation.TRANSPOSED
            val width = if (swaps) image.height else image.width
            val height = if (swaps) image.width else image.height
            val w = image.width.toDouble()
            val h = image.height.toDouble()
            val transform = when (orientation) {
                2 -> AffineTransform(-1.0, 0.0, 0.0, 1.0, w, 0.0)
                3 -> AffineTransform(-1.0, 0.0, 0.0, -1.0, w, h)
                4 -> AffineTransform(1.0, 0.0, 0.0, -1.0, 0.0, h)
                5 -> AffineTransform(0.0, 1.0, 1.0, 0.0, 0.0, 0.0)
                6 -> AffineTransform(0.0, 1.0, -1.0, 0.0, h, 0.0)
                7 -> AffineTransform(0.0, -1.0, -1.0, 0.0, h, w)
                else -> AffineTransform(0.0, -1.0, 1.0, 0.0, 0.0, w)
            }
            val type = if (image.colorModel.hasAlpha()) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_INT_RGB
            val target = BufferedImage(width, height, type)
            val graphics = target.createGraphics()
            try {
                graphics.drawImage(image, transform, null)
            } finally {
                graphics.dispose()
            }
            return target
        }

        /** RGB or ARGB pixels, whatever colour model the reader produced (grey, indexed, CMYK converted). */
        private fun normalized(image: BufferedImage): BufferedImage {
            val type = if (image.colorModel.hasAlpha()) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_INT_RGB
            if (image.type == type) return image
            return draw(image, image.width, image.height, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR)
        }
    }
}
