package com.sprintique.planning.application

import com.sprintique.planning.domain.Release

/** Response shapes shared by planning endpoints. */
object PlanningJson {
    fun page(page: Page<*>): Map<String, Any?> = linkedMapOf(
        "items" to page.items,
        "total" to page.total,
        "nextCursor" to page.nextCursor,
        "projectRevision" to page.projectRevision,
    )

    fun release(release: Release): Map<String, Any?> = linkedMapOf(
        "id" to release.id,
        "projectId" to release.projectId,
        "name" to release.name,
        "revision" to release.revision,
        "scopeRevision" to release.scopeRevision,
        "lifecycle" to release.lifecycle,
        "format" to release.format,
        "plannedStart" to release.plannedStart,
        "plannedEnd" to release.plannedEnd,
        "deadline" to release.deadline,
        "archivedAt" to release.archivedAt,
        "goal" to release.goal,
    )
}
