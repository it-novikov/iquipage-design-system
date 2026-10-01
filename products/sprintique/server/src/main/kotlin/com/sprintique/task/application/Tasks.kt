package com.sprintique.task.application

import com.sprintique.command.AuditTrail
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.media.application.Assets
import com.sprintique.media.application.TaskMedia
import com.sprintique.planning.application.PlanningStates
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.domain.TaskContent
import com.sprintique.task.domain.TaskEstimate
import com.sprintique.task.domain.TaskRules
import com.sprintique.workbench.application.PersonalState
import com.sprintique.workspace.application.Assignees

/** Reading and saving tasks. Parent and release changes go through planning, which previews their effects. */
object Tasks {
    private const val PAGE = 200

    /** A task's estimate as `{value, unit}`, or null: the shape of `TaskInput.estimate`. */
    const val ESTIMATE_SQL = "CASE WHEN t.estimate_value IS NULL THEN NULL ELSE " +
        "jsonb_build_object('value', t.estimate_value::float8, 'unit', t.estimate_unit) END"

    // The owner's kind and state tell a service account from a person, and one that can no longer act (SPR-7).
    private val PROJECTION = """t.id, t.project_id AS "projectId", p.key || '-' || t.number AS "displayId", t.revision, t.title,
        t.description, t.status, t.type, t.priority, t.attachment_ids AS "attachmentIds",
        t.cover_attachment_id AS "coverAttachmentId", t.cover_crop AS "coverCrop", t.owner_id AS "ownerId",
        coalesce((SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = t.owner_id), '') AS "ownerName",
        (SELECT o.kind FROM auth.principals o WHERE o.id = t.owner_id) AS "ownerKind",
        ${Assignees.stateSql("t.owner_id", "t.project_id")} AS "ownerState",
        t.owner_label AS "legacyOwner", to_char(t.due, 'YYYY-MM-DD') AS due, t.rank, t.parent_id AS "parentId",
        ${ESTIMATE_SQL} AS estimate,
        t.release_id AS "releaseId", t.preparation, t.result, t.assignment_mode AS "assignmentMode", t.admitted,
        to_char(t.planned_start, 'YYYY-MM-DD') AS "plannedStart", to_char(t.planned_end, 'YYYY-MM-DD') AS "plannedEnd",
        to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
        to_char(t.status_entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "statusEnteredAt",
        ARRAY(SELECT tag_id FROM app.task_tags WHERE project_id = t.project_id AND task_id = t.id ORDER BY tag_id) AS "tagIds""""

    /** A task by its id or its display id (`SPR-12`). */
    fun read(tx: Transaction, projectId: String, id: String): Row {
        val task = tx.row(
            """
            SELECT $PROJECTION FROM app.tasks t JOIN app.projects p ON p.id = t.project_id
            WHERE t.project_id = $1 AND (t.id = $2 OR p.key || '-' || t.number = $2)
            """.trimIndent(),
            projectId,
            id,
        )
        return requirePresent(task, 404, "NOT_FOUND", "Задача недоступна.")
    }

    /** Tasks in number order after the cursor, a page at a time. */
    fun list(tx: Transaction, projectId: String, after: Long): Map<String, Any?> {
        val rows = tx.rows(
            """
            SELECT $PROJECTION, t.number FROM app.tasks t JOIN app.projects p ON p.id = t.project_id
            WHERE t.project_id = $1 AND t.number > $2 ORDER BY t.number LIMIT $3
            """.trimIndent(),
            projectId,
            after,
            PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(PAGE).map { it.without("number") },
            "nextCursor" to if (rows.size > PAGE) rows[PAGE - 1].long("number").toString() else null,
        )
    }

    /** The content of a saved task as a writer would send it back unchanged. */
    fun contentOf(task: Row): TaskContent {
        val crop = task.json("coverCrop")
        return TaskContent(
            attachmentIds = task.strings("attachmentIds"),
            coverAttachmentId = task.stringOrNull("coverAttachmentId"),
            coverCrop = crop,
            coverCropAttachmentId = crop?.path("attachmentId")?.asString(),
            title = task.string("title"),
            description = task.string("description"),
            status = task.string("status"),
            type = task.string("type"),
            priority = task.string("priority"),
            ownerId = task.stringOrNull("ownerId"),
            due = task.stringOrNull("due"),
            rank = task.double("rank"),
            parentId = task.stringOrNull("parentId"),
            releaseId = task.stringOrNull("releaseId"),
            tagIds = task.strings("tagIds"),
            estimate = estimateOf(task),
        )
    }

