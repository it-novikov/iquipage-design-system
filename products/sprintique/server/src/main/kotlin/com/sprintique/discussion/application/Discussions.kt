package com.sprintique.discussion.application

import com.sprintique.ai.application.AgentMentions
import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.command.Receipt
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.notification.application.Notifications
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.workbench.application.AttentionRequests
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
import java.util.Base64

/** A new discussion on a task: its id, the id and text of its first message, and whether it is a question. */
data class NewThread(val id: String, val messageId: String, val body: String, val requiresResolution: Boolean)

/**
 * Discussions on tasks: comments, and questions that wait for a resolution. Threads are append-only; every message
 * and resolution raises the thread's revision.
 */
object Discussions {
    private const val MESSAGE_LIMIT = 2000
    private const val CURSOR_VERSION_LIMIT = 200
    private val CURSOR_ANCHOR = Regex("^[A-Za-z0-9_-]{1,100}$")
    private val json = JsonMapper.builder().build()

    private const val PROJECTION = """id, project_id AS "projectId", task_id AS "taskId", revision,
        requires_resolution AS "requiresResolution", resolved,
        CASE WHEN resolved THEN json_build_object('actorId', resolved_by,
          'at', to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE null END AS resolution,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(last_activity_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastActivityAt""""

    fun read(tx: Transaction, projectId: String, id: String): Map<String, Any?> {
        val thread = tx.row("SELECT $PROJECTION FROM app.threads WHERE project_id = $1 AND id = $2", projectId, id)
        val found = requirePresent(thread, 404, "NOT_FOUND", "Обсуждение недоступно.")
        val messages = tx.rows(
            """
            SELECT id, body, author_id AS "authorId",
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
            FROM app.messages WHERE project_id = $1 AND thread_id = $2 ORDER BY created_at, id LIMIT $3
            """.trimIndent(),
            projectId,
            id,
            MESSAGE_LIMIT + 1,
        )
        // An explicit cap until messages are paged: a discussion is never truncated silently.
        requireCondition(
            messages.size <= MESSAGE_LIMIT,
            409,
            "THREAD_LIMIT",
            "Обсуждение достигло лимита сообщений.",
        )
        return LinkedHashMap<String, Any?>(found).apply { put("messages", messages) }
    }

    /**
     * A page of a task's discussions: open questions first, then by latest activity. The cursor carries a version
     * of the whole list (count and revision sum), so a page after any change is refused rather than shifted.
     */
    fun page(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        cursor: String?,
        limit: Int,
    ): Map<String, Any?> {
        Tasks.read(tx, projectId, taskId)
        val position = cursor?.let { positionOf(it, projectId, taskId) }
        val result = tx.row(PAGE_QUERY, projectId, taskId, position?.after, limit + 1, actor.id)!!
        if (position != null) {
            requireCondition(
                position.version == result.string("version"),
                409,
                "THREAD_CURSOR_STALE",
                "Обсуждения изменились. Обновите список.",
            )
            requireCondition(result.boolean("anchorFound"), 400, "THREAD_CURSOR", "Страница недоступна.")
        }
        val all = result.json("items")!!.values().toList()
        val items = all.take(limit)
        val next = if (all.size > limit) {
            encode(
                linkedMapOf(
                    "projectId" to projectId,
                    "taskId" to taskId,
                    "version" to result.string("version"),
                    "after" to items.last().path("id").asString(),
                ),
            )
        } else {
            null
        }
        return linkedMapOf(
            "items" to items,
            "total" to result.int("total"),
            "unresolved" to result.int("unresolved"),
            "unread" to result.int("unread"),
            "nextCursor" to next,
        )
    }

