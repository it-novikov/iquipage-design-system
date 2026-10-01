package com.sprintique.task.domain

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * A task's estimate as it was entered: time in hours (`h`), days (`d`) or weeks (`w`), or story points (`sp`). It is
 * stored as entered; sums convert time to hours by the project's working day and week. Only [value] and [unit] travel:
 * the rest are functions, so the stored and compared JSON of a task never gains derived fields.
 */
data class TaskEstimate(val value: Double, val unit: String) {
    /** Hours of a time estimate by the project's day and week; null for story points. */
    fun hours(hoursPerDay: Double, hoursPerWeek: Double): Double? = when (unit) {
        "h" -> value
        "d" -> rounded(value * hoursPerDay)
        "w" -> rounded(value * hoursPerWeek)
        else -> null
    }

    /** Story points of a points estimate; null for time. */
    fun points(): Double? = value.takeIf { unit == POINTS }

    /** Whether the unit belongs to another format than the project's (`time` or `points`). */
    fun mismatches(format: String): Boolean = (unit == POINTS) != (format == POINTS_FORMAT)

    companion object {
        const val POINTS = "sp"
        const val POINTS_FORMAT = "points"
        const val TIME_FORMAT = "time"
        val UNITS = setOf("h", "d", "w", POINTS)
        const val MAXIMUM = 9999.0
        private const val SCALE = 2

        /** Positive, at most 9999, at most two decimals, in a known unit. */
        fun valid(value: Double, unit: String): Boolean =
            value.isFinite() && value > 0 && value <= MAXIMUM && unit in UNITS &&
                BigDecimal.valueOf(value).stripTrailingZeros().scale() <= SCALE

        /** Sums keep two decimals, as the stored values do. */
        fun rounded(value: Double): Double = BigDecimal.valueOf(value).setScale(SCALE, RoundingMode.HALF_UP).toDouble()
    }
}
