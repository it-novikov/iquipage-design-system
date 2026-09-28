package com.sprintique.job.application

import com.sprintique.database.Database
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.domain.StoredObjects
import org.slf4j.LoggerFactory

/**
 * Deletes the stored objects of discarded files. The worker's database role can only call the queue functions:
 * claim a job under a lease, prepare it, finish it, settle it. A crash after any deletion is resumed by the next
 * lease, and deletes are idempotent, so a file is never half-removed for good.
 */
class AssetCleanup(private val database: Database, private val storage: ObjectStoragePort) {
    private val log = LoggerFactory.getLogger(AssetCleanup::class.java)

    data class Lease(val id: String, val token: String)

    fun claim(): Lease? = database.transaction { tx ->
        tx.row("SELECT id, lease_token FROM work.claim('asset.gc')")?.let {
            Lease(it.string("id"), it.string("lease_token"))
        }
    }

    fun settle(lease: Lease, succeeded: Boolean, errorCode: String? = null): Boolean = database.transaction { tx ->
        tx.row("SELECT work.settle($1, $2, $3, $4) AS ok", lease.id, lease.token, succeeded, errorCode)!!.boolean("ok")
    }

    /** Handles one due job; false when there was none. */
    fun collectOne(): Boolean {
        val lease = claim() ?: return false
        try {
            val asset = database.transaction { tx ->
                tx.row("SELECT work.prepare_asset_gc($1, $2) AS asset", lease.id, lease.token)!!.json("asset")
            }
            if (asset == null || asset.isNull) {
                settle(lease, true)
                return true
            }
            for (variant in VARIANTS) {
                storage.remove(
                    StoredObjects.key(
                        asset.path("projectId").asString(),
                        asset.path("id").asString(),
                        asset.path("sha256").asString(),
                        variant,
                    ),
                )
            }
            val finished = database.transaction { tx ->
                tx.row("SELECT work.finish_asset_gc($1, $2) AS ok", lease.id, lease.token)!!.boolean("ok")
            }
            check(finished) { "Lease lost" }
        } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
            log.warn("Asset cleanup failed job={} error={}", lease.id, error.javaClass.name)
            settle(lease, false, "ASSET_GC_FAILED")
        }
        return true
    }

    private companion object {
        val VARIANTS = listOf("original", "display", "thumb")
    }
}
