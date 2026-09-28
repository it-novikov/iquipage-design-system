package com.sprintique.media.application

/** Derived images of an upload, re-encoded to WebP without any metadata of the original. */
data class ProcessedImage(val width: Int, val height: Int, val display: ByteArray, val thumb: ByteArray)

/**
 * Full decode and re-encode of untrusted images, bounded in pixels, time and concurrency. Failures are problems with
 * stable codes: IMAGE_BUSY, IMAGE_ANIMATION, IMAGE_SIZE, IMAGE_DECODE.
 */
interface ImageTranscoder {
    /** A person's photo: PNG, JPEG or WebP to a 256×256 WebP. */
    fun avatar(bytes: ByteArray): ByteArray

    /** Display (fits 2048) and thumbnail (fits 720) variants of an attached image. */
    fun variants(bytes: ByteArray): ProcessedImage
}
