package com.sprintique.finance.domain

import com.sprintique.problem.requireCondition
import java.time.LocalDate

/**
 * An entry of the project ledger as a writer sets it. [state] is `planned` or `posted`: voiding is its own command.
 * Dates are `YYYY-MM-DD`; amounts are integer minor units of [currencyCode]. [categoryId] names a category of the
 * project; the entry keeps that category's name as its label. [releaseId] is a release or sprint of the project.
 */
data class FinanceEntryContent(
    val direction: String,
    val state: String,
    val amountMinor: Long,
    val currencyCode: String,
    val dueDate: String?,
    val postedDate: String?,
    val categoryId: String,
    val releaseId: String?,
    val description: String,
    val counterparty: String?,
    val reference: String?,
)

/** A change of an entry's state: posting records what actually happened, voiding is final. */
sealed interface FinanceStateChange {
    data class Posting(val postedDate: String, val amountMinor: Long) : FinanceStateChange

    data class Voiding(val reason: String) : FinanceStateChange
}

/**
 * The rules of the ledger every writer shares. The database enforces the same transitions with a trigger; these
 * checks give the precise error before anything is written.
 */
object FinanceRules {
    const val PLANNED = "planned"
    const val POSTED = "posted"
    const val VOIDED = "voided"

    /** Every amount stays an exact JavaScript number, and so does every sum a person could meaningfully enter. */
    const val MAX_AMOUNT_MINOR = 999_999_999_999_999L

    /** Entries of one project; beyond it the ledger needs archiving, not a longer list. */
    const val ENTRY_LIMIT = 100_000

    private val EARLIEST: LocalDate = LocalDate.of(1900, 1, 1)
    private val LATEST: LocalDate = LocalDate.of(2999, 12, 31)

    fun requireChangeable(state: String) =
        requireCondition(state != VOIDED, 409, "FINANCE_ENTRY_VOIDED", "Аннулированная операция не меняется.")

    /** An edit keeps the state: an entry is posted or voided only by its own command. */
    fun requireSameState(current: String, requested: String) = requireCondition(
        current == requested,
        409,
        "FINANCE_STATE_CHANGE",
        "Статус операции меняется проведением или аннулированием.",
    )

    /** Only a planned entry is posted; a posted one is corrected by editing it. */
    fun requirePostable(state: String) {
        requireChangeable(state)
        requireCondition(state == PLANNED, 409, "FINANCE_ENTRY_POSTED", "Операция уже проведена.")
    }

    /** A period of entry dates: both ends in range and the start not after the end. */
    fun requirePeriod(from: String?, to: String?) {
        requireDates(from, to)
        requireCondition(
            from == null || to == null || from <= to,
            422,
            "FINANCE_DATE",
            "Начало периода позже его конца.",
        )
    }

    /** Dates stay within a range every client and the database read the same way. */
    fun requireDates(vararg dates: String?) = requireCondition(
        dates.filterNotNull().all { LocalDate.parse(it) in EARLIEST..LATEST },
        422,
        "FINANCE_DATE",
        "Дата операции должна быть между 1900 и 2999 годом.",
    )
}