    fun create(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        thread: NewThread,
        key: String,
        ledger: CommandLedger,
    ): Any {
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.THREADS_WRITE)
        return ledger.idempotent(
            tx, actor, projectId, "thread.create:$taskId", key, thread, receipt(tx, actor, projectId, thread.messageId),
        ) {
            Tasks.read(tx, projectId, taskId)
            tx.update(
                "INSERT INTO app.threads(project_id, id, task_id, requires_resolution) VALUES ($1, $2, $3, $4)",
                projectId,
                thread.id,
                taskId,
                thread.requiresResolution,
            )
            tx.update(
                "INSERT INTO app.messages(project_id, id, thread_id, body, author_id) VALUES ($1, $2, $3, $4, $5)",
                projectId,
                thread.messageId,
                thread.id,
                thread.body,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "thread.created", thread.id, 1)
            Notifications.raiseMentions(tx, actor, projectId, thread.messageId, thread.body)
            AgentMentions.start(tx, actor, projectId, thread.messageId, thread.body)
            visible(actor, read(tx, projectId, thread.id), thread.messageId)
        }
    }

    /** A new message: its id, its text and the thread revision the author saw. */
    data class NewMessage(val id: String, val body: String, val baseRevision: Long)

    fun append(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        threadId: String,
        message: NewMessage,
        key: String,
        ledger: CommandLedger,
    ): Any {
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.THREADS_WRITE)
        return ledger.idempotent(
            tx, actor, projectId, "thread.append:$threadId", key, message, receipt(tx, actor, projectId, message.id),
        ) {
            lock(tx, projectId, threadId, message.baseRevision)
            val count = tx.row(
                "SELECT count(*)::int AS count FROM app.messages WHERE project_id = $1 AND thread_id = $2",
                projectId,
                threadId,
            )!!.int("count")
            requireCondition(count < MESSAGE_LIMIT, 409, "THREAD_LIMIT", "Создайте новое обсуждение.")
            tx.update(
                "INSERT INTO app.messages(project_id, id, thread_id, body, author_id) VALUES ($1, $2, $3, $4, $5)",
                projectId,
                message.id,
                threadId,
                message.body,
                actor.id,
            )
            tx.update(
                """
                UPDATE app.threads SET revision = revision + 1, last_activity_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                threadId,
            )
            AuditTrail.record(tx, actor, projectId, "thread.message-added", threadId, message.baseRevision + 1)
            Notifications.raiseMentions(tx, actor, projectId, message.id, message.body)
            AgentMentions.start(tx, actor, projectId, message.id, message.body)
            visible(actor, read(tx, projectId, threadId), message.id)
        }
    }

    /** A comment can become a question and an open question a comment; a resolved question keeps its kind. */
    fun changeKind(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        requiresResolution: Boolean,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
    ): Any {
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.THREADS_WRITE)
        val input = mapOf("requiresResolution" to requiresResolution, "baseRevision" to baseRevision)
        val receipt = receipt(tx, actor, projectId, null)
        return ledger.idempotent(tx, actor, projectId, "thread.kind:$id", key, input, receipt) {
            val current = lock(tx, projectId, id, baseRevision)
            requireCondition(
                !current.boolean("resolved"),
                422,
                "THREAD_KIND",
                "Решённый вопрос нельзя превратить в комментарий. Сначала откройте его снова.",
            )
            if (current.boolean("requires_resolution") != requiresResolution) {
                tx.update(
                    """
                    UPDATE app.threads SET requires_resolution = $3, revision = revision + 1
                    WHERE project_id = $1 AND id = $2
                    """.trimIndent(),
                    projectId,
                    id,
                    requiresResolution,
                )
                AuditTrail.record(tx, actor, projectId, "thread.kind-changed", id, baseRevision + 1)
            }
            visible(actor, read(tx, projectId, id), null)
        }
    }

    fun resolve(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        resolved: Boolean,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
    ): Any {
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.THREADS_WRITE)
        val input = mapOf("resolved" to resolved, "baseRevision" to baseRevision)
        val receipt = receipt(tx, actor, projectId, null)
        return ledger.idempotent(tx, actor, projectId, "thread.resolve:$id", key, input, receipt) {
            val previous = lock(tx, projectId, id, baseRevision)
            requireCondition(
                previous.boolean("requires_resolution"),
                422,
                "THREAD_RESOLUTION",
                "Обычный комментарий не требует решения.",
            )
            tx.update(
                """
                UPDATE app.threads SET resolved = $3, resolved_by = CASE WHEN $3 THEN $4 ELSE null END,
                       resolved_at = CASE WHEN $3 THEN clock_timestamp() ELSE null END, revision = revision + 1,
                       last_activity_at = clock_timestamp()
                WHERE project_id = $1 AND id = $2
                """.trimIndent(),
                projectId,
                id,
                resolved,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "thread.resolution-changed", id, baseRevision + 1)
            // A resolved question resolves the directed requests made on it, in this transaction (docs/adr W1).
            if (resolved) AttentionRequests.resolveForThread(tx, actor, projectId, id)
            visible(actor, read(tx, projectId, id), null)
        }
    }

    /**
     * Moves the caller's read marker forward to the activity they have seen, never past the thread's own activity.
     * Clients see activity to the millisecond while it is stored to the microsecond: having seen the millisecond
     * means having seen the activity itself.
     */
    fun markRead(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        seenActivityAt: String,
    ): Map<String, Any> {
        val result = tx.row(
            """
            INSERT INTO app.thread_reads(project_id, thread_id, principal_id, read_at)
            SELECT t.project_id, t.id, $3,
                   CASE WHEN $4::timestamptz >= date_trunc('milliseconds', t.last_activity_at) THEN t.last_activity_at
                        ELSE $4::timestamptz END
            FROM app.threads t WHERE t.project_id = $1 AND t.id = $2
            ON CONFLICT(project_id, thread_id, principal_id) DO UPDATE SET read_at = GREATEST(app.thread_reads.read_at, EXCLUDED.read_at)
            RETURNING to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt"
            """.trimIndent(),
            projectId,
            id,
            actor.id,
            seenActivityAt,
        )
        val marker = requirePresent(result, 404, "NOT_FOUND", "Обсуждение недоступно.")
        return linkedMapOf("threadId" to id, "readAt" to marker.string("readAt"))
    }

    private fun lock(tx: Transaction, projectId: String, id: String, revision: Long): Row {
        val row = tx.row(
            """
            SELECT revision, requires_resolution, resolved FROM app.threads WHERE project_id = $1 AND id = $2 FOR UPDATE
            """.trimIndent(),
            projectId,
            id,
        )
        val previous = requirePresent(row, 404, "NOT_FOUND", "Обсуждение недоступно.")
        requireCondition(previous.long("revision") == revision, 409, "CONFLICT", "Обсуждение уже изменено.")
        return previous
    }

    /**
     * Readback of an append or a resolution would otherwise hand a write-only grant the replies already in the thread:
     * without `threads:read` only the caller's own message comes back.
     */
    private fun visible(actor: Actor, thread: Map<String, Any?>, ownMessageId: String?): Map<String, Any?> {
        if (actor.mayRead(Capability.THREADS_READ)) return thread
        @Suppress("UNCHECKED_CAST")
        val messages = (thread["messages"] as List<Row>).filter { it["id"] == ownMessageId }
        return LinkedHashMap(thread).apply {
            put("receipt", "thread")
            put("messages", messages)
        }
    }

    /**
     * The retry receipt keeps identifiers only; the thread is read back from current state, so N appends cost N
     * bounded ledger rows instead of N copies of a growing transcript.
     */
    private fun receipt(tx: Transaction, actor: Actor, projectId: String, ownMessageId: String?) =
        object : Receipt<Map<String, Any?>> {
            override fun store(
                value: Map<String, Any?>,
            ): Any = mapOf("thread" to value["id"], "message" to ownMessageId)

            override fun restore(record: JsonNode): Any {
                val thread = record.path("thread")
                // Receipts written before this ledger hold the whole thread; the read policy still applies.
                if (!thread.isString) return visibleStored(actor, record, ownMessageId)
                val message = record.path("message").takeIf { it.isString }?.asString()
                return visible(actor, read(tx, projectId, thread.asString()), message)
            }
        }

    private fun visibleStored(actor: Actor, record: JsonNode, ownMessageId: String?): Any {
        if (actor.mayRead(Capability.THREADS_READ) || record !is ObjectNode) return record
        val copy = record.deepCopy()
        val messages = json.createArrayNode()
        record.path("messages").values().filter { it.path("id").asString() == ownMessageId }.forEach(messages::add)
        copy.put("receipt", "thread")
        copy.set("messages", messages)
        return copy
    }

    private data class Position(val version: String, val after: String)

    private fun positionOf(cursor: String, projectId: String, taskId: String): Position {
        val value = runCatching { json.readTree(Base64.getUrlDecoder().decode(cursor)) }.getOrNull()
        requireCondition(
            value != null && value.isObject && listOf("projectId", "taskId", "version", "after").all(value::has),
            400,
            "THREAD_CURSOR",
            "Некорректная страница.",
        )
        requireCondition(
            value.path("projectId").let { it.isString && it.asString() == projectId } &&
                value.path("taskId").let { it.isString && it.asString() == taskId },
            400,
            "THREAD_CURSOR_SCOPE",
            "Страница относится к другой задаче.",
        )
        val version = value.path("version")
        val after = value.path("after")
        requireCondition(
            version.isString && version.asString().length <= CURSOR_VERSION_LIMIT && after.isString &&
                CURSOR_ANCHOR.matches(after.asString()),
            400,
            "THREAD_CURSOR",
            "Некорректная страница.",
        )
        return Position(version.asString(), after.asString())
    }

    private fun encode(value: Any): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsBytes(value))

    /**
     * One statement gives the counts, the cursor anchor and the page the same snapshot. The version is the thread
     * count and revision sum: it changes with every message and resolution, without hashing any thread body.
     */
    private val PAGE_QUERY = """
        WITH stats AS (
          SELECT count(*)::int AS total,
            count(*) FILTER (WHERE requires_resolution AND NOT resolved)::int AS unresolved,
            count(*)::text || ':' || coalesce(sum(revision), 0)::text AS version,
            -- Unread: activity after the person's marker, unless the person wrote the latest message themselves.
            count(*) FILTER (WHERE NOT resolved AND last_activity_at > coalesce((SELECT r.read_at FROM app.thread_reads r
              WHERE r.project_id = $1 AND r.thread_id = t.id AND r.principal_id = $5), '-infinity') AND coalesce((SELECT m.author_id
              FROM app.messages m WHERE m.project_id = $1 AND m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1), '') <> $5)::int AS unread
          FROM app.threads t WHERE project_id = $1 AND task_id = $2
        ), anchor AS (
          SELECT requires_resolution AND NOT resolved AS pending, last_activity_at, id
          FROM app.threads WHERE project_id = $1 AND task_id = $2 AND id = $3
        ), selected AS MATERIALIZED (
          SELECT $PROJECTION, row_number() OVER (ORDER BY (requires_resolution AND NOT resolved) DESC, last_activity_at DESC, id) AS "pageOrder"
          FROM app.threads t
          WHERE project_id = $1 AND task_id = $2 AND ($3::text IS NULL OR EXISTS (
            SELECT 1 FROM anchor a WHERE
              (t.requires_resolution AND NOT t.resolved) < a.pending OR
              (t.requires_resolution AND NOT t.resolved) = a.pending AND
                (t.last_activity_at < a.last_activity_at OR t.last_activity_at = a.last_activity_at AND t.id > a.id)
          ))
          ORDER BY (requires_resolution AND NOT resolved) DESC, last_activity_at DESC, id LIMIT $4
        ), message_counts AS (
          SELECT m.thread_id, count(*)::int AS count, (array_agg(m.author_id ORDER BY m.created_at DESC, m.id DESC))[1] AS last_author
          FROM app.messages m JOIN selected s ON s.id = m.thread_id
          WHERE m.project_id = $1 GROUP BY m.thread_id
        )
        SELECT stats.*, EXISTS(SELECT 1 FROM anchor) AS "anchorFound",
          coalesce((SELECT jsonb_agg(value ORDER BY "pageOrder") FROM (
            SELECT s."pageOrder",
              (to_jsonb(s) - 'pageOrder') || jsonb_build_object('summary', true, 'messageCount', coalesce(c.count, 0),
                'lastAuthorId', c.last_author, 'participants', coalesce(people.ids, '[]'::jsonb),
                'readAt', to_char(seen.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'messages', jsonb_build_array(jsonb_build_object('body', coalesce(first.body, ''), 'authorId', first.author_id,
                  'createdAt', to_char(first.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))) AS value
            FROM selected s LEFT JOIN message_counts c ON c.thread_id = s.id
            LEFT JOIN LATERAL (SELECT left(m.body, 160) AS body, m.author_id, m.created_at FROM app.messages m
              WHERE m.project_id = $1 AND m.thread_id = s.id ORDER BY m.created_at, m.id LIMIT 1) first ON true
            -- Up to four distinct authors, most recent first: the replies toggle shows who answered.
            LEFT JOIN LATERAL (SELECT jsonb_agg(p.author_id ORDER BY p.latest DESC) AS ids FROM (
              SELECT m.author_id, max(m.created_at) AS latest FROM app.messages m
              WHERE m.project_id = $1 AND m.thread_id = s.id GROUP BY m.author_id ORDER BY latest DESC LIMIT 4) p) people ON true
            LEFT JOIN app.thread_reads seen ON seen.project_id = $1 AND seen.thread_id = s.id AND seen.principal_id = $5
          ) summaries), '[]'::jsonb) AS items FROM stats
    """.trimIndent()
}
