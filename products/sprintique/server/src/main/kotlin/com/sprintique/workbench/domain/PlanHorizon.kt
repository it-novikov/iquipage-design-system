package com.sprintique.workbench.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** The two read-only lenses of the plan (docs/adr W5). */
enum class Horizon(val wire: String, val days: Long) {
    TODAY("today", 1),
    WEEK("7d", WEEK_DAYS),
    ;

    companion object {
        fun fromWire(value: String?): Horizon? = entries.firstOrNull { it.wire == value }
    }
}

private const val WEEK_DAYS = 7L

/** Calendar days in the person's time zone: `from` is today there, `to` the last day of the horizon. */
data class DayRange(val today: LocalDate, val from: LocalDate, val to: LocalDate)

object PlanHorizon {
    /**
     * Days, not hours: the range starts at local midnight and a daylight-saving change inside it neither adds nor
     * removes a day.
     */
    fun range(now: Instant, zone: ZoneId, horizon: Horizon): DayRange {
        val today = now.atZone(zone).toLocalDate()
        return DayRange(today, today, today.plusDays(horizon.days - 1))
    }

    /** `UTC` or a `Region/City` name the runtime knows, as the contracts accept a time zone. */
    fun zoneOf(value: String): ZoneId? =
        if (value.length in 1..MAX_ZONE &&
            (value == "UTC" || '/' in value)
        ) {
            runCatching { ZoneId.of(value) }.getOrNull()
        } else {
            null
        }

    private const val MAX_ZONE = 100
}
