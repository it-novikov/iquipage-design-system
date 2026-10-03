package com.sprintique.finance.domain

import com.sprintique.problem.requireCondition
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode

/** One line of a plan draft as a writer sets it: a sum for the whole period of the plan. */
data class FinancePlanLine(
    val direction: String,
    val categoryId: String,
    val amountMinor: Long,
    val currencyCode: String,
    val releaseId: String?,
    val note: String?,
)

/** How a variance of one category, direction and currency stands against its explanation. */
enum class VarianceStatus(val wire: String) {
    OK("ok"),
    NEEDS_EXPLANATION("needs_explanation"),
    EXPLAINED("explained"),
    EXPLANATION_OUTDATED("explanation_outdated"),
}

/**
 * The figures of one category, direction and currency in a period: [plan] is null when the plan has no line for it
 * («не было в плане»). Sums are exact integers of minor units, beyond the range of a Long when they must be.
 */
data class VarianceFigures(
    val direction: String,
    val plan: BigInteger?,
    val fact: BigInteger,
    val expected: BigInteger,
) {
    val forecast: BigInteger get() = fact + expected

    /** Signed so that positive is good: a saving on expense, an excess on income. Null without a plan. */
    val variance: BigInteger? get() = plan?.let {
        if (direction ==
            FinancePlanRules.EXPENSE
        ) {
            it - forecast
        } else {
            forecast - it
        }
    }

    /** The variance as a percentage of the plan, to one decimal; none without a plan or with a zero plan. */
    val percent: Double?
        get() {
            val base = plan ?: return null
            if (base.signum() == 0) return null
            return BigDecimal(variance!!).multiply(HUNDRED).divide(BigDecimal(base), 1, RoundingMode.HALF_UP).toDouble()
        }

    /**
     * Whether the variance needs a person's explanation: the forecast is worse than the plan by more than the
     * threshold share of it, or money is expected to be spent that the plan never had. An unplanned income is not.
     */
    val needsExplanation: Boolean
        get() {
            val base = plan ?: return direction == FinancePlanRules.EXPENSE && forecast.signum() > 0
            val shortfall = variance!!.negate()
            if (shortfall.signum() <= 0) return false
            return shortfall.multiply(BigInteger.valueOf(FinancePlanRules.THRESHOLD_DENOMINATOR)) >
                base.multiply(BigInteger.valueOf(FinancePlanRules.THRESHOLD_NUMERATOR)) &&
                shortfall >= BigInteger.valueOf(FinancePlanRules.THRESHOLD_MINIMUM_MINOR)
        }

    /** How large the variance that needs explaining is: the shortfall against the plan, or the unplanned forecast. */
    val excess: BigInteger get() = variance?.negate()?.max(BigInteger.ZERO) ?: forecast

    /** The status against an explanation written for [noteForecast], or none. */
    fun status(noteForecast: BigInteger?): VarianceStatus = when {
        !needsExplanation -> VarianceStatus.OK
        noteForecast == null -> VarianceStatus.NEEDS_EXPLANATION
        noteForecast == forecast -> VarianceStatus.EXPLAINED
        else -> VarianceStatus.EXPLANATION_OUTDATED
    }

    private companion object {
        val HUNDRED: BigDecimal = BigDecimal.valueOf(100)
    }
}

/** The rules of plans, categories and variances every writer shares; the database keeps the same states. */
object FinancePlanRules {
    const val INCOME = "income"
    const val EXPENSE = "expense"
    const val BOTH = "both"
    const val DRAFT = "draft"
    const val APPROVED = "approved"
    const val SUPERSEDED = "superseded"

    const val CATEGORY_LIMIT = 200
    const val PLAN_LIMIT = 50
    const val LINE_LIMIT = 500
    const val VERSION_LIMIT = 100

    /** A variance needs an explanation beyond 10% of the plan … */
    const val THRESHOLD_NUMERATOR = 10L
    const val THRESHOLD_DENOMINATOR = 100L

    /** … and at least this many minor units (one: no floor yet, see docs/decisions/0009-finance-plan.md). */
    const val THRESHOLD_MINIMUM_MINOR = 1L

    /** An entry or a line of [direction] takes a category of that direction or of both. */
    fun requireDirection(categoryDirection: String, direction: String) = requireCondition(
        categoryDirection == BOTH || categoryDirection == direction,
        422,
        "FINANCE_CATEGORY_DIRECTION",
        if (categoryDirection == INCOME) "Категория только для доходов." else "Категория только для расходов.",
    )

    fun requirePeriod(start: String, end: String) {
        FinanceRules.requireDates(start, end)
        requireCondition(start <= end, 422, "FINANCE_DATE", "Начало периода позже его конца.")
    }
}
