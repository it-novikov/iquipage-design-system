package com.sprintique.finance

import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.finance.domain.VarianceFigures
import com.sprintique.finance.domain.VarianceStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigInteger

class FinancePlanRulesTest {
    private fun figures(direction: String, plan: Long?, fact: Long, expected: Long = 0) = VarianceFigures(
        direction,
        plan?.let(BigInteger::valueOf),
        BigInteger.valueOf(fact),
        BigInteger.valueOf(expected),
    )

    @Test
    fun `a positive variance is always good, a saving on expense and an excess on income`() {
        val saving = figures(FinancePlanRules.EXPENSE, plan = 100_000, fact = 60_000, expected = 30_000)
        assertThat(saving.forecast).isEqualTo(BigInteger.valueOf(90_000))
        assertThat(saving.variance).isEqualTo(BigInteger.valueOf(10_000))
        assertThat(saving.percent).isEqualTo(10.0)
        val overrun = figures(FinancePlanRules.EXPENSE, plan = 200_000, fact = 250_000)
        assertThat(overrun.variance).isEqualTo(BigInteger.valueOf(-50_000))
        assertThat(overrun.percent).isEqualTo(-25.0)
        val excess = figures(FinancePlanRules.INCOME, plan = 500_000, fact = 600_000)
        assertThat(excess.variance).isEqualTo(BigInteger.valueOf(100_000))
        assertThat(excess.needsExplanation).isFalse()
    }

    @Test
    fun `a zero plan has no percentage and no plan is not a zero variance`() {
        val zero = figures(FinancePlanRules.EXPENSE, plan = 0, fact = 5_000)
        assertThat(zero.percent).isNull()
        assertThat(zero.needsExplanation).isTrue()
        val unplanned = figures(FinancePlanRules.EXPENSE, plan = null, fact = 7_000)
        assertThat(listOf(unplanned.variance, unplanned.percent)).containsOnlyNulls()
        assertThat(unplanned.needsExplanation).isTrue()
        assertThat(unplanned.excess).isEqualTo(BigInteger.valueOf(7_000))
        assertThat(figures(FinancePlanRules.INCOME, plan = null, fact = 100).needsExplanation).isFalse()
    }

    @Test
    fun `an explanation is needed beyond ten percent of the plan and tracks the forecast it was written for`() {
        assertThat(figures(FinancePlanRules.INCOME, plan = 500_000, fact = 450_000).needsExplanation).isFalse()
        assertThat(figures(FinancePlanRules.INCOME, plan = 500_000, fact = 449_999).needsExplanation).isTrue()
        assertThat(figures(FinancePlanRules.EXPENSE, plan = 1_000, fact = 1_100).needsExplanation).isFalse()
        val over = figures(FinancePlanRules.EXPENSE, plan = 1_000, fact = 1_101)
        assertThat(over.status(null)).isEqualTo(VarianceStatus.NEEDS_EXPLANATION)
        assertThat(over.status(BigInteger.valueOf(1_101))).isEqualTo(VarianceStatus.EXPLAINED)
        assertThat(over.status(BigInteger.valueOf(1_050))).isEqualTo(VarianceStatus.EXPLANATION_OUTDATED)
        val within = figures(FinancePlanRules.EXPENSE, plan = 1_000, fact = 900)
        assertThat(within.status(null)).isEqualTo(VarianceStatus.OK)
    }

    @Test
    fun `sums beyond a long stay exact`() {
        val huge = VarianceFigures(
            FinancePlanRules.EXPENSE,
            BigInteger("1"),
            BigInteger("99999999999999900000"),
            BigInteger("99999999999999900000"),
        )
        assertThat(huge.forecast.toString()).isEqualTo("199999999999999800000")
        assertThat(huge.variance.toString()).isEqualTo("-199999999999999799999")
    }

    @Test
    fun `an entry or a line takes a category of its direction or of both`() {
        assertThatCode { FinancePlanRules.requireDirection("both", "income") }.doesNotThrowAnyException()
        assertThatCode { FinancePlanRules.requireDirection("expense", "expense") }.doesNotThrowAnyException()
        assertThatThrownBy { FinancePlanRules.requireDirection("expense", "income") }
            .extracting("code").isEqualTo("FINANCE_CATEGORY_DIRECTION")
        assertThatThrownBy { FinancePlanRules.requirePeriod("2026-12-31", "2026-01-01") }
            .extracting("code").isEqualTo("FINANCE_DATE")
    }
}
