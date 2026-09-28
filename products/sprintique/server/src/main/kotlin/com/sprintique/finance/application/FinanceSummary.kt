package com.sprintique.finance.application

import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinanceRules
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability

/**
 * Totals of the project ledger, computed from the entries on every read: nothing is stored that could drift from
 * them. Voided entries count in no total. Each currency stands alone; there are no exchange rates. Sums are integer
 * minor units written as decimal text, exact beyond the range of a JavaScript number.
 */
object FinanceSummary {
    private const val MONTH_LIMIT = 240
    private const val CATEGORY_LIMIT = 200

    private const val PERIOD = """project_id = $1 AND ($2::date IS NULL OR entry_date >= $2::date)
        AND ($3::date IS NULL OR entry_date <= $3::date)"""

    private const val SUMS = """
        coalesce(sum(amount_minor) FILTER (WHERE state = 'posted' AND direction = 'income'), 0) AS "postedIncome",
        coalesce(sum(amount_minor) FILTER (WHERE state = 'posted' AND direction = 'expense'), 0) AS "postedExpense",
        coalesce(sum(amount_minor) FILTER (WHERE state = 'planned' AND direction = 'income'), 0) AS "plannedIncome",
        coalesce(sum(amount_minor) FILTER (WHERE state = 'planned' AND direction = 'expense'), 0) AS "plannedExpense"
    """

    fun read(tx: Transaction, actor: Actor, projectId: String, from: String?, to: String?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        FinanceRules.requireDates(from, to)
        val currencies = tx.rows(
            """
            SELECT "currencyCode", "postedIncome"::text AS "postedIncome", "postedExpense"::text AS "postedExpense",
                   ("postedIncome" - "postedExpense")::text AS balance,
                   "plannedIncome"::text AS "plannedIncome", "plannedExpense"::text AS "plannedExpense",
                   ("postedIncome" - "postedExpense" + "plannedIncome" - "plannedExpense")::text AS forecast,
                   "postedCount", "plannedCount", "voidedCount"
            FROM (
              SELECT currency_code AS "currencyCode", $SUMS,
                     count(*) FILTER (WHERE state = 'posted')::int AS "postedCount",
                     count(*) FILTER (WHERE state = 'planned')::int AS "plannedCount",
                     count(*) FILTER (WHERE state = 'voided')::int AS "voidedCount"
              FROM app.finance_entry WHERE $PERIOD GROUP BY currency_code
            ) totals ORDER BY "currencyCode"
            """.trimIndent(),
            projectId,
            from,
            to,
        )
        val months = tx.rows(
            """
            SELECT to_char(entry_date, 'YYYY-MM') AS month, currency_code AS "currencyCode", $SUMS
            FROM app.finance_entry WHERE $PERIOD AND state <> 'voided'
            GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT $4
            """.trimIndent(),
            projectId,
            from,
            to,
            MONTH_LIMIT + 1,
        )
        val categories = tx.rows(
            """
            SELECT category, direction, currency_code AS "currencyCode",
                   coalesce(sum(amount_minor) FILTER (WHERE state = 'posted'), 0)::text AS posted,
                   coalesce(sum(amount_minor) FILTER (WHERE state = 'planned'), 0)::text AS planned
            FROM app.finance_entry WHERE $PERIOD AND state <> 'voided'
            GROUP BY 1, 2, 3 ORDER BY sum(amount_minor) DESC, 1, 2, 3 LIMIT $4
            """.trimIndent(),
            projectId,
            from,
            to,
            CATEGORY_LIMIT + 1,
        )
        return linkedMapOf(
            "from" to from,
            "to" to to,
            "currencies" to currencies,
            // Sums of bigint are numeric, which the database layer returns as exact text.
            "months" to months.take(MONTH_LIMIT),
            "categories" to categories.take(CATEGORY_LIMIT),
            "truncated" to (months.size > MONTH_LIMIT || categories.size > CATEGORY_LIMIT),
        )
    }
}
