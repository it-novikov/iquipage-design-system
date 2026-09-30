package com.sprintique.mcp.application

import com.sprintique.command.CommandLedger
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.discussion.application.Discussions
import com.sprintique.discussion.application.NewThread
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.task.contract.TaskInputRequest
import com.sprintique.task.domain.TaskContent
import com.sprintique.token.Tokens
import com.sprintique.workspace.application.Assignees
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

/**
 * The task tools of the MCP server, over the same use cases as the HTTP API: every read checks project access, every
 * change goes through the task and discussion commands with their write fence, revision check, retry ledger, audit
 * and outbox. Text written by people comes back as data.
 */
@Component
@Profile("api")
class TaskTools(private val ledger: CommandLedger, private val properties: SprintiqueProperties) {
    fun search(tx: Transaction, actor: Actor, input: SearchTasksArguments): Map<String, Any?> {
        input.projectId?.let { ProjectAccess.authorize(tx, actor, it, Capability.TASKS_READ) }
        val offset = input.cursor?.let { cursor ->
            cursor.toIntOrNull()?.takeIf { it in 0..MAX_OFFSET }
                ?: throw ProblemException(400, "CURSOR_INVALID", "Некорректный курсор.")
        } ?: 0
        val query = input.query?.trim()?.takeIf(String::isNotEmpty)
        val pattern = query?.let { "%" + it.replace(Regex("""[\\%_]"""), """\\$0""") + "%" }
        // Only projects the person belongs to, on top of row security; pg_c_utf8 folds Cyrillic case.
        val rows = tx.rows(
            """
            SELECT t.id, t.project_id AS "projectId", p.key || '-' || t.number AS key, t.title, t.status, t.type,
                   t.priority, t.owner_id AS "assigneeId",
                   coalesce((SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = t.owner_id), '')
                     AS "assigneeName",
                   (SELECT o.kind FROM auth.principals o WHERE o.id = t.owner_id) AS "assigneeKind",
                   ${Assignees.stateSql("t.owner_id", "t.project_id")} AS "assigneeState",
                   to_char(t.due, 'YYYY-MM-DD') AS "dueDate", t.release_id AS "releaseId", t.revision,
                   t.updated_at AS "updatedAt", p.slug
            FROM app.tasks t JOIN app.projects p ON p.id = t.project_id
            JOIN app.project_members m ON m.project_id = p.id AND m.principal_id = $1
            WHERE ($2::text IS NULL OR t.project_id = $2)
              AND ($3::text IS NULL OR (t.title) COLLATE pg_c_utf8 ILIKE $4
                   OR (p.key || '-' || t.number) COLLATE pg_c_utf8 ILIKE $4
                   OR to_tsvector('simple', t.title || ' ' || t.description) @@ websearch_to_tsquery('simple', $3))
              AND ($5::text IS NULL OR t.status = $5)
              AND ($6::text IS NULL OR t.owner_id = $6)
            ORDER BY t.updated_at DESC, t.project_id, t.id LIMIT $7 OFFSET $8
            """.trimIndent(),
            actor.id,
            input.projectId,
            query,
            pattern,
            input.status?.wire,
            assignee(actor, input.assigneeId),
            input.limit + 1,
            offset,
        )
        return linkedMapOf(
            "tasks" to rows.take(input.limit).map { row ->
                LinkedHashMap(row.without("slug")).apply { put("url", taskUrl(row.string("slug"), row.string("key"))) }
            },
            "nextCursor" to if (rows.size > input.limit && offset + input.limit <= MAX_OFFSET) {
                (offset + input.limit).toString()
            } else {
                null
            },
        )
    }

