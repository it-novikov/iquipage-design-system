package com.sprintique.media.application

import java.io.Closeable
import java.io.InputStream

/**
 * Private object storage for uploaded files and their derived images. Keys are built by the server; no client URL
 * or key reaches an implementation. Large bodies are written in parts and read in ranges, never held whole.
 */
interface ObjectStoragePort {
    fun put(key: String, bytes: ByteArray, mime: String)

    /** A write in parts: nothing is visible under the key until [ObjectWrite.complete]. */
    fun startWrite(key: String, mime: String): ObjectWrite

    /** The bytes of [range] (inclusive, within the object), or the whole object. The caller closes the stream. */
    fun read(key: String, range: LongRange? = null): InputStream

    /** Idempotent: removing a missing object succeeds. Unfinished part writes under the key are abandoned too. */
    fun remove(key: String)

    /** Throws when the bucket cannot be reached with the configured credentials. */
    fun requireReady()
}

/** One object written part by part. Every part but the last holds at least [MIN_PART] bytes. */
interface ObjectWrite : Closeable {
    fun part(bytes: ByteArray, length: Int)

    /** Publishes the object under its key. */
    fun complete()

    /** Discards the parts; safe to call more than once and after [complete]. */
    fun abort()

    /** Aborts unless completed. */
    override fun close() = abort()

    companion object {
        /** The smallest part S3 accepts before the last one. */
        const val MIN_PART = 5 * 1024 * 1024
    }
}
