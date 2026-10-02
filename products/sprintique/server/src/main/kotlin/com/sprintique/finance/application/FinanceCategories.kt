package com.sprintique.finance.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.Receipt
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode

/** A category as a writer sets it. */
data class FinanceCategoryContent(val name: String, val direction: String, val archived: Boolean)

/**
 * The project's finance categories. Entries and plan lines name a category by id; renaming it renames it
 * everywhere it is shown, while each entry keeps the name it was written with as its historical label.
 */
object FinanceCategories {
    private const val PROJECTION = """id, project_id AS "projectId", name, direction, archived_at IS NOT NULL AS archived,
        archived_at AS "archivedAt", revision, updated_at AS "updatedAt""""

    fun list(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        val items = tx.rows(
            """
            SELECT $PROJECTION FROM app.finance_category WHERE project_id = $1
            ORDER BY archived_at IS NOT NULL, name_key, id
            """.trimIndent(),
            projectId,
        )
        return linkedMapOf("items" to items)
    }

    /** Creates the category at base revision 0 or changes it; the caller holds the project fence and the ledger. */
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        content: FinanceCategoryContent,
    ): Row {
        val current = tx.row(
            "SELECT revision, direction FROM app.finance_category WHERE project_id = $1 AND id = $2 FOR UPDATE",
            projectId,
            id,
        )
        requireCondition(
            (current?.long("revision") ?: 0L) == baseRevision,
            409,
            "CONFLICT",
            "Категория уже изменена. Обновите список.",
        )
        val taken = tx.row(
            """
            SELECT name FROM app.finance_category
            WHERE project_id = $1 AND id <> $2 AND name_key = app.finance_category_key($3)
            """.trimIndent(),
            projectId,
            id,
            content.name,
        )
        requireCondition(
            taken == null,
            409,
            "FINANCE_CATEGORY_NAME",
            "Категория «${taken?.string("name")}» уже есть в проекте.",
        )
        if (current == null) {
            val count = tx.row("SELECT count(*)::int AS n FROM app.finance_category WHERE project_id = $1", projectId)!!
                .int("n")
            requireCondition(
                count < FinancePlanRules.CATEGORY_LIMIT,
                409,
                "FINANCE_LIMIT",
                "В проекте уже ${FinancePlanRules.CATEGORY_LIMIT} категорий.",
            )
            tx.update(
                """
                INSERT INTO app.finance_category(project_id, id, name, direction, archived_at, revision, created_by,
                  updated_by)
                VALUES ($1, $2, $3, $4, CASE WHEN $5::boolean THEN clock_timestamp() END, 1, $6, $6)
                """.trimIndent(),
                projectId,
                id,
                content.name,
                content.direction,
                content.archived,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-category.created", id, 1)
        } else {
            if (content.direction !=
                current.string("direction")
            ) {
                requireDirectionFree(tx, projectId, id, content.direction)
            }
            tx.update(
                """
                UPDATE app.finance_category SET name = $3, direction = $4,
                  archived_at = CASE WHEN NOT $5::boolean THEN NULL ELSE coalesce(archived_at, clock_timestamp()) END,
                  revision = revision + 1, updated_by = $6, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                content.name,
                content.direction,
                content.archived,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-category.updated", id, baseRevision + 1)
        }
        return find(tx, projectId, id)!!
    }

    /** A category narrowed to one direction must not already hold entries or plan lines of the other. */
    private fun requireDirectionFree(tx: Transaction, projectId: String, id: String, direction: String) {
        if (direction == FinancePlanRules.BOTH) return
        val used = tx.row(
            """
            SELECT EXISTS(SELECT 1 FROM app.finance_entry WHERE project_id = $1 AND category_id = $2 AND direction <> $3)
                OR EXISTS(SELECT 1 FROM app.finance_plan_line WHERE project_id = $1 AND category_id = $2 AND direction <> $3)
                AS used
            """.trimIndent(),
            projectId,
            id,
            direction,
        )!!.boolean("used")
        requireCondition(
            !used,
            409,
            "FINANCE_CATEGORY_IN_USE",
            "В категории уже есть операции или строки плана другого направления.",
        )
    }

    /** The receipt names the category and its revision; a retry answers with the category as it is now. */
    fun receipt(tx: Transaction, projectId: String): Receipt<Row> = object : Receipt<Row> {
        override fun store(value: Row): Any = mapOf("id" to value["id"], "revision" to value["revision"])

        override fun restore(record: JsonNode): Any = requirePresent(
            find(tx, projectId, record.path("id").asString()),
            404,
            "NOT_FOUND",
            "Категория недоступна.",
        )
    }

    private fun find(tx: Transaction, projectId: String, id: String): Row? =
        tx.row("SELECT $PROJECTION FROM app.finance_category WHERE project_id = $1 AND id = $2", projectId, id)
}