    /** The estimate of a task row as entered, or null; the task projection writes it as `{value, unit}`. */
    fun estimateOf(task: Row): TaskEstimate? = task.json("estimate")?.takeIf { it.isObject }?.let {
        TaskEstimate(it.path("value").asDouble(), it.path("unit").asString())
    }

    /**
     * One policy for every readback of a saved task: preserved server fields go only to a grant that may also read
     * them; a write-only grant gets its own change back.
     */
    fun saved(actor: Actor, task: Row): Any =
        if (actor.mayRead(Capability.TASKS_READ)) {
            task
        } else {
            linkedMapOf(
                "receipt" to "task",
                "id" to task["id"],
                "projectId" to task["projectId"],
                "displayId" to task["displayId"],
                "revision" to task["revision"],
                "updatedAt" to task["updatedAt"],
                "statusEnteredAt" to task["statusEnteredAt"],
            )
        }

    /** Creates a task or saves new content of an existing one. */
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        value: TaskContent,
        createInBoard: Boolean = false,
    ): Any {
        // Serializes hierarchy changes and number allocation inside this project, not across tenants.
        PlanningStates.lock(tx, actor, projectId, write = true)
        val previous = tx.row(
            """
            SELECT revision, status, parent_id AS "parentId", release_id AS "releaseId", result, owner_id AS "ownerId"
            FROM app.tasks WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            projectId,
            id,
        )
        requireCondition(
            (previous?.long("revision") ?: 0L) == baseRevision,
            409,
            "CONFLICT",
            "Задача уже изменена. Обновите её и повторите действие.",
        )
        if (previous != null) TaskRules.requireOpen(previous.string("result"))
        checkReferences(tx, projectId, id, value)
        val unchangedPlacement = if (previous == null) {
            value.releaseId == null
        } else {
            previous.stringOrNull("parentId") == value.parentId && previous.stringOrNull("releaseId") == value.releaseId
        }
        if (!unchangedPlacement) {
            throw TemporalRules.previewRequired(
                "Измените родителя или релиз через планирование: сначала проверьте последствия.",
            )
        }
        requireCondition(
            previous == null || !createInBoard,
            400,
            "CREATE_ONLY",
            "Допуск при создании нельзя использовать для изменения задачи.",
        )
        requireCondition(
            !createInBoard || actor.isHuman,
            403,
            "APPROVAL_REQUIRED",
            "Агент сначала предлагает подготовку и допуск задачи.",
        )
        // An unchanged owner stays valid even after they leave; a new owner must be a current member.
        if (value.ownerId !=
            previous?.stringOrNull("ownerId")
        ) {
            Assignees.requireAssignable(tx, projectId, value.ownerId)
        }
        if (previous != null) update(tx, projectId, id, value) else insert(tx, projectId, id, value, createInBoard)
        tx.update("DELETE FROM app.task_tags WHERE project_id = $1 AND task_id = $2", projectId, id)
        for (tag in value.tagIds) {
            tx.update("INSERT INTO app.task_tags(project_id, task_id, tag_id) VALUES ($1, $2, $3)", projectId, id, tag)
        }
        val state = PlanningStates.load(tx, projectId)
        TaskRules.validateHierarchy(state.tasks.associateTo(LinkedHashMap()) { it.id to it.parentId })
        TemporalRules.validate(state)
        Assets.linkTaskAssets(
            tx,
            actor,
            projectId,
            id,
            TaskMedia(value.attachmentIds, value.coverAttachmentId, value.coverCrop, value.coverCropAttachmentId),
        )
        val saved = read(tx, projectId, id)
        AuditTrail.record(
            tx,
            actor,
            projectId,
            if (previous != null) "task.updated" else "task.created",
            id,
            saved.long("revision"),
        )
        // The author participates in a new task from the start, privately; leaving is one command (docs/adr W5).
        if (previous == null) PersonalState.joinCreatedTask(tx, actor, projectId, id)
        return saved(actor, saved)
    }

    private fun checkReferences(tx: Transaction, projectId: String, id: String, value: TaskContent) {
        if (value.parentId != null) {
            val ancestry = tx.rows(
                """
                WITH RECURSIVE ancestors AS (
                  SELECT id, parent_id FROM app.tasks WHERE project_id = $1 AND id = $2
                  UNION SELECT t.id, t.parent_id FROM app.tasks t JOIN ancestors a ON a.parent_id = t.id WHERE t.project_id = $1
                ) SELECT id FROM ancestors
                """.trimIndent(),
                projectId,
                value.parentId,
            ).map { it.string("id") }
            requireCondition(ancestry.isNotEmpty(), 422, "TASK_PARENT", "Родительская задача недоступна.")
            requireCondition(id !in ancestry, 422, "TASK_CYCLE", "Задача не может быть своим предком.")
        }
        if (value.tagIds.isNotEmpty()) {
            val tags = tx.rows(
                """
                SELECT id FROM app.tags WHERE project_id = $1 AND id = ANY($2)
                AND (archived_at IS NULL OR id IN (SELECT tag_id FROM app.task_tags WHERE project_id = $1 AND task_id = $3))
                """.trimIndent(),
                projectId,
                value.tagIds,
                id,
            )
            requireCondition(tags.size == value.tagIds.size, 422, "TASK_TAG", "Тег недоступен в проекте.")
        }
        if (value.releaseId != null) {
            val release = tx.row(
                """
                SELECT id FROM app.releases WHERE project_id = $1 AND id = $2
                AND (archived_at IS NULL OR id IN (SELECT release_id FROM app.tasks WHERE project_id = $1 AND id = $3))
                """.trimIndent(),
                projectId,
                value.releaseId,
                id,
            )
            requireCondition(release != null, 422, "TASK_RELEASE", "Релиз недоступен в проекте.")
        }
    }

    private fun update(tx: Transaction, projectId: String, id: String, value: TaskContent) {
        tx.update(
            """
            UPDATE app.tasks SET title = $3, description = $4, status = $5, type = $6, priority = $7,
                   owner_label = CASE WHEN owner_id IS DISTINCT FROM $8 THEN '' ELSE owner_label END, owner_id = $8,
                   due = $9, rank = $10, parent_id = $11, release_id = $12, revision = revision + 1,
                   estimate_value = $13, estimate_unit = $14,
                   updated_at = clock_timestamp(),
                   status_entered_at = CASE WHEN status = $5 THEN status_entered_at ELSE clock_timestamp() END
            WHERE project_id = $1 AND id = $2
            """.trimIndent(),
            *fields(projectId, id, value),
            value.estimate?.value,
            value.estimate?.unit,
        )
    }

    private fun insert(tx: Transaction, projectId: String, id: String, value: TaskContent, createInBoard: Boolean) {
        val number = tx.row(
            """
            UPDATE app.projects SET next_task_number = next_task_number + 1 WHERE id = $1
            RETURNING next_task_number - 1 AS number
            """.trimIndent(),
            projectId,
        )!!.int("number")
        tx.update(
            """
            INSERT INTO app.tasks(project_id, id, title, description, status, type, priority, owner_id, due, rank,
                                  parent_id, release_id, number, revision, preparation, admitted, estimate_value, estimate_unit)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14, $15, $16, $17)
            """.trimIndent(),
            *fields(projectId, id, value),
            number,
            if (createInBoard) "ready" else "draft",
            createInBoard,
            value.estimate?.value,
            value.estimate?.unit,
        )
    }

    private fun fields(projectId: String, id: String, value: TaskContent): Array<Any?> = arrayOf(
        projectId,
        id,
        value.title,
        value.description,
        value.status,
        value.type,
        value.priority,
        value.ownerId,
        value.due,
        value.rank,
        value.parentId,
        value.releaseId,
    )
}
