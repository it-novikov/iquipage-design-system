package com.sprintique.database

import com.sprintique.problem.ProblemException
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import javax.sql.DataSource

/**
 * The runtime database: a bounded pool and explicit transactions. Every transaction starts with a 10-second
 * statement timeout; request context is set with `set_config(..., true)`, so it ends with the transaction and never
 * leaks to the next user of a pooled connection.
 */
class Database(val dataSource: DataSource) : AutoCloseable {
    fun <T> transaction(block: (Transaction) -> T): T = dataSource.connection.use { connection ->
        connection.autoCommit = false
        try {
            connection.createStatement().use { it.execute("SET LOCAL statement_timeout = '10s'") }
            val result = block(Transaction(connection))
            connection.commit()
            result
        } catch (error: Throwable) {
            runCatching { connection.rollback() }
            throw error
        } finally {
            runCatching { connection.autoCommit = true }
        }
    }

    /** Refuses a role that owns tables, is a superuser or bypasses row security. */
    fun requireSafeRuntimeRole() {
        val unsafe = transaction { tx ->
            tx.row(
                """SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname='app' AND t.tableowner=current_user) AS unsafe
                   FROM pg_roles r WHERE r.rolname=current_user""",
            )?.get("unsafe")
        }
        if (unsafe != false) {
            throw ProblemException(503, "UNSAFE_DATABASE_ROLE", "API requires a non-owner, non-superuser, NOBYPASSRLS database role.")
        }
    }

    override fun close() {
        (dataSource as? AutoCloseable)?.close()
    }

    companion object {
        private const val CONNECTION_TIMEOUT_MILLISECONDS = 5_000L
        private const val IDLE_TIMEOUT_MILLISECONDS = 30_000L

        fun connect(url: String, maximumPoolSize: Int, poolName: String = "sprintique"): Database {
            val parsed = DatabaseUrl.parse(url)
            val config = HikariConfig().apply {
                jdbcUrl = parsed.jdbcUrl
                dataSourceProperties = parsed.properties
                this.maximumPoolSize = maximumPoolSize
                minimumIdle = 0
                connectionTimeout = CONNECTION_TIMEOUT_MILLISECONDS
                idleTimeout = IDLE_TIMEOUT_MILLISECONDS
                this.poolName = poolName
                isAutoCommit = true
                // Fail on first use, not at start: readiness reports an unavailable database instead of a crash loop.
                initializationFailTimeout = -1
            }
            return Database(HikariDataSource(config))
        }
    }
}
