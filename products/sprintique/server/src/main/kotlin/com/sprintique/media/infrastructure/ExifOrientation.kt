package com.sprintique.media.infrastructure

/**
 * Reads the EXIF orientation (tag 0x0112) of a JPEG without decoding it: walks the segments up to the image data,
 * finds APP1 "Exif", reads the first IFD. Anything unexpected means "no rotation".
 */
internal object ExifOrientation {
    const val NORMAL = 1
    const val MIRRORED = 2
    const val TRANSPOSED = 5
    const val ROTATED_COUNTERCLOCKWISE = 8

    private const val BYTE_MASK = 0xFF
    private const val START_OF_IMAGE = 0xD8
    private const val START_OF_SCAN = 0xDA
    private const val APP1 = 0xE1
    private const val ORIENTATION_TAG = 0x0112
    private const val SEGMENT_HEADER = 4
    private const val EXIF_TAG = "Exif"
    private const val EXIF_HEADER = 6
    private const val IFD_OFFSET = 4
    private const val ENTRY_SIZE = 12
    private const val ENTRY_VALUE = 8
    private const val BITS_PER_BYTE = 8
    private const val BITS_PER_SHORT = 16

    fun of(bytes: ByteArray): Int = runCatching { read(bytes) }.getOrDefault(NORMAL)

    private fun read(bytes: ByteArray): Int {
        if (bytes.size < SEGMENT_HEADER || u8(bytes, 0) != BYTE_MASK || u8(bytes, 1) != START_OF_IMAGE) return NORMAL
        var offset = 2
        while (offset + SEGMENT_HEADER <= bytes.size && u8(bytes, offset) == BYTE_MASK) {
            val marker = u8(bytes, offset + 1)
            if (marker == START_OF_SCAN) return NORMAL
            val length = (u8(bytes, offset + 2) shl BITS_PER_BYTE) or u8(bytes, offset + 3)
            val data = offset + SEGMENT_HEADER
            if (marker == APP1 &&
                String(bytes, data, EXIF_TAG.length, Charsets.US_ASCII) == EXIF_TAG
            ) {
                return fromTiff(bytes, data + EXIF_HEADER)
            }
            offset += 2 + length
        }
        return NORMAL
    }

    private fun fromTiff(bytes: ByteArray, start: Int): Int {
        val little = u8(bytes, start) == 'I'.code
        fun u16(at: Int) = if (little) {
            u8(bytes, at) or (u8(bytes, at + 1) shl BITS_PER_BYTE)
        } else {
            (u8(bytes, at) shl BITS_PER_BYTE) or u8(bytes, at + 1)
        }
        fun u32(at: Int) = if (little) {
            u16(at) or (u16(at + 2) shl BITS_PER_SHORT)
        } else {
            (u16(at) shl BITS_PER_SHORT) or
                u16(at + 2)
        }
        val directory = start + u32(start + IFD_OFFSET)
        for (index in 0 until u16(directory)) {
            val entry = directory + 2 + index * ENTRY_SIZE
            if (u16(entry) == ORIENTATION_TAG) return u16(entry + ENTRY_VALUE)
        }
        return NORMAL
    }

    private fun u8(bytes: ByteArray, at: Int) = bytes[at].toInt() and BYTE_MASK
}
