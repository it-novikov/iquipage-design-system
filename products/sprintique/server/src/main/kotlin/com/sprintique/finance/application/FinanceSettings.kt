package com.sprintique.finance.application

import com.sprintique.command.AuditTrail
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition

/**
 * The project's finance settings: the currency new entries start in. A project that never saved them uses RUB at
 * revision 0. Changing it does not touch existing entries: each keeps its own currency.
 */
object FinanceSettings {
    const val DEFAULT_CURRENCY = "RUB"

    fun read(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.FINANCE_READ)
        return stored(tx, projectId)
    }

    /** Replaces the settings at [baseRevision]; the caller holds the project write fence and the retry ledger. */
    fun write(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        baseRevision: Long,
        currencyCode: String,
    ): Map<String, Any?> {
        val revision = (stored(tx, projectId)["revision"] as Int).toLong()
        requireCondition(
            revision == baseRevision,
            409,
            "CONFLICT",
            "Настройки финансов уже изменены. Обновите страницу.",
        )
        tx.update(
            """
            INSERT INTO app.finance_settings(project_id, currency_code, revision, updated_by) VALUES ($1, $2, $3, $4)
            ON CONFLICT(project_id) DO UPDATE SET currency_code = $2, revision = $3, updated_by = $4,
              updated_at = clock_timestamp()
            """.trimIndent(),
            projectId,
            currencyCode,
            revision + 1,
            actor.id,
        )
        AuditTrail.record(tx, actor, projectId, "finance-settings.updated", projectId, revision + 1)
        return stored(tx, projectId)
    }

    private fun stored(tx: Transaction, projectId: String): Map<String, Any?> {
        val row = tx.row(
            """
            SELECT currency_code AS "currencyCode", revision, updated_at AS "updatedAt" FROM app.finance_settings
            WHERE project_id = $1
            """.trimIndent(),
            projectId,
        )
        return linkedMapOf(
            "projectId" to projectId,
            "currencyCode" to (row?.string("currencyCode") ?: DEFAULT_CURRENCY),
            "revision" to (row?.int("revision") ?: 0),
            "updatedAt" to row?.instantOrNull("updatedAt"),
        )
    }
}
