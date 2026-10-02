package com.sprintique.finance.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.Receipt
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.isIsoDate
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinanceEntryContent
import com.sprintique.finance.domain.FinanceRules
import com.sprintique.finance.domain.FinanceStateChange
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Base64

/** Which entries a page lists: all when a field is null. Dates bound the entry date, both inclusive. */
data class FinanceEntryFilter(val state: String?, val direction: String?, val from: String?, val to: String?)

/**
 * The project ledger. Every stored revision of an entry becomes a version through a database trigger, so the history
 * is complete whoever writes; this object adds authorization, revision checks, the rules and the audit trail.
 */
object FinanceEntries {
    private const val HISTORY_PAGE = 50
    private val json = JsonMapper.builder().build()
    private val ID = Regex(RESOURCE_ID)

    private val PROJECTION = """
        e.id, e.project_id AS "projectId", e.direction, e.state, e.amount_minor AS "amountMinor",
        e.currency_code AS "currencyCode", to_char(e.due_date, 'YYYY-MM-DD') AS "dueDate",
        to_char(e.posted_date, 'YYYY-MM-DD') AS "postedDate", to_char(e.entry_date, 'YYYY-MM-DD') AS "entryDate",
        e.category, e.category_id AS "categoryId", e.release_id AS "releaseId", k.name AS "categoryName", e.description,
        e.counterparty, e.reference, e.void_reason AS "voidReason", e.revision,
        e.created_at AS "createdAt", e.created_by AS "createdById", coalesce(c.profile_name, c.name) AS "createdByName",
        e.updated_at AS "updatedAt", e.updated_by AS "updatedById", coalesce(u.profile_name, u.name) AS "updatedByName"
        FROM app.finance_entry e
        JOIN app.finance_category k ON k.project_id = e.project_id AND k.id = e.category_id
        JOIN auth.principals c ON c.id = e.created_by JOIN auth.principals u ON u.id = e.updated_by
    """.trimIndent()

