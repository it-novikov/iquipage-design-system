package com.sprintique.job.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.job.application.AssetCleanup
import com.sprintique.media.application.ObjectStoragePort
import org.slf4j.LoggerFactory
import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import java.time.Duration

/** The `worker` command: the narrow worker role, object storage, and one loop over due jobs. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
class WorkerConfiguration {
    @Bean(destroyMethod = "close")
    fun workerDatabase(properties: SprintiqueProperties): Database {
        val url = properties.database.workerUrl
        require(url.isNotEmpty()) { "SPRINTIQUE_WORKER_DATABASE_URL is required" }
        return Database.connect(url, WORKER_POOL, "worker").also(WorkerRole::require)
    }

    @Bean
    fun assetCleanup(workerDatabase: Database, storage: ObjectStoragePort) = AssetCleanup(workerDatabase, storage)

    @Bean
    fun workerLoop(cleanup: AssetCleanup) = WorkerLoop(cleanup)

    private companion object {
        const val WORKER_POOL = 2
    }
}

/** The worker role may call the queue functions and nothing else: no table reads or writes, no row security bypass. */
object WorkerRole {
    fun require(database: Database) {
        val unsafe = database.transaction { tx ->
            tx.row(
                """
                SELECT r.rolsuper OR r.rolbypassrls OR has_table_privilege(current_user, 'app.tasks', 'SELECT')
                    OR has_table_privilege(current_user, 'app.assets', 'UPDATE')
                    OR has_table_privilege(current_user, 'work.jobs', 'UPDATE') AS unsafe
                FROM pg_roles r WHERE r.rolname = current_user
                """.trimIndent(),
            )?.get("unsafe")
        }
        check(unsafe == false) { "Worker needs its restricted function-only database role" }
    }
}

/** Collects due jobs until stopped; waits a second when idle or when a round failed. */
class WorkerLoop(private val cleanup: AssetCleanup) : SmartLifecycle {
    private val log = LoggerFactory.getLogger(WorkerLoop::class.java)

    @Volatile private var running = false
    private var thread: Thread? = null

    override fun start() {
        running = true
        // A non-daemon platform thread keeps the worker process alive; a virtual thread is a daemon.
        thread = Thread.ofPlatform().name("asset-cleanup").start {
            while (running) {
                val busy = try {
                    cleanup.collectOne()
                } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                    log.warn("Worker round unavailable; retrying. error={}", error.javaClass.name)
                    false
                }
                if (!busy) sleep()
            }
        }
    }

    private fun sleep() {
        try {
            Thread.sleep(IDLE)
        } catch (_: InterruptedException) {
            running = false
        }
    }

    override fun stop() {
        running = false
        thread?.interrupt()
        thread?.join(STOP_WAIT.toMillis())
    }

    override fun isRunning() = running

    private companion object {
        val IDLE: Duration = Duration.ofSeconds(1)
        val STOP_WAIT: Duration = Duration.ofSeconds(10)
    }
}
