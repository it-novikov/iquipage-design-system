package com.sprintique.finance.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.finance.domain.VarianceFigures
import com.sprintique.finance.domain.VarianceStatus
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.math.BigInteger

/**
 * The budget against the ledger, computed on every read as the summary is. For each currency, category and direction
 * inside the plan's period (by entry date): the plan, the fact (posted), what is still expected (planned entries),
 * the forecast (fact + expected) and the signed variance. Voided entries count nowhere, currencies are never added
 * together, and a category without a plan line is «не было в плане», not a zero variance. A plan for a release
 * counts the entries of that release; a plan for the whole project counts every entry of the project.
 */
object FinanceOverview {
    private const val ROW_LIMIT = 10_000
    private const val SHOWN_LIMIT = 2_000

    /** Which plan version a read compares with. */
    private data class Target(val plan: Row, val version: Row?)

    fun read(tx: Transaction, actor: Actor, projectId: String, planId: String?, version: Int?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        requireCondition(version == null || planId != null, 422, "FINANCE_PLAN_VERSION", "Версия без плана не выбрать.")
        val zone = FinanceSettings.timeZone(tx, projectId)
        val today = tx.row(
            "SELECT to_char((clock_timestamp() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today",
            zone,
        )!!.string("today")
        val target = if (planId != null) chosen(tx, projectId, planId, version) else default(tx, projectId, today)
        val plan = target?.plan
        val versionRow = target?.version
        val rows = tx.rows(
            FIGURES,
            projectId,
            plan?.string("periodStart"),
            plan?.string("periodEnd"),
            today,
            plan?.stringOrNull("releaseId"),
            plan?.string("id"),
            versionRow?.int("version"),
            ROW_LIMIT + 1,
        )
        val approved = versionRow?.string("state") == FinancePlanRules.APPROVED
        val categories = rows.take(ROW_LIMIT).map { category(it, versionRow != null, approved) }
        return linkedMapOf(
            "plan" to plan?.without("revision"),
            "version" to versionRow?.let {
                linkedMapOf(
                    "version" to it["version"],
                    "state" to it["state"],
                    "approvedAt" to it["approvedAt"],
                    "approvedBy" to it["approvedBy"],
                )
            },
            "period" to plan?.let { linkedMapOf("from" to it["periodStart"], "to" to it["periodEnd"]) },
            "today" to today,
            "state" to state(target, categories),
            "currencies" to currencies(categories),
            "categories" to categories.take(SHOWN_LIMIT).map { it.view },
            "truncated" to (rows.size > SHOWN_LIMIT),
        )
    }

    /** One category, direction and currency: its figures, its explanation and how they stand. */
    private class Figures(
        val row: Row,
        val figures: VarianceFigures,
        val status: VarianceStatus,
        val view: Map<String, Any?>,
    )

    private fun category(row: Row, compared: Boolean, approved: Boolean): Figures {
        val figures = VarianceFigures(
            direction = row.string("direction"),
            plan = row.stringOrNull("plan")?.let(::BigInteger),
            fact = BigInteger(row.string("fact")),
            expected = BigInteger(row.string("expected")),
        )
        val noteForecast = row.stringOrNull("noteForecast")?.let(::BigInteger)
        // Only an approved plan asks for explanations; a draft or an old version is a comparison, not a judgement.
        val status = if (approved) figures.status(noteForecast) else VarianceStatus.OK
        val note = row.stringOrNull("noteId")?.let {
            linkedMapOf(
                "id" to it,
                "text" to row["noteText"],
                "forecastMinorAtNote" to row["noteForecast"],
                "current" to (noteForecast == figures.forecast),
                "taskId" to row["noteTaskId"],
                "taskDisplayId" to row["noteTaskDisplayId"],
                "revision" to row["noteRevision"],
                "updatedAt" to row["noteUpdatedAt"],
                "updatedBy" to row["noteUpdatedBy"],
            )
        }
        val view = linkedMapOf(
            "categoryId" to row["categoryId"],
            "categoryName" to row["categoryName"],
            "categoryArchived" to row["categoryArchived"],
            "direction" to figures.direction,
            "currencyCode" to row["currencyCode"],
            "planned" to (compared && figures.plan != null),
            "plan" to figures.plan?.toString(),
            "fact" to figures.fact.toString(),
            "expected" to figures.expected.toString(),
            "forecast" to figures.forecast.toString(),
            "variance" to figures.variance?.toString(),
            "variancePercent" to figures.percent,
            "overdueCount" to row["overdueCount"],
            "overdue" to row["overdue"],
            "status" to status.wire,
            "note" to note,
        )
        return Figures(row, figures, status, view)
    }

