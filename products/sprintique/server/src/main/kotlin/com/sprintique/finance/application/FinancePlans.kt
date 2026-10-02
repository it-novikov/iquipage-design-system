package com.sprintique.finance.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.Receipt
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinancePlanLine
import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode

/** A plan header as a writer sets it. */
data class FinancePlanHeader(val name: String, val periodStart: String, val periodEnd: String, val releaseId: String?)

/**
 * Budget plans: a plan is a series of versions, each with its own lines for the whole period. A draft is edited
 * whole; approval freezes it (the database refuses any later change of it or its lines) and supersedes the approved
 * version before it; a revision starts a new draft from a copy of the approved lines. Every command runs under the
 * project write fence and the retry ledger, so commands of one project never interleave.
 */
object FinancePlans {
    private const val NOT_FOUND = "План недоступен."

    private const val HEADER = """p.id, p.project_id AS "projectId", p.name,
        to_char(p.period_start, 'YYYY-MM-DD') AS "periodStart", to_char(p.period_end, 'YYYY-MM-DD') AS "periodEnd",
        p.release_id AS "releaseId", r.name AS "releaseName", coalesce(r.archived_at IS NOT NULL, false) AS "releaseArchived",
        p.revision, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
        (SELECT v.version FROM app.finance_plan_version v
          WHERE v.project_id = p.project_id AND v.plan_id = p.id AND v.state = 'approved') AS "approvedVersion",
        (SELECT v.version FROM app.finance_plan_version v
          WHERE v.project_id = p.project_id AND v.plan_id = p.id AND v.state = 'draft') AS "draftVersion",
        (SELECT count(*)::int FROM app.finance_plan_version v
          WHERE v.project_id = p.project_id AND v.plan_id = p.id) AS "versionCount"
        FROM app.finance_plan p LEFT JOIN app.releases r ON r.project_id = p.project_id AND r.id = p.release_id"""

    private const val VERSION = """v.version, v.state, v.note, v.revision,
        (SELECT count(*)::int FROM app.finance_plan_line l
          WHERE l.project_id = v.project_id AND l.plan_id = v.plan_id AND l.version = v.version) AS "lineCount",
        v.approved_at AS "approvedAt",
        CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id', a.id, 'name', coalesce(a.profile_name, a.name)) END
          AS "approvedBy",
        v.created_at AS "createdAt", jsonb_build_object('id', c.id, 'name', coalesce(c.profile_name, c.name)) AS "createdBy",
        v.updated_at AS "updatedAt"
        FROM app.finance_plan_version v JOIN auth.principals c ON c.id = v.created_by
        LEFT JOIN auth.principals a ON a.id = v.approved_by"""

    fun list(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        val items = tx.rows("SELECT $HEADER WHERE p.project_id = $1 ORDER BY p.period_start DESC, p.id", projectId)
        return linkedMapOf("items" to items)
    }

    fun read(tx: Transaction, actor: Actor, projectId: String, id: String, version: Int?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        return requirePresent(detail(tx, projectId, id, version), 404, "NOT_FOUND", NOT_FOUND)
    }

