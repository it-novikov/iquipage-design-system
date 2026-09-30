package com.sprintique.catalog.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.requireCondition

/**
 * The project's tag and release catalogs. Each collection maps to one fixed table in code; a table name never comes
 * from the network.
 */
enum class Catalog(val wire: String, private val fields: String, val capability: Capability) {
    TAGS("tags", "name, tone", Capability.PROJECT_SETTINGS),
    RELEASES(
        "releases",
        """name, status, to_char(target_date, 'YYYY-MM-DD') AS "targetDate"""",
        Capability.RELEASES_MANAGE,
    ),
    ;

    val projection: String get() = """id, project_id AS "projectId", revision, archived_at AS "archivedAt", $fields"""
}

/** A tag as a writer sends it; [archived] asks to archive it (the server keeps its own time). */
data class TagValue(val name: String, val tone: String, val archived: Boolean)

/** A release as the simple catalog editor sends it; scheduling goes through planning. */
data class ReleaseValue(val name: String, val status: String, val targetDate: String?, val archived: Boolean)

object Catalogs {
    private const val LIMIT = 500

    fun list(tx: Transaction, actor: Actor, projectId: String, catalog: Catalog): List<Row> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        // Tags also report how many tasks carry them, so an admin can tell what is safe to archive.
        val usage = if (catalog == Catalog.TAGS) {
            """, (SELECT count(*)::int FROM app.task_tags tt WHERE tt.project_id = tags.project_id AND tt.tag_id = tags.id) AS "usageCount""""
        } else {
            ""
        }
        val rows = tx.rows(
            """
            SELECT ${catalog.projection}$usage FROM app.${catalog.wire}
            WHERE project_id = $1 ORDER BY name, id LIMIT $2
            """.trimIndent(),
            projectId,
            LIMIT + 1,
        )
        requireCondition(rows.size <= LIMIT, 409, "CATALOG_LIMIT", "Каталог достиг лимита.")
        return rows
    }

    fun putTag(
        tx: Transaction,
        actor: Actor,
        change: Change<TagValue>,
        ledger: CommandLedger,
    ): Any = put(tx, actor, change, Catalog.TAGS, ledger) {
        tx.update(
            """
            INSERT INTO app.tags(project_id, id, name, tone, archived_at, revision)
            VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN clock_timestamp() END, 1)
            ON CONFLICT(project_id, id) DO UPDATE SET name = $3, tone = $4,
              archived_at = CASE WHEN $5 THEN coalesce(app.tags.archived_at, clock_timestamp()) END,
              revision = app.tags.revision + 1
            """.trimIndent(),
            change.projectId,
            change.id,
            change.value.name,
            change.value.tone,
            change.value.archived,
        )
    }

    fun putRelease(
        tx: Transaction,
        actor: Actor,
        change: Change<ReleaseValue>,
        ledger: CommandLedger,
    ): Any = put(tx, actor, change, Catalog.RELEASES, ledger) {
        if (change.value.status != "planned") {
            throw TemporalRules.previewRequired("Запуск и закрытие релиза выполняются через планирование.")
        }
        val current = tx.row(
            """
            SELECT lifecycle, format, planned_start AS "plannedStart" FROM app.releases WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            change.projectId,
            change.id,
        )
        val simple = current == null || (
            current.string("lifecycle") == "planned" && current.string("format") == "flexible" &&
                current["plannedStart"] == null
            )
        if (!simple) throw TemporalRules.previewRequired("Используйте редактор планирования для этого релиза.")
        tx.update(
            """
            INSERT INTO app.releases(project_id, id, name, status, target_date, deadline, archived_at, revision)
            VALUES ($1, $2, $3, $4, $5, $5, CASE WHEN $6 THEN clock_timestamp() END, 1)
            ON CONFLICT(project_id, id) DO UPDATE SET name = $3, target_date = $5, deadline = $5,
              archived_at = CASE WHEN $6 THEN coalesce(app.releases.archived_at, clock_timestamp()) END,
              revision = app.releases.revision + 1
            """.trimIndent(),
            change.projectId,
            change.id,
            change.value.name,
            change.value.status,
            change.value.targetDate,
            change.value.archived,
        )
    }

    /** One catalog entry to create or change, based on the revision the writer saw. */
    data class Change<T>(val projectId: String, val id: String, val baseRevision: Long, val value: T, val key: String)

    private fun <T> put(
        tx: Transaction,
        actor: Actor,
        change: Change<T>,
        catalog: Catalog,
        ledger: CommandLedger,
        write: () -> Unit,
    ): Any {
        val operation = "${catalog.wire}:${change.id}"
        return ledger.idempotent(tx, actor, change.projectId, operation, change.key, request(change)) {
            ProjectAccess.authorize(tx, actor, change.projectId, catalog.capability)
            val previous = tx.row(
                "SELECT revision FROM app.${catalog.wire} WHERE project_id = $1 AND id = $2",
                change.projectId,
                change.id,
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == change.baseRevision,
                409,
                "CONFLICT",
                "Каталог уже изменён.",
            )
            val count = tx.row(
                "SELECT count(*)::int AS count FROM app.${catalog.wire} WHERE project_id = $1",
                change.projectId,
            )!!.int("count")
            requireCondition(previous != null || count < LIMIT, 409, "CATALOG_LIMIT", "Каталог достиг лимита.")
            write()
            val action = "${catalog.wire}.updated"
            AuditTrail.record(tx, actor, change.projectId, action, change.id, change.baseRevision + 1)
            tx.row(
                "SELECT ${catalog.projection} FROM app.${catalog.wire} WHERE project_id = $1 AND id = $2",
                change.projectId,
                change.id,
            )!!
        }
    }

    /** The retry fingerprint: the same request always hashes the same, whatever the catalog. */
    private fun request(change: Change<*>) = mapOf("baseRevision" to change.baseRevision, "value" to change.value)
}
