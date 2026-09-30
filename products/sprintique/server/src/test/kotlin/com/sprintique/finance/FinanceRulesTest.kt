package com.sprintique.finance

import com.sprintique.finance.domain.FinanceRules
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class FinanceRulesTest {
    @Test
    fun `only a planned entry is posted and a voided one never changes`() {
        assertThatCode { FinanceRules.requirePostable("planned") }.doesNotThrowAnyException()
        assertThatThrownBy {
            FinanceRules.requirePostable("posted")
        }.extracting("code").isEqualTo("FINANCE_ENTRY_POSTED")
        assertThatThrownBy {
            FinanceRules.requirePostable("voided")
        }.extracting("code").isEqualTo("FINANCE_ENTRY_VOIDED")
        assertThatCode { FinanceRules.requireChangeable("posted") }.doesNotThrowAnyException()
        assertThatThrownBy {
            FinanceRules.requireChangeable("voided")
        }.extracting("code").isEqualTo("FINANCE_ENTRY_VOIDED")
    }

    @Test
    fun `an edit keeps the state`() {
        assertThatCode { FinanceRules.requireSameState("posted", "posted") }.doesNotThrowAnyException()
        assertThatThrownBy { FinanceRules.requireSameState("planned", "posted") }
            .extracting("code").isEqualTo("FINANCE_STATE_CHANGE")
    }

    @Test
    fun `dates stay between 1900 and 2999 and an absent date is accepted`() {
        assertThatCode { FinanceRules.requireDates("1900-01-01", "2999-12-31", null) }.doesNotThrowAnyException()
        assertThatThrownBy { FinanceRules.requireDates("1899-12-31") }.extracting("code").isEqualTo("FINANCE_DATE")
        assertThatThrownBy {
            FinanceRules.requireDates(null, "3000-01-01")
        }.extracting("code").isEqualTo("FINANCE_DATE")
    }

    @Test
    fun `a period starts no later than it ends`() {
        assertThatCode { FinanceRules.requirePeriod("2026-09-01", "2026-09-01") }.doesNotThrowAnyException()
        assertThatCode { FinanceRules.requirePeriod(null, "2026-09-01") }.doesNotThrowAnyException()
        assertThatThrownBy { FinanceRules.requirePeriod("2026-09-02", "2026-09-01") }
            .extracting("code").isEqualTo("FINANCE_DATE")
    }
}
