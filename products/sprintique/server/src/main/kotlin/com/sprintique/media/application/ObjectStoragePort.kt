package com.sprintique.media.application

/**
 * Private object storage for uploaded files and their derived images. Keys are built by the server; no client URL
 * or key reaches an implementation. Reads are bounded to the canonical file limit.
 */
interface ObjectStoragePort {
    fun put(key: String, bytes: ByteArray, mime: String)

    fun get(key: String): ByteArray

    /** Idempotent: removing a missing object succeeds. */
    fun remove(key: String)

    /** Throws when the bucket cannot be reached with the configured credentials. */
    fun requireReady()
}
