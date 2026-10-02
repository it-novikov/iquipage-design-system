package com.sprintique.finance.application

import com.sprintique.database.Transaction
import com.sprintique.finance.domain.FinancePlanRules
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent

/**
 * The categories and releases entries, plan lines and plans name. A new reference must be current; one the record
 * already has stays valid after it is archived, so archiving never rewrites finance history. The database holds the
 * same project boundary with composite foreign keys.
 */
object FinanceReferences {
    /** The name of a usable category of [direction], which the record then carries as its label. */
    fun category(
        tx: Transaction,
        projectId: String,
        categoryId: String,
        direction: String,
        keep: String? = null,
    ): String {
        val category = requirePresent(
            tx.row(
                """
                SELECT name, direction, archived_at IS NOT NULL AS archived FROM app.finance_category
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                categoryId,
            ),
            422,
            "FINANCE_CATEGORY",
            "Категория недоступна в проекте.",
        )
        requireCondition(
            !category.boolean("archived") || categoryId == keep,
            422,
            "FINANCE_CATEGORY_ARCHIVED",
            "Категория в архиве.",
        )
        FinancePlanRules.requireDirection(category.string("direction"), direction)
        return category.string("name")
    }

    /** A release or sprint of this project; another project's never, an archived one only when already named. */
    fun requireRelease(tx: Transaction, projectId: String, releaseId: String?, keep: String? = null) {
        if (releaseId == null) return
        val release = tx.row(
            "SELECT archived_at IS NOT NULL AS archived FROM app.releases WHERE project_id = $1 AND id = $2",
            projectId,
            releaseId,
        )
        requireCondition(release != null, 422, "FINANCE_RELEASE", "Релиз недоступен в проекте.")
        requireCondition(
            !release.boolean("archived") || releaseId == keep,
            422,
            "FINANCE_RELEASE_ARCHIVED",
            "Релиз в архиве.",
        )
    }
}
