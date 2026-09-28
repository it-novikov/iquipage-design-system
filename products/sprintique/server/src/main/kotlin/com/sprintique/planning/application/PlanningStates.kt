package com.sprintique.planning.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.domain.CreationContext
import com.sprintique.planning.domain.Dependency
import com.sprintique.planning.domain.Milestone
import com.sprintique.planning.domain.PlanningDefaults
import com.sprintique.planning.domain.PlanningEntity
import com.sprintique.planning.domain.PlanningState
import com.sprintique.planning.domain.ProjectPerson
import com.sprintique.planning.domain.Release
import com.sprintique.planning.domain.TaskState
import com.sprintique.planning.domain.TemporalConstraint
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode

/** The project's plan as one aggregate: its lock and its complete state. */
object PlanningStates {
    /** The project's planning revision and effective time zone, read under the aggregate lock. */
    data class Lock(val revision: Long, val timezone: String?)

    const val RELEASE_PROJECTION = """id, project_id AS "projectId", name, revision, scope_revision::float8 AS "scopeRevision",
        lifecycle, format, to_char(planned_start, 'YYYY-MM-DD') AS "plannedStart",
        to_char(planned_end, 'YYYY-MM-DD') AS "plannedEnd", to_char(deadline, 'YYYY-MM-DD') AS deadline,
        archived_at AS "archivedAt""""

    private const val MEMBER_LIMIT = 500

    private val TASKS = """
        SELECT t.id, p.key || '-' || t.number AS "displayId", t.revision, t.parent_id AS "parentId", t.title, t.type,
               t.status, t.attachment_ids AS "attachmentIds", t.cover_attachment_id AS "coverAttachmentId",
               t.cover_crop AS "coverCrop", t.owner_id AS "ownerId", t.owner_label AS "legacyOwner", t.priority, t.rank,
               to_char(t.status_entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "statusEnteredAt",
               to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
               t.preparation, t.result, t.admitted, t.assignment_mode AS "assignmentMode", t.release_id AS "releaseId",
               to_char(t.planned_start, 'YYYY-MM-DD') AS "plannedStart", to_char(t.planned_end, 'YYYY-MM-DD') AS "plannedEnd",
               to_char(t.due, 'YYYY-MM-DD') AS due,
               ARRAY(SELECT tag_id FROM app.task_tags WHERE project_id = t.project_id AND task_id = t.id ORDER BY tag_id) AS "tagIds"
        FROM app.tasks t JOIN app.projects p ON p.id = t.project_id WHERE t.project_id = $1 ORDER BY t.number LIMIT 10001
    """.trimIndent()

    /**
     * Takes the project row, then checks access and the live credential again: a command queued behind another
     * one must not run on rights that were revoked while it waited.
     */
    fun lock(tx: Transaction, actor: Actor, projectId: String, write: Boolean = false): Lock {
        val capability = if (write) Capability.TASKS_WRITE else Capability.TASKS_READ
        ProjectAccess.authorize(tx, actor, projectId, capability)
        val row = tx.row(
            """
            SELECT p.planning_revision AS revision, auth.project_timezone(p.id) AS timezone
            FROM app.projects p WHERE p.id = $1 FOR UPDATE OF p
            """.trimIndent(),
            projectId,
        )
        val locked = requirePresent(row, 404, "NOT_FOUND", "Проект недоступен.")
        ProjectAccess.authorize(tx, actor, projectId, capability)
        ProjectAccess.requireActiveCredential(tx, actor)
        return Lock(locked.long("revision"), locked.stringOrNull("timezone"))
    }

