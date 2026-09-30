package com.sprintique.workbench

import com.sprintique.workbench.domain.Horizon
import com.sprintique.workbench.domain.PlanHorizon
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class PlanHorizonTest {
    private val moscow = ZoneId.of("Europe/Moscow")
    private val berlin = ZoneId.of("Europe/Berlin")

    @Test
    fun `today starts at local midnight, not at UTC midnight`() {
        // 23:30 UTC on the 28th is already the 29th in Moscow (UTC+3).
        val range = PlanHorizon.range(Instant.parse("2026-09-28T21:30:00Z"), moscow, Horizon.TODAY)
        assertThat(range.today).isEqualTo(LocalDate.parse("2026-09-29"))
        assertThat(range.from).isEqualTo(range.to)
        val before = PlanHorizon.range(Instant.parse("2026-09-28T20:59:59Z"), moscow, Horizon.TODAY)
        assertThat(before.today).isEqualTo(LocalDate.parse("2026-09-28"))
    }

    @Test
    fun `seven days are seven calendar days across a daylight-saving change`() {
        // Berlin leaves summer time on 2026-10-25: the day has 25 hours, the horizon still has seven days.
        val range = PlanHorizon.range(Instant.parse("2026-10-22T08:00:00Z"), berlin, Horizon.WEEK)
        assertThat(range.from).isEqualTo(LocalDate.parse("2026-10-22"))
        assertThat(range.to).isEqualTo(LocalDate.parse("2026-10-28"))
        val lateEvening = PlanHorizon.range(Instant.parse("2026-10-25T22:30:00Z"), berlin, Horizon.TODAY)
        assertThat(lateEvening.today).isEqualTo(LocalDate.parse("2026-10-25"))
        val pastMidnight = PlanHorizon.range(Instant.parse("2026-10-25T23:00:00Z"), berlin, Horizon.TODAY)
        assertThat(pastMidnight.today).isEqualTo(LocalDate.parse("2026-10-26"))
    }

    @Test
    fun `only UTC and region names are time zones`() {
        assertThat(PlanHorizon.zoneOf("Europe/Moscow")).isEqualTo(moscow)
        assertThat(PlanHorizon.zoneOf("UTC")).isEqualTo(ZoneId.of("UTC"))
        for (value in listOf("", "+03:00", "GMT+3", "MSK", "Mars/Olympus", "x".repeat(101))) {
            assertThat(PlanHorizon.zoneOf(value)).`as`(value).isNull()
        }
        assertThat(Horizon.fromWire("7d")).isEqualTo(Horizon.WEEK)
        assertThat(Horizon.fromWire("month")).isNull()
    }
}