    /** Totals of each currency, kept apart: plan and variance only where the plan has lines in that currency. */
    private fun currencies(categories: List<Figures>): List<Map<String, Any?>> =
        categories.groupBy { it.row.string("currencyCode") }.toSortedMap().map { (currency, rows) ->
            val sides = listOf(FinancePlanRules.INCOME, FinancePlanRules.EXPENSE).associateWith { direction ->
                val side = rows.filter { it.figures.direction == direction }
                val plans = side.mapNotNull { it.figures.plan }
                VarianceFigures(
                    direction = direction,
                    plan = if (plans.isEmpty()) null else plans.fold(BigInteger.ZERO, BigInteger::add),
                    fact = side.fold(BigInteger.ZERO) { sum, figures -> sum + figures.figures.fact },
                    expected = side.fold(BigInteger.ZERO) { sum, figures -> sum + figures.figures.expected },
                )
            }
            val income = sides.getValue(FinancePlanRules.INCOME)
            val expense = sides.getValue(FinancePlanRules.EXPENSE)
            val overdue = { direction: String ->
                rows.filter { it.figures.direction == direction }
                    .fold(BigInteger.ZERO) { sum, figures ->
                        sum + BigInteger(figures.row.string("overdue"))
                    }.toString()
            }
            linkedMapOf(
                "currencyCode" to currency,
                "income" to totals(income),
                "expense" to totals(expense),
                "net" to linkedMapOf(
                    "fact" to (income.fact - expense.fact).toString(),
                    "forecast" to (income.forecast - expense.forecast).toString(),
                ),
                "overdue" to linkedMapOf(
                    "count" to rows.sumOf { it.row.int("overdueCount") },
                    "income" to overdue(FinancePlanRules.INCOME),
                    "expense" to overdue(FinancePlanRules.EXPENSE),
                ),
            )
        }

    private fun totals(figures: VarianceFigures) = linkedMapOf(
        "plan" to figures.plan?.toString(),
        "fact" to figures.fact.toString(),
        "expected" to figures.expected.toString(),
        "forecast" to figures.forecast.toString(),
        "variance" to figures.variance?.toString(),
    )

    /**
     * The one sentence about the budget, as a code: no plan; a plan without an approved version, or a draft or
     * superseded version shown for comparison; a variance without an
     * explanation (the largest one, in the project's first currency by code, is the detail); an explanation written
     * for another forecast; every variance explained; or within the plan.
     */
    private fun state(target: Target?, categories: List<Figures>): Map<String, Any?> {
        val versionState = target?.version?.string("state")
        val code = when {
            target == null -> "no_plan"
            versionState != FinancePlanRules.APPROVED -> "not_approved"
            else -> null
        }
        val attention = categories.filter {
            it.status == VarianceStatus.NEEDS_EXPLANATION || it.status == VarianceStatus.EXPLANATION_OUTDATED
        }
        val unexplained = categories.filter { it.status == VarianceStatus.NEEDS_EXPLANATION }
        val outdated = categories.filter { it.status == VarianceStatus.EXPLANATION_OUTDATED }
        val explained = categories.filter { it.status == VarianceStatus.EXPLAINED }
        val (finalCode, focus) = when {
            code != null -> code to emptyList()
            unexplained.isNotEmpty() -> "variance_unexplained" to unexplained
            outdated.isNotEmpty() -> "explanation_outdated" to outdated
            explained.isNotEmpty() -> "variance_explained" to explained
            else -> "within_plan" to emptyList()
        }
        val largest = focus.sortedWith(
            compareBy<Figures> { it.row.string("currencyCode") }.thenByDescending { it.figures.excess },
        ).firstOrNull()
        return linkedMapOf(
            "code" to finalCode,
            "attentionCount" to if (code == null) attention.size else 0,
            "detail" to largest?.let {
                linkedMapOf(
                    "currencyCode" to it.row["currencyCode"],
                    "categoryId" to it.row["categoryId"],
                    "categoryName" to it.row["categoryName"],
                    "direction" to it.figures.direction,
                    "planned" to (it.figures.plan != null),
                    "amountMinor" to it.figures.excess.toString(),
                )
            },
        )
    }

    /** The plan asked for, at the version asked for or else its approved one. */
    private fun chosen(tx: Transaction, projectId: String, planId: String, version: Int?): Target {
        val plan = requirePresent(
            tx.row("SELECT $PLAN WHERE p.project_id = $1 AND p.id = $2", projectId, planId),
            404,
            "NOT_FOUND",
            "План недоступен.",
        )
        val row = tx.row(
            """
            SELECT $VERSION WHERE v.project_id = $1 AND v.plan_id = $2
              AND (v.version = $3 OR ($3::int IS NULL AND v.state = 'approved'))
            """.trimIndent(),
            projectId,
            planId,
            version,
        )
        if (version != null) requireCondition(row != null, 404, "NOT_FOUND", "Версия плана недоступна.")
        return Target(plan, row)
    }