    fun list(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        filter: FinanceEntryFilter,
        limit: Int,
        cursor: String?,
    ): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        FinanceRules.requirePeriod(filter.from, filter.to)
        val binding = listOf(filter.state, filter.direction, filter.from, filter.to).joinToString("|") { it ?: "" }
        val after = positionOf(cursor, binding)
        val conditions = """
            e.project_id = $1 AND ($2::text IS NULL OR e.state = $2) AND ($3::text IS NULL OR e.direction = $3)
              AND ($4::date IS NULL OR e.entry_date >= $4::date) AND ($5::date IS NULL OR e.entry_date <= $5::date)
        """.trimIndent()
        val rows = tx.rows(
            """
            SELECT $PROJECTION
            WHERE $conditions AND ($6::date IS NULL OR (e.entry_date, e.id) < ($6::date, $7::text))
            ORDER BY e.entry_date DESC, e.id DESC LIMIT $8
            """.trimIndent(),
            projectId,
            filter.state,
            filter.direction,
            filter.from,
            filter.to,
            after?.first,
            after?.second,
            limit + 1,
        )
        val total = tx.row(
            "SELECT count(*)::int AS total FROM app.finance_entry e WHERE $conditions",
            projectId,
            filter.state,
            filter.direction,
            filter.from,
            filter.to,
        )!!.int("total")
        val items = rows.take(limit).map(::entryOf)
        val next = if (rows.size > limit) {
            val last = items.last()
            cursorOf(binding, last["entryDate"] as String, last["id"] as String)
        } else {
            null
        }
        return linkedMapOf("items" to items, "total" to total, "nextCursor" to next)
    }

    fun read(tx: Transaction, actor: Actor, projectId: String, id: String): Row {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        return requirePresent(find(tx, projectId, id), 404, "NOT_FOUND", "Операция недоступна.")
    }

    /**
     * Creates the entry at base revision 0 or edits it at its current revision. The caller holds the project write
     * fence and the retry ledger, so the entry limit and the revision check see a stable ledger.
     */
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        content: FinanceEntryContent,
    ): Row {
        val current = lock(tx, projectId, id)
        requireRevision(current, baseRevision)
        FinanceRules.requireDates(content.dueDate, content.postedDate)
        current?.let { FinanceRules.requireChangeable(it.string("state")) }
        // An archived category or release stays on an entry that has it; a new one must be current.
        val category = FinanceReferences.category(
            tx,
            projectId,
            content.categoryId,
            content.direction,
            keep = current?.stringOrNull("category_id"),
        )
        FinanceReferences.requireRelease(tx, projectId, content.releaseId, keep = current?.stringOrNull("release_id"))
        if (current == null) {
            val count = tx.row(
                "SELECT count(*)::int AS n FROM app.finance_entry WHERE project_id = $1",
                projectId,
            )!!.int("n")
            requireCondition(
                count < FinanceRules.ENTRY_LIMIT,
                409,
                "FINANCE_LIMIT",
                "В журнале проекта уже ${FinanceRules.ENTRY_LIMIT} операций.",
            )
            tx.update(
                """
                INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code, due_date,
                  posted_date, category, category_id, release_id, description, counterparty, reference, revision,
                  created_by, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13, $14, 1, $15, $15)
                """.trimIndent(),
                projectId,
                id,
                content.direction,
                content.state,
                content.amountMinor,
                content.currencyCode,
                content.dueDate,
                content.postedDate,
                category,
                content.categoryId,
                content.releaseId,
                content.description,
                content.counterparty,
                content.reference,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-entry.created", id, 1)
        } else {
            FinanceRules.requireSameState(current.string("state"), content.state)
            tx.update(
                """
                UPDATE app.finance_entry SET direction = $3, amount_minor = $4, currency_code = $5, due_date = $6::date,
                  posted_date = $7::date, category = $8, category_id = $9, release_id = $10, description = $11,
                  counterparty = $12, reference = $13, revision = revision + 1, updated_by = $14,
                  updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                content.direction,
                content.amountMinor,
                content.currencyCode,
                content.dueDate,
                content.postedDate,
                category,
                content.categoryId,
                content.releaseId,
                content.description,
                content.counterparty,
                content.reference,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-entry.updated", id, baseRevision + 1)
        }
        return find(tx, projectId, id)!!
    }

    /** Posts a planned entry or voids an entry, at its current revision. The caller holds the fence and the ledger. */
    fun changeState(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        change: FinanceStateChange,
    ): Row {
        val current = requirePresent(lock(tx, projectId, id), 404, "NOT_FOUND", "Операция недоступна.")
        requireRevision(current, baseRevision)
        val state = current.string("state")
        when (change) {
            is FinanceStateChange.Posting -> {
                FinanceRules.requirePostable(state)
                FinanceRules.requireDates(change.postedDate)
                tx.update(
                    """
                    UPDATE app.finance_entry SET state = 'posted', posted_date = $3::date, amount_minor = $4,
                      revision = revision + 1, updated_by = $5, updated_at = clock_timestamp()
                    WHERE project_id = $1 AND id = $2
                    """.trimIndent(),
                    projectId,
                    id,
                    change.postedDate,
                    change.amountMinor,
                    actor.id,
                )
                AuditTrail.record(tx, actor, projectId, "finance-entry.posted", id, baseRevision + 1)
            }

            is FinanceStateChange.Voiding -> {
                FinanceRules.requireChangeable(state)
                tx.update(
                    """
                    UPDATE app.finance_entry SET state = 'voided', void_reason = $3,
                      revision = revision + 1, updated_by = $4, updated_at = clock_timestamp()
                    WHERE project_id = $1 AND id = $2
                    """.trimIndent(),
                    projectId,
                    id,
                    change.reason,
                    actor.id,
                )
                AuditTrail.record(tx, actor, projectId, "finance-entry.voided", id, baseRevision + 1)
            }
        }
        return find(tx, projectId, id)!!
    }

    /** Stored versions of an entry, newest first, before revision [before] when given. */
    fun history(tx: Transaction, actor: Actor, projectId: String, id: String, before: Int?): Map<String, Any?> {
        read(tx, actor, projectId, id)
        val rows = tx.rows(
            """
            SELECT v.revision, v.change, v.direction, v.state, v.amount_minor AS "amountMinor",
                   v.currency_code AS "currencyCode", to_char(v.due_date, 'YYYY-MM-DD') AS "dueDate",
                   to_char(v.posted_date, 'YYYY-MM-DD') AS "postedDate", v.category, v.category_id AS "categoryId",
                   v.release_id AS "releaseId", v.description, v.counterparty,
                   v.reference, v.void_reason AS "voidReason", v.actor_id AS "actorId",
                   coalesce(p.profile_name, p.name) AS "actorName", v.created_at AS "createdAt"
            FROM app.finance_entry_version v JOIN auth.principals p ON p.id = v.actor_id
            WHERE v.project_id = $1 AND v.entry_id = $2 AND v.revision < $3
            ORDER BY v.revision DESC LIMIT $4
            """.trimIndent(),
            projectId,
            id,
            before ?: Int.MAX_VALUE,
            HISTORY_PAGE + 1,
        )
        val items = rows.take(HISTORY_PAGE).map { it.with("amountMinor" to it.long("amountMinor")) }
        return linkedMapOf(
            "items" to items,
            "nextCursor" to if (rows.size > HISTORY_PAGE) items.last().int("revision") else null,
        )
    }

    /**
     * The retry receipt of an entry command keeps only the entry and the revision it produced; a retry rebuilds the
     * answer from that version. Amounts and texts never leave the finance tables and their row security.
     */
    fun receipt(tx: Transaction, projectId: String): Receipt<Row> = object : Receipt<Row> {
        override fun store(value: Row): Any = mapOf("id" to value["id"], "revision" to value["revision"])

        override fun restore(record: JsonNode): Any = requirePresent(
            atRevision(tx, projectId, record.path("id").asString(), record.path("revision").asInt()),
            404,
            "NOT_FOUND",
            "Операция недоступна.",
        )
    }

    /** An entry exactly as a command returned it at [revision]. */
    private fun atRevision(tx: Transaction, projectId: String, id: String, revision: Int): Row? = tx.row(
        """
        SELECT e.id, e.project_id AS "projectId", v.direction, v.state, v.amount_minor AS "amountMinor",
               v.currency_code AS "currencyCode", to_char(v.due_date, 'YYYY-MM-DD') AS "dueDate",
               to_char(v.posted_date, 'YYYY-MM-DD') AS "postedDate",
               to_char(coalesce(v.posted_date, v.due_date), 'YYYY-MM-DD') AS "entryDate",
               v.category, v.category_id AS "categoryId", v.release_id AS "releaseId", k.name AS "categoryName",
               v.description, v.counterparty, v.reference, v.void_reason AS "voidReason", v.revision,
               e.created_at AS "createdAt", e.created_by AS "createdById", coalesce(c.profile_name, c.name) AS "createdByName",
               v.created_at AS "updatedAt", v.actor_id AS "updatedById", coalesce(u.profile_name, u.name) AS "updatedByName"
        FROM app.finance_entry_version v
        JOIN app.finance_entry e ON e.project_id = v.project_id AND e.id = v.entry_id
        JOIN app.finance_category k ON k.project_id = v.project_id AND k.id = v.category_id
        JOIN auth.principals c ON c.id = e.created_by JOIN auth.principals u ON u.id = v.actor_id
        WHERE v.project_id = $1 AND v.entry_id = $2 AND v.revision = $3
        """.trimIndent(),
        projectId,
        id,
        revision,
    )?.let(::entryOf)

    private fun find(tx: Transaction, projectId: String, id: String): Row? =
        tx.row("SELECT $PROJECTION WHERE e.project_id = $1 AND e.id = $2", projectId, id)?.let(::entryOf)

    private fun lock(tx: Transaction, projectId: String, id: String): Row? = tx.row(
        """
        SELECT state, revision, category_id, release_id FROM app.finance_entry WHERE project_id = $1 AND id = $2
        FOR UPDATE
        """.trimIndent(),
        projectId,
        id,
    )

    private fun requireRevision(current: Row?, baseRevision: Long) = requireCondition(
        (current?.long("revision") ?: 0L) == baseRevision,
        409,
        "CONFLICT",
        "Операция уже изменена. Обновите журнал.",
    )

    /** The database returns a bigint as exact text; every stored amount is an exact JSON number. */
    private fun entryOf(row: Row): Row = row.with("amountMinor" to row.long("amountMinor"))

    /** Keyset cursor: the last entry of a page, bound to the filter it was listed with. */
    private fun cursorOf(binding: String, date: String, id: String): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(json.writeValueAsBytes(linkedMapOf("binding" to binding, "date" to date, "id" to id)))

    private fun positionOf(cursor: String?, binding: String): Pair<String, String>? {
        if (cursor.isNullOrEmpty()) return null
        val value = try {
            json.readTree(Base64.getUrlDecoder().decode(cursor))
        } catch (@Suppress("TooGenericExceptionCaught", "SwallowedException") _: RuntimeException) {
            throw ProblemException(400, "CURSOR_INVALID", "Некорректный курсор.")
        }
        val date = value.path("date").takeIf { it.isString }?.asString()
        val id = value.path("id").takeIf { it.isString }?.asString()
        requireCondition(
            value.path("binding").let { it.isString && it.asString() == binding } &&
                date != null && isIsoDate(date) && id != null && ID.matches(id),
            400,
            "CURSOR_INVALID",
            "Курсор другого списка.",
        )
        return date to id
    }
}
