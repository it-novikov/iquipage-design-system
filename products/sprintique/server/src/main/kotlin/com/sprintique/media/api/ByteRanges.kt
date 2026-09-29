package com.sprintique.media.api

/** The part of a stored file one download answers with. */
sealed interface ByteSelection {
    /** The whole file, `200 OK`. */
    data object Whole : ByteSelection

    /** One inclusive range within the file, `206 Partial Content`. */
    data class Part(val first: Long, val last: Long) : ByteSelection

    /** A range that starts past the end, `416 Range Not Satisfiable`. */
    data object Unsatisfiable : ByteSelection
}

/**
 * A single `bytes` range of RFC 9110. Anything else — several ranges, another unit, a malformed header, an `If-Range`
 * that names an older representation — is answered with the whole file, which the RFC allows. A partial answer is at
 * most [window] bytes long: players ask again from where it ended, so a paused video holds no long response open.
 */
object ByteRanges {
    private val SINGLE = Regex("^bytes=(\\d{0,19})-(\\d{0,19})$")

    fun select(range: String?, ifRange: String?, etag: String, length: Long, window: Long): ByteSelection {
        val match = if (range == null ||
            (ifRange != null && ifRange != etag)
        ) {
            null
        } else {
            SINGLE.matchEntire(range.trim())
        }
        val (from, to) = match?.destructured ?: return ByteSelection.Whole
        val selection = if (from.isEmpty()) suffix(to, length) else span(from, to, length)
        return if (selection is ByteSelection.Part) {
            selection.copy(last = minOf(selection.last, selection.first + window - 1))
        } else {
            selection
        }
    }

    /** `bytes=-N`: the last N bytes. */
    private fun suffix(to: String, length: Long): ByteSelection {
        if (to.isEmpty()) return ByteSelection.Whole
        val count = to.toBigInteger().min(length.toBigInteger()).toLong()
        return if (count == 0L) ByteSelection.Unsatisfiable else ByteSelection.Part(length - count, length - 1)
    }

    /** `bytes=A-` or `bytes=A-B`, the end clipped to the file. */
    private fun span(from: String, to: String, length: Long): ByteSelection {
        val start = from.toBigInteger()
        if (start >= length.toBigInteger()) return ByteSelection.Unsatisfiable
        val last = if (to.isEmpty()) length - 1 else to.toBigInteger().min((length - 1).toBigInteger()).toLong()
        return if (last < start.toLong()) ByteSelection.Whole else ByteSelection.Part(start.toLong(), last)
    }
}