    /** A task with its subtasks and its discussions: the latest threads and the latest messages of each. */
    fun get(tx: Transaction, actor: Actor, input: TaskArguments): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, input.projectId, Capability.TASKS_READ)
        val task = Tasks.read(tx, input.projectId, input.task)
        val result = present(tx, input.projectId, task)
        result["subtasks"] = tx.rows(
            """
            SELECT t.id, p.key || '-' || t.number AS key, t.title, t.status FROM app.tasks t
            JOIN app.projects p ON p.id = t.project_id
            WHERE t.project_id = $1 AND t.parent_id = $2 ORDER BY t.number LIMIT $3
            """.trimIndent(),
            input.projectId,
            task.string("id"),
            SUBTASK_LIMIT,
        )
        if (actor.mayRead(Capability.THREADS_READ)) {
            result["discussion"] =
                discussion(tx, input.projectId, task.string("id"))
        }
        return result
    }

    fun create(tx: Transaction, actor: Actor, input: CreateTaskArguments): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, input.projectId, Capability.TASKS_WRITE)
        val key = input.idempotencyKey ?: newKey()
        // A retried call with the same key names the same task, so the ledger sees the same command.
        val id =
            input.idempotencyKey?.let { derived(actor, input.projectId, "task", it) } ?: UUID.randomUUID().toString()
        val parentId = input.parent?.let { Tasks.read(tx, input.projectId, it).string("id") }
        ledger.idempotent(tx, actor, input.projectId, "mcp.task.create", key, input) {
            Tasks.put(
                tx,
                actor,
                input.projectId,
                id,
                0,
                TaskContent(
                    attachmentIds = emptyList(),
                    coverAttachmentId = null,
                    coverCrop = null,
                    coverCropAttachmentId = null,
                    title = input.title,
                    description = input.description,
                    status = "ready",
                    type = input.type.wire,
                    priority = input.priority.wire,
                    ownerId = assignee(actor, input.assigneeId),
                    due = input.dueDate,
                    rank = TaskInputRequest.DEFAULT_RANK,
                    parentId = parentId,
                    releaseId = null,
                    tagIds = emptyList(),
                ),
                false,
            )
        }
        return present(tx, input.projectId, Tasks.read(tx, input.projectId, id))
    }

    /** Changes the named fields only, against the revision the caller last saw. */
    fun update(tx: Transaction, actor: Actor, input: UpdateTaskArguments, raw: JsonNode): Map<String, Any?> {
        val changes = setOf("title", "description", "type", "priority", "assigneeId", "dueDate").filter(raw::has)
        requireCondition(changes.isNotEmpty(), 422, "NOTHING_TO_CHANGE", "Укажите хотя бы одно поле для изменения.")
        return change(tx, actor, input.projectId, input.task, "update", input.idempotencyKey, input) { content ->
            content.copy(
                title = input.title ?: content.title,
                description = input.description ?: content.description,
                type = input.type?.wire ?: content.type,
                priority = input.priority?.wire ?: content.priority,
                ownerId = if (raw.has("assigneeId")) assignee(actor, input.assigneeId) else content.ownerId,
                due = if (raw.has("dueDate")) input.dueDate else content.due,
            ) to input.baseRevision
        }
    }

    fun changeStatus(tx: Transaction, actor: Actor, input: ChangeStatusArguments): Map<String, Any?> =
        change(tx, actor, input.projectId, input.task, "status", input.idempotencyKey, input) { content ->
            content.copy(status = input.status.wire) to input.baseRevision
        }

    /**
     * A comment starts a new discussion, or answers an existing one of the same task. A retry with the same key and
     * arguments finds the first comment, even after the thread moved on.
     */
    fun comment(tx: Transaction, actor: Actor, input: AddCommentArguments): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, input.projectId, Capability.THREADS_WRITE)
        val task = Tasks.read(tx, input.projectId, input.task)
        val taskId = task.string("id")
        requireCondition(
            input.threadId == null || !input.question,
            422,
            "THREAD_KIND",
            "Вопрос начинается новым обсуждением, без threadId.",
        )
        val key = input.idempotencyKey ?: newKey()
        val messageId = input.idempotencyKey?.let { derived(actor, input.projectId, "message", it) }
            ?: UUID.randomUUID().toString()
        val threadId = input.threadId
            ?: input.idempotencyKey?.let { derived(actor, input.projectId, "thread", it) }
            ?: UUID.randomUUID().toString()
        ledger.idempotent(tx, actor, input.projectId, "mcp.comment:$taskId", key, input) {
            if (input.threadId == null) {
                val thread = NewThread(threadId, messageId, input.body, input.question)
                Discussions.create(tx, actor, input.projectId, taskId, thread, key, ledger)
            } else {
                val thread = tx.row(
                    "SELECT revision FROM app.threads WHERE project_id = $1 AND id = $2 AND task_id = $3",
                    input.projectId,
                    threadId,
                    taskId,
                )
                val revision = requirePresent(thread, 404, "NOT_FOUND", "Обсуждение недоступно.").long("revision")
                Discussions.append(
                    tx,
                    actor,
                    input.projectId,
                    threadId,
                    Discussions.NewMessage(messageId, input.body, revision),
                    key,
                    ledger,
                )
            }
            mapOf("threadId" to threadId, "messageId" to messageId)
        }
        return linkedMapOf(
            "taskKey" to task.string("displayId"),
            "threadId" to threadId,
            "messageId" to messageId,
            "url" to taskUrl(slugOf(tx, input.projectId), task.string("displayId")),
        )
    }

    private fun change(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        reference: String,
        kind: String,
        idempotencyKey: String?,
        input: Any,
        edit: (TaskContent) -> Pair<TaskContent, Long>,
    ): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_WRITE)
        val id = Tasks.read(tx, projectId, reference).string("id")
        ledger.idempotent(tx, actor, projectId, "mcp.task.$kind:$id", idempotencyKey ?: newKey(), input) {
            val (content, baseRevision) = edit(Tasks.contentOf(Tasks.read(tx, projectId, id)))
            Tasks.put(tx, actor, projectId, id, baseRevision, content)
        }
        return present(tx, projectId, Tasks.read(tx, projectId, id))
    }

    /** The fields of a task an assistant needs, with its address in the interface. */
    private fun present(tx: Transaction, projectId: String, task: Row): LinkedHashMap<String, Any?> {
        val tags = tx.rows(
            "SELECT name FROM app.tags WHERE project_id = $1 AND id = ANY($2) ORDER BY name",
            projectId,
            task.strings("tagIds"),
        ).map { it.string("name") }
        return linkedMapOf(
            "id" to task["id"],
            "projectId" to projectId,
            "key" to task["displayId"],
            "revision" to task["revision"],
            "title" to task["title"],
            "description" to task["description"],
            "status" to task["status"],
            "type" to task["type"],
            "priority" to task["priority"],
            "assigneeId" to task["ownerId"],
            "assigneeName" to task["ownerName"],
            "assigneeKind" to task["ownerKind"],
            "assigneeState" to task["ownerState"],
            "dueDate" to task["due"],
            "releaseId" to task["releaseId"],
            "parentId" to task["parentId"],
            "tags" to tags,
            "onBoard" to task["admitted"],
            "createdAt" to task["createdAt"],
            "updatedAt" to task["updatedAt"],
            "url" to taskUrl(slugOf(tx, projectId), task.string("displayId")),
        )
    }

    private fun discussion(tx: Transaction, projectId: String, taskId: String): List<Map<String, Any?>> =
        tx.rows(
            """
            SELECT id, requires_resolution AS question, resolved, revision,
                   (SELECT count(*)::int FROM app.messages m WHERE m.project_id = t.project_id AND m.thread_id = t.id)
                     AS "messageCount",
                   last_activity_at AS "lastActivityAt"
            FROM app.threads t WHERE project_id = $1 AND task_id = $2 ORDER BY last_activity_at DESC, id LIMIT $3
            """.trimIndent(),
            projectId,
            taskId,
            THREAD_LIMIT,
        ).map { thread ->
            LinkedHashMap<String, Any?>(thread).apply {
                put(
                    "messages",
                    tx.rows(
                        """
                        SELECT * FROM (
                          SELECT m.id, left(m.body, $3) AS body, length(m.body) > $3 AS truncated,
                                 coalesce(a.profile_name, a.name) AS author, a.kind AS "authorKind",
                                 (SELECT coalesce(o.profile_name, o.name) FROM auth.service_accounts s
                                  JOIN auth.principals o ON o.id = s.owner_id WHERE s.principal_id = a.id)
                                   AS "authorOwner",
                                 m.created_at AS "createdAt"
                          FROM app.messages m JOIN auth.principals a ON a.id = m.author_id
                          WHERE m.project_id = $1 AND m.thread_id = $2 ORDER BY m.created_at DESC, m.id DESC LIMIT $4
                        ) latest ORDER BY "createdAt", id
                        """.trimIndent(),
                        projectId,
                        thread.string("id"),
                        MESSAGE_TEXT_LIMIT,
                        MESSAGE_LIMIT,
                    ),
                )
            }
        }

    /** `me` names the caller itself: an agent takes a task or finds the work handed to its service account. */
    private fun assignee(actor: Actor, id: String?): String? = if (id == ME) actor.id else id

    private fun slugOf(tx: Transaction, projectId: String): String =
        tx.row("SELECT slug FROM app.projects WHERE id = $1", projectId)!!.string("slug")

    /** The task's address in the interface, as the search of the interface builds it. */
    private fun taskUrl(slug: String, key: String): String =
        "${properties.publicOrigin}/?project=${component(slug)}#/task/${component(key)}"

    private fun component(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")

    /** An identifier derived from the caller's retry key: the same key always names the same new object. */
    private fun derived(actor: Actor, projectId: String, kind: String, key: String) =
        "mcp-" + Tokens.sha256Hex("${actor.id}:$projectId:$kind:$key").take(DERIVED_LENGTH)

    private fun newKey() = "mcp-" + UUID.randomUUID()

    private companion object {
        const val MAX_OFFSET = 1000
        const val ME = "me"
        const val SUBTASK_LIMIT = 50
        const val THREAD_LIMIT = 20
        const val MESSAGE_LIMIT = 50
        const val MESSAGE_TEXT_LIMIT = 4000
        const val DERIVED_LENGTH = 32
    }
}
