package com.sprintique.database

import tools.jackson.databind.json.JsonMapper
import javax.sql.DataSource

/**
 * A database the previous TypeScript migrator created carries its own ledger (`public.schema_migrations`) and no
 * Flyway history. It is adopted only when that ledger is exactly a prefix of the known migrations — same names, same
 * SHA-256 as that migrator recorded — so Flyway can start from the matching version. Anything else refuses.
 */
internal object PreviousLedger {
    private const val RESOURCE = "/db/previous-ledger.json"

    private data class Entry(val name: String, val sha256: String, val version: String)

    private val known: List<Entry> by lazy {
        val document = PreviousLedger::class.java.getResourceAsStream(RESOURCE)
            ?.use { JsonMapper.builder().build().readTree(it) } ?: error("Previous ledger missing: $RESOURCE")
        document.path("migrations").values().map {
            Entry(it.path("name").asString(), it.path("sha256").asString(), it.path("version").asString())
        }
    }

    /** The Flyway version to start from, or null when there is nothing to adopt. */
    fun baselineOf(dataSource: DataSource): String? = dataSource.connection.use { connection ->
        fun exists(table: String) = connection.prepareStatement("SELECT to_regclass(?) IS NOT NULL").use { statement ->
            statement.setString(1, table)
            statement.executeQuery().use { it.next() && it.getBoolean(1) }
        }
        if (!exists("public.schema_migrations") || exists("public.flyway_schema_history")) return@use null
        val query = "SELECT name, sha256 FROM public.schema_migrations ORDER BY name"
        val applied = connection.prepareStatement(query).use {
            it.executeQuery().use { rows ->
                buildList { while (rows.next()) add(rows.getString(1) to rows.getString(2)) }
            }
        }
        check(applied.isNotEmpty() && applied.size <= known.size) {
            "The previous migration ledger is empty or too long"
        }
        applied.forEachIndexed { index, (name, sha256) ->
            check(name == known[index].name && sha256 == known[index].sha256) {
                "The previous migration ledger differs from the known migrations at $name"
            }
        }
        known[applied.size - 1].version
    }
}