    /**
     * Without a plan asked for: the approved plan whose period holds today, a plan for the whole project before a
     * release plan, the latest approval first; else the latest approved plan; else the latest plan, not approved.
     */
    private fun default(tx: Transaction, projectId: String, today: String): Target? {
        val approved = tx.row(
            """
            SELECT p.id FROM app.finance_plan p JOIN app.finance_plan_version v
              ON v.project_id = p.project_id AND v.plan_id = p.id AND v.state = 'approved'
            WHERE p.project_id = $1
            ORDER BY ($2::date BETWEEN p.period_start AND p.period_end) DESC, p.release_id IS NULL DESC,
                     v.approved_at DESC, p.id
            LIMIT 1
            """.trimIndent(),
            projectId,
            today,
        )
        if (approved != null) return chosen(tx, projectId, approved.string("id"), null)
        val latest = tx.row(
            "SELECT id FROM app.finance_plan WHERE project_id = $1 ORDER BY updated_at DESC, id LIMIT 1",
            projectId,
        ) ?: return null
        val plan = tx.row("SELECT $PLAN WHERE p.project_id = $1 AND p.id = $2", projectId, latest.string("id"))!!
        return Target(plan, null)
    }

    private const val PLAN = """p.id, p.name, to_char(p.period_start, 'YYYY-MM-DD') AS "periodStart",
        to_char(p.period_end, 'YYYY-MM-DD') AS "periodEnd", p.release_id AS "releaseId", r.name AS "releaseName",
        coalesce(r.archived_at IS NOT NULL, false) AS "releaseArchived", p.revision
        FROM app.finance_plan p LEFT JOIN app.releases r ON r.project_id = p.project_id AND r.id = p.release_id"""

    private const val VERSION = """v.version, v.state, v.approved_at AS "approvedAt",
        CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id', a.id, 'name', coalesce(a.profile_name, a.name)) END
          AS "approvedBy"
        FROM app.finance_plan_version v LEFT JOIN auth.principals a ON a.id = v.approved_by"""

    /**
     * $1 project, $2–$3 the period (null: every date), $4 today, $5 the plan's release (null: every entry), $6–$7
     * the plan version (null: no plan), $8 the row limit. Sums of bigint are numeric and come back as exact text.
     */
    private const val FIGURES = """
        WITH facts AS (
          SELECT currency_code, category_id, direction,
                 coalesce(sum(amount_minor) FILTER (WHERE state = 'posted'), 0) AS fact,
                 coalesce(sum(amount_minor) FILTER (WHERE state = 'planned'), 0) AS expected,
                 count(*) FILTER (WHERE state = 'planned' AND entry_date < $4::date)::int AS overdue_count,
                 coalesce(sum(amount_minor) FILTER (WHERE state = 'planned' AND entry_date < $4::date), 0) AS overdue
          FROM app.finance_entry
          WHERE project_id = $1 AND state <> 'voided'
            AND ($2::date IS NULL OR entry_date >= $2::date) AND ($3::date IS NULL OR entry_date <= $3::date)
            AND ($5::text IS NULL OR release_id = $5::text)
          GROUP BY currency_code, category_id, direction
        ), lines AS (
          SELECT currency_code, category_id, direction, sum(amount_minor) AS plan
          FROM app.finance_plan_line WHERE project_id = $1 AND plan_id = $6::text AND version = $7::int
          GROUP BY currency_code, category_id, direction
        ), merged AS (
          SELECT currency_code, category_id, direction, l.plan, coalesce(f.fact, 0) AS fact,
                 coalesce(f.expected, 0) AS expected, coalesce(f.overdue_count, 0) AS overdue_count,
                 coalesce(f.overdue, 0) AS overdue
          FROM facts f FULL JOIN lines l USING (currency_code, category_id, direction)
        )
        SELECT m.currency_code AS "currencyCode", m.category_id AS "categoryId", m.direction, k.name AS "categoryName",
               k.archived_at IS NOT NULL AS "categoryArchived", m.plan::text AS plan, m.fact::text AS fact,
               m.expected::text AS expected, m.overdue_count AS "overdueCount", m.overdue::text AS overdue,
               n.id AS "noteId", n.text AS "noteText", n.forecast_minor_at_note::text AS "noteForecast",
               n.task_id AS "noteTaskId", CASE WHEN t.id IS NULL THEN NULL ELSE tp.key || '-' || t.number END
                 AS "noteTaskDisplayId",
               n.revision AS "noteRevision", n.updated_at AS "noteUpdatedAt",
               CASE WHEN n.id IS NULL THEN NULL
                    ELSE jsonb_build_object('id', nu.id, 'name', coalesce(nu.profile_name, nu.name)) END AS "noteUpdatedBy"
        FROM merged m
        JOIN app.finance_category k ON k.project_id = $1 AND k.id = m.category_id
        LEFT JOIN app.finance_variance_note n ON n.project_id = $1 AND n.plan_id = $6::text AND n.version = $7::int
          AND n.category_id = m.category_id AND n.direction = m.direction AND n.currency_code = m.currency_code
        LEFT JOIN app.tasks t ON t.project_id = $1 AND t.id = n.task_id
        LEFT JOIN app.projects tp ON tp.id = t.project_id
        LEFT JOIN auth.principals nu ON nu.id = n.updated_by
        ORDER BY m.currency_code, k.name_key, m.direction
        LIMIT $8
    """
}