    /** Creates the plan with an empty first draft at base revision 0, or changes its header. */
    fun putHeader(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        header: FinancePlanHeader,
    ): Map<String, Any?> {
        FinancePlanRules.requirePeriod(header.periodStart, header.periodEnd)
        val current = tx.row(
            """
            SELECT revision, to_char(period_start, 'YYYY-MM-DD') AS "periodStart",
                   to_char(period_end, 'YYYY-MM-DD') AS "periodEnd", release_id AS "releaseId"
            FROM app.finance_plan WHERE project_id = $1 AND id = $2 FOR UPDATE
            """.trimIndent(),
            projectId,
            id,
        )
        requireCondition(
            (current?.long("revision") ?: 0L) == baseRevision,
            409,
            "CONFLICT",
            "План уже изменён. Обновите страницу.",
        )
        FinanceReferences.requireRelease(tx, projectId, header.releaseId, keep = current?.stringOrNull("releaseId"))
        if (current == null) {
            val count = tx.row("SELECT count(*)::int AS n FROM app.finance_plan WHERE project_id = $1", projectId)!!
                .int("n")
            requireCondition(
                count < FinancePlanRules.PLAN_LIMIT,
                409,
                "FINANCE_LIMIT",
                "В проекте уже ${FinancePlanRules.PLAN_LIMIT} планов.",
            )
            tx.update(
                """
                INSERT INTO app.finance_plan(project_id, id, name, period_start, period_end, release_id, revision,
                  created_by, updated_by)
                VALUES ($1, $2, $3, $4::date, $5::date, $6, 1, $7, $7)
                """.trimIndent(),
                projectId,
                id,
                header.name,
                header.periodStart,
                header.periodEnd,
                header.releaseId,
                actor.id,
            )
            tx.update(
                """
                INSERT INTO app.finance_plan_version(project_id, plan_id, version, state, revision, created_by, updated_by)
                VALUES ($1, $2, 1, 'draft', 1, $3, $3)
                """.trimIndent(),
                projectId,
                id,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-plan.created", id, 1)
        } else {
            val moved = header.periodStart != current.string("periodStart") ||
                header.periodEnd != current.string("periodEnd") || header.releaseId != current.stringOrNull("releaseId")
            if (moved) {
                requireCondition(
                    !hasApproval(tx, projectId, id),
                    409,
                    "FINANCE_PLAN_APPROVED",
                    "Период и релиз утверждённого плана не меняются. Создайте новый план.",
                )
            }
            if (header.releaseId != null) requireNoLineReleases(tx, projectId, id)
            tx.update(
                """
                UPDATE app.finance_plan SET name = $3, period_start = $4::date, period_end = $5::date, release_id = $6,
                  revision = revision + 1, updated_by = $7, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                header.name,
                header.periodStart,
                header.periodEnd,
                header.releaseId,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "finance-plan.updated", id, baseRevision + 1)
        }
        return detail(tx, projectId, id, null)!!
    }

    /** Replaces the note and every line of the draft [version] at its revision. */
    @Suppress("LongParameterList")
    fun putDraft(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        version: Int,
        baseRevision: Long,
        note: String?,
        lines: List<FinancePlanLine>,
    ): Map<String, Any?> {
        val plan = lockPlan(tx, projectId, id)
        val current = lockVersion(tx, projectId, id, version)
        requireCondition(current.long("revision") == baseRevision, 409, "CONFLICT", "Черновик уже изменён.")
        requireDraft(current)
        requireCondition(
            lines.size <= FinancePlanRules.LINE_LIMIT,
            422,
            "FINANCE_LIMIT",
            "В версии плана не больше ${FinancePlanRules.LINE_LIMIT} строк.",
        )
        val kept = tx.rows(
            """
            SELECT DISTINCT category_id AS "categoryId", release_id AS "releaseId" FROM app.finance_plan_line
            WHERE project_id = $1 AND plan_id = $2 AND version = $3
            """.trimIndent(),
            projectId,
            id,
            version,
        )
        val keptCategories = kept.map { it.string("categoryId") }.toSet()
        val keptReleases = kept.mapNotNull { it.stringOrNull("releaseId") }.toSet()
        for ((categoryId, direction) in lines.map { it.categoryId to it.direction }.distinct()) {
            FinanceReferences.category(
                tx,
                projectId,
                categoryId,
                direction,
                keep = categoryId.takeIf { it in keptCategories },
            )
        }
        val releases = lines.mapNotNull { it.releaseId }.distinct()
        requireCondition(
            releases.isEmpty() || plan.stringOrNull("releaseId") == null,
            422,
            "FINANCE_PLAN_LINE_RELEASE",
            "Релиз указывают строки только плана на весь проект.",
        )
        for (release in releases) {
            FinanceReferences.requireRelease(tx, projectId, release, keep = release.takeIf { it in keptReleases })
        }
        tx.update(
            "DELETE FROM app.finance_plan_line WHERE project_id = $1 AND plan_id = $2 AND version = $3",
            projectId,
            id,
            version,
        )
        if (lines.isNotEmpty()) {
            tx.update(
                """
                INSERT INTO app.finance_plan_line(project_id, plan_id, version, position, direction, category_id,
                  amount_minor, currency_code, release_id, note)
                SELECT $1, $2, $3, l.n, l.direction, l.category, l.amount, l.currency, l.release, l.note
                FROM unnest($4::text[], $5::text[], $6::bigint[], $7::text[], $8::text[], $9::text[])
                  WITH ORDINALITY AS l(direction, category, amount, currency, release, note, n)
                """.trimIndent(),
                projectId,
                id,
                version,
                lines.map { it.direction },
                lines.map { it.categoryId },
                lines.map { it.amountMinor },
                lines.map { it.currencyCode },
                lines.map { it.releaseId },
                lines.map { it.note },
            )
        }
        tx.update(
            """
            UPDATE app.finance_plan_version SET note = $4, revision = revision + 1, updated_by = $5,
              updated_at = clock_timestamp()
            WHERE project_id = $1 AND plan_id = $2 AND version = $3
            """.trimIndent(),
            projectId,
            id,
            version,
            note,
            actor.id,
        )
        AuditTrail.record(tx, actor, projectId, "finance-plan.draft-updated", id, version.toLong())
        return detail(tx, projectId, id, version)!!
    }

    /**
     * Approves the draft [version] exactly as the caller saw it. The approved version before it becomes superseded in
     * the same transaction; the database allows one approved version per plan, so a concurrent approval of the same
     * draft finds a new revision and is refused.
     */
    fun approve(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        version: Int,
        baseRevision: Long,
    ): Map<String, Any?> {
        lockPlan(tx, projectId, id)
        val current = lockVersion(tx, projectId, id, version)
        requireCondition(current.long("revision") == baseRevision, 409, "CONFLICT", "Черновик уже изменён.")
        requireDraft(current)
        requireCondition(
            current.int("lineCount") > 0,
            422,
            "FINANCE_PLAN_EMPTY",
            "В плане нет ни одной строки: утверждать нечего.",
        )
        tx.update(
            """
            UPDATE app.finance_plan_version SET state = 'superseded', revision = revision + 1, updated_by = $3,
              updated_at = clock_timestamp()
            WHERE project_id = $1 AND plan_id = $2 AND state = 'approved'
            """.trimIndent(),
            projectId,
            id,
            actor.id,
        )
        tx.update(
            """
            UPDATE app.finance_plan_version SET state = 'approved', approved_by = $4, approved_at = clock_timestamp(),
              revision = revision + 1, updated_by = $4, updated_at = clock_timestamp()
            WHERE project_id = $1 AND plan_id = $2 AND version = $3
            """.trimIndent(),
            projectId,
            id,
            version,
            actor.id,
        )
        AuditTrail.record(tx, actor, projectId, "finance-plan.approved", id, version.toLong())
        return detail(tx, projectId, id, version)!!
    }

    /** Starts the next draft from a copy of the approved [version], which stays as it is for comparison. */
    fun revise(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        version: Int,
        baseRevision: Long,
        note: String?,
    ): Map<String, Any?> {
        lockPlan(tx, projectId, id)
        val current = lockVersion(tx, projectId, id, version)
        requireCondition(current.long("revision") == baseRevision, 409, "CONFLICT", "Версия плана уже изменена.")
        requireCondition(
            current.string("state") == FinancePlanRules.APPROVED,
            409,
            "FINANCE_PLAN_NOT_APPROVED",
            "Пересматривается только утверждённая версия.",
        )
        val versions = tx.row(
            """
            SELECT max(version) AS last, count(*) FILTER (WHERE state = 'draft')::int AS drafts
            FROM app.finance_plan_version WHERE project_id = $1 AND plan_id = $2
            """.trimIndent(),
            projectId,
            id,
        )!!
        requireCondition(
            versions.int("drafts") == 0,
            409,
            "FINANCE_PLAN_DRAFT_EXISTS",
            "У плана уже есть черновик.",
        )
        val next = versions.int("last") + 1
        requireCondition(
            next <= FinancePlanRules.VERSION_LIMIT,
            409,
            "FINANCE_LIMIT",
            "У плана уже ${FinancePlanRules.VERSION_LIMIT} версий.",
        )
        tx.update(
            """
            INSERT INTO app.finance_plan_version(project_id, plan_id, version, state, note, revision, created_by, updated_by)
            VALUES ($1, $2, $3, 'draft', $4, 1, $5, $5)
            """.trimIndent(),
            projectId,
            id,
            next,
            note,
            actor.id,
        )
        tx.update(
            """
            INSERT INTO app.finance_plan_line(project_id, plan_id, version, position, direction, category_id, amount_minor,
              currency_code, release_id, note)
            SELECT project_id, plan_id, $4, position, direction, category_id, amount_minor, currency_code, release_id, note
            FROM app.finance_plan_line WHERE project_id = $1 AND plan_id = $2 AND version = $3
            """.trimIndent(),
            projectId,
            id,
            version,
            next,
        )
        AuditTrail.record(tx, actor, projectId, "finance-plan.revised", id, next.toLong())
        return detail(tx, projectId, id, next)!!
    }

    /** A plan's header, every version and the lines of one of them; null when the plan does not exist. */
    fun detail(tx: Transaction, projectId: String, id: String, version: Int?): Map<String, Any?>? {
        val header = tx.row("SELECT $HEADER WHERE p.project_id = $1 AND p.id = $2", projectId, id) ?: return null
        val versions = tx.rows(
            "SELECT $VERSION WHERE v.project_id = $1 AND v.plan_id = $2 ORDER BY v.version DESC",
            projectId,
            id,
        )
        val chosen = version ?: header["draftVersion"] as Int? ?: header["approvedVersion"] as Int?
            ?: versions.firstOrNull()?.int("version")
        val selected = versions.firstOrNull { it.int("version") == chosen }
        if (version != null) requireCondition(selected != null, 404, "NOT_FOUND", "Версия плана недоступна.")
        return LinkedHashMap<String, Any?>(header).apply {
            put("versions", versions)
            put(
                "selected",
                selected?.let {
                    LinkedHashMap<String, Any?>(it).apply { put("lines", lines(tx, projectId, id, chosen!!)) }
                },
            )
        }
    }

    /** The lines of one version in their order. */
    fun lines(tx: Transaction, projectId: String, id: String, version: Int): List<Row> = tx.rows(
        """
        SELECT l.position, l.direction, l.category_id AS "categoryId", k.name AS "categoryName",
               l.amount_minor AS "amountMinor", l.currency_code AS "currencyCode", l.release_id AS "releaseId", l.note
        FROM app.finance_plan_line l JOIN app.finance_category k ON k.project_id = l.project_id AND k.id = l.category_id
        WHERE l.project_id = $1 AND l.plan_id = $2 AND l.version = $3 ORDER BY l.position
        """.trimIndent(),
        projectId,
        id,
        version,
    ).map { it.with("amountMinor" to it.long("amountMinor")) }

    /**
     * A plan command's receipt names the plan and the version it worked on; a retry answers with that plan and
     * version as they are now. Amounts, names and notes never enter the retry ledger.
     */
    fun receipt(tx: Transaction, projectId: String): Receipt<Map<String, Any?>> = object : Receipt<Map<String, Any?>> {
        override fun store(value: Map<String, Any?>): Any = mapOf(
            "id" to value["id"],
            "version" to (value["selected"] as Map<*, *>?)?.get("version"),
        )

        override fun restore(record: JsonNode): Any = requirePresent(
            detail(
                tx,
                projectId,
                record.path("id").asString(),
                record.path("version").takeIf { it.isInt }?.asInt(),
            ),
            404,
            "NOT_FOUND",
            NOT_FOUND,
        )
    }

    private fun lockPlan(tx: Transaction, projectId: String, id: String): Row = requirePresent(
        tx.row(
            "SELECT release_id AS \"releaseId\" FROM app.finance_plan WHERE project_id = $1 AND id = $2 FOR UPDATE",
            projectId,
            id,
        ),
        404,
        "NOT_FOUND",
        NOT_FOUND,
    )

    private fun lockVersion(tx: Transaction, projectId: String, id: String, version: Int): Row = requirePresent(
        tx.row(
            """
            SELECT v.state, v.revision, (SELECT count(*)::int FROM app.finance_plan_line l
              WHERE l.project_id = v.project_id AND l.plan_id = v.plan_id AND l.version = v.version) AS "lineCount"
            FROM app.finance_plan_version v WHERE v.project_id = $1 AND v.plan_id = $2 AND v.version = $3
            FOR UPDATE OF v
            """.trimIndent(),
            projectId,
            id,
            version,
        ),
        404,
        "NOT_FOUND",
        "Версия плана недоступна.",
    )

    private fun requireDraft(version: Row) {
        if (version.string("state") != FinancePlanRules.DRAFT) {
            throw ProblemException(409, "FINANCE_PLAN_VERSION_FROZEN", "Утверждённая версия плана не меняется.")
        }
    }

    private fun hasApproval(tx: Transaction, projectId: String, id: String): Boolean = tx.row(
        """
        SELECT EXISTS(SELECT 1 FROM app.finance_plan_version WHERE project_id = $1 AND plan_id = $2 AND state <> 'draft')
          AS approved
        """.trimIndent(),
        projectId,
        id,
    )!!.boolean("approved")

    private fun requireNoLineReleases(tx: Transaction, projectId: String, id: String) {
        val named = tx.row(
            """
            SELECT EXISTS(SELECT 1 FROM app.finance_plan_line WHERE project_id = $1 AND plan_id = $2
              AND release_id IS NOT NULL) AS named
            """.trimIndent(),
            projectId,
            id,
        )!!.boolean("named")
        requireCondition(
            !named,
            422,
            "FINANCE_PLAN_LINE_RELEASE",
            "Строки плана называют релизы: план на релиз их не содержит.",
        )
    }
}