    fun load(tx: Transaction, projectId: String): PlanningState {
        val tasks = tx.rows(TASKS, projectId).map(::taskOf)
        val releases = tx.rows(
            "SELECT $RELEASE_PROJECTION FROM app.releases WHERE project_id = $1 ORDER BY id LIMIT 1001",
            projectId,
        ).map(::releaseOf)
        val milestones = tx.rows(
            """
            SELECT id, title, to_char(date, 'YYYY-MM-DD') AS date, revision, release_id AS "releaseId"
            FROM app.milestones WHERE project_id = $1 ORDER BY id LIMIT 10001
            """.trimIndent(),
            projectId,
        ).map {
            Milestone(
                it.string("id"),
                it.string("title"),
                it.stringOrNull("date"),
                it.int("revision"),
                it.stringOrNull("releaseId"),
            )
        }
        val constraints = tx.rows(
            """
            SELECT id, revision, source_kind, source_id, target_kind, target_id, relation, lag_days
            FROM app.temporal_constraints WHERE project_id = $1 ORDER BY id LIMIT 10001
            """.trimIndent(),
            projectId,
        ).map(::constraintOf)
        val dependencies = tx.rows(
            """
            SELECT id, from_id AS "fromId", to_id AS "toId" FROM app.task_links
            WHERE project_id = $1 AND kind = 'depends' AND archived_at IS NULL LIMIT 10001
            """.trimIndent(),
            projectId,
        ).map { Dependency(it.string("id"), it.string("fromId"), it.string("toId")) }
        val project = tx.row(
            """
            SELECT key, next_task_number AS number, planning_defaults->>'format' AS format,
                   (planning_defaults->>'days')::int AS days, auth.project_timezone(id) AS timezone,
                   timezone IS NULL AS "timezoneInherited",
                   to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
            FROM app.projects WHERE id = $1
            """.trimIndent(),
            projectId,
        ).let { requirePresent(it, 404, "NOT_FOUND", "Проект недоступен.") }
        val members = tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name FROM app.project_members m
            JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND p.kind = 'human' ORDER BY name, p.id LIMIT $2
            """.trimIndent(),
            projectId,
            MEMBER_LIMIT + 1,
        ).map { ProjectPerson(it.string("id"), it.string("name")) }
        TemporalRules.requireWithinLimits(
            tasks.size,
            releases.size,
            milestones.size,
            constraints.size,
            dependencies.size,
        )
        return PlanningState(
            tasks = tasks,
            releases = releases,
            milestones = milestones,
            constraints = constraints,
            dependencies = dependencies,
            defaults = PlanningDefaults(
                project.string("format"),
                project.int("days"),
                project.stringOrNull("timezone"),
                project.boolean("timezoneInherited"),
            ),
            creation = CreationContext(
                projectId,
                project.string("key"),
                project.int("number"),
                project.string("createdAt"),
            ),
            members = members,
        )
    }

    private fun taskOf(row: Row) = TaskState(
        id = row.string("id"),
        displayId = row.string("displayId"),
        revision = row.int("revision"),
        parentId = row.stringOrNull("parentId"),
        title = row.string("title"),
        type = row.string("type"),
        status = row.string("status"),
        attachmentIds = row.strings("attachmentIds"),
        coverAttachmentId = row.stringOrNull("coverAttachmentId"),
        coverCrop = row["coverCrop"] as JsonNode?,
        ownerId = row.stringOrNull("ownerId"),
        legacyOwner = row.string("legacyOwner"),
        priority = row.string("priority"),
        rank = row.double("rank"),
        statusEnteredAt = row.string("statusEnteredAt"),
        createdAt = row.string("createdAt"),
        preparation = row.string("preparation"),
        result = row.string("result"),
        admitted = row.boolean("admitted"),
        assignmentMode = row.string("assignmentMode"),
        releaseId = row.stringOrNull("releaseId"),
        plannedStart = row.stringOrNull("plannedStart"),
        plannedEnd = row.stringOrNull("plannedEnd"),
        due = row.stringOrNull("due"),
        tagIds = row.strings("tagIds"),
    )

    fun releaseOf(row: Row) = Release(
        id = row.string("id"),
        projectId = row.string("projectId"),
        name = row.string("name"),
        revision = row.int("revision"),
        scopeRevision = row.double("scopeRevision"),
        lifecycle = row.string("lifecycle"),
        format = row.string("format"),
        plannedStart = row.stringOrNull("plannedStart"),
        plannedEnd = row.stringOrNull("plannedEnd"),
        deadline = row.stringOrNull("deadline"),
        archivedAt = row.instantOrNull("archivedAt"),
    )

    private fun constraintOf(row: Row) = TemporalConstraint(
        id = row.string("id"),
        revision = row.int("revision"),
        source = PlanningEntity(row.string("source_kind"), row.string("source_id")),
        target = PlanningEntity(row.string("target_kind"), row.string("target_id")),
        relation = row.string("relation"),
        lagDays = row.int("lag_days"),
    )
}
