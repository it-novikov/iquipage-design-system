package com.sprintique.notification.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.notification.domain.Mentions
import com.sprintique.notification.domain.NotificationFacts
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.NotificationText
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.Base64

/**
 * The inbox (docs/decisions/0008-mentions-and-service-inbox.md): the same notification rows as the bell, read the way
 * an agent catches up when it comes back to work. Oldest first, unread only unless asked otherwise, a page at a time;
 * each item says what happened, on which task (key, title, address), who did it, a short quote of the message or the
 * request, and the thread to answer in. Marking read takes ids, or everything up to an item the caller has handled.
 *
 * A service account reads its own inbox, and so may a person; an agent has none. Row security decides the rest: only
 * the caller's own rows, only in projects it can read now (a project it lost hides its rows without deleting them).
 */
object Inbox {
    const val PAGE_LIMIT = 20
    const val PAGE_MAXIMUM = 50
    const val MARK_LIMIT = 100
    private const val QUOTE_LIMIT = 280
    private const val QUOTE_SOURCE = 2000
    private val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    private val CURSOR = Regex("^[A-Za-z0-9_-]{1,200}$")
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    /** A page of the inbox. */
    data class Query(val unreadOnly: Boolean = true, val cursor: String? = null, val limit: Int = PAGE_LIMIT)

    fun requireRecipient(actor: Actor) = requireCondition(
        actor.isHuman || actor.isService,
        403,
        "INBOX_UNAVAILABLE",
        "Входящие есть у людей и сервисных аккаунтов.",
    )

    fun page(tx: Transaction, actor: Actor, query: Query, origin: String): Map<String, Any?> {
        requireRecipient(actor)
        val after = query.cursor?.let(::positionOf)
        val rows = tx.rows(
            """
            SELECT n.id::text AS id, n.kind, n.detail, n.created_at AS "createdAt", n.read_at IS NOT NULL AS read,
                   n.project_id AS "projectId", p.slug, p.name AS "projectName", n.task_id AS "taskId",
                   p.key || '-' || t.number AS "taskKey", t.title, n.actor_id AS "actorId",
                   coalesce(a.profile_name, a.name) AS "actorName", a.kind AS "actorKind",
                   r.id::text AS "requestId", r.kind AS "requestKind", r.thread_id AS "requestThreadId",
                   left(CASE n.kind
                     WHEN 'mention' THEN (SELECT m.body FROM app.messages m
                       WHERE m.project_id = n.project_id AND m.id = n.detail->>'messageId')
                     WHEN 'request' THEN coalesce(nullif(r.note, ''), (SELECT m.body FROM app.messages m
                       WHERE m.project_id = r.project_id AND m.thread_id = r.thread_id ORDER BY m.created_at, m.id LIMIT 1))
                   END, $6) AS quote
            FROM app.notifications n
            JOIN app.tasks t ON t.project_id = n.project_id AND t.id = n.task_id
            JOIN app.projects p ON p.id = n.project_id
            LEFT JOIN auth.principals a ON a.id = n.actor_id
            LEFT JOIN app.attention_requests r ON n.kind = 'request' AND r.project_id = n.project_id
              AND r.id::text = n.detail->>'requestId'
            WHERE n.recipient_id = $1 AND (NOT $2::boolean OR n.read_at IS NULL)
              AND ($3::timestamptz IS NULL OR (n.created_at, n.id) > ($3::timestamptz, $4::uuid))
            ORDER BY n.created_at, n.id LIMIT $5
            """.trimIndent(),
            actor.id,
            query.unreadOnly,
            after?.first?.toString(),
            after?.second,
            query.limit + 1,
            QUOTE_SOURCE,
        )
        val items = rows.take(query.limit)
        val names = memberNames(tx, items)
        val last = items.lastOrNull()
        val more = rows.size > query.limit && last != null
        val next = if (more) cursorOf(last.instant("createdAt"), last.string("id")) else null
        return linkedMapOf(
            "items" to items.map { item(it, names[it.string("projectId")].orEmpty(), origin) },
            "unread" to unreadCount(tx, actor),
            "nextCursor" to next,
        )
    }

    /**
     * Marks the named items read, and with [upTo] every unread item up to and including that one, in inbox order. An
     * id the caller cannot see changes nothing. Returns how many were marked and how many stay unread.
     */
    fun markRead(tx: Transaction, actor: Actor, ids: List<String>, upTo: String?): Map<String, Any?> {
        requireRecipient(actor)
        requireCondition(
            ids.size <= MARK_LIMIT && ids.all(UUID::matches) && (upTo == null || UUID.matches(upTo)),
            400,
            "INVALID_REQUEST",
            "Некорректный запрос.",
        )
        requireCondition(ids.isNotEmpty() || upTo != null, 400, "INVALID_REQUEST", "Укажите ids или upTo.")
        val marked = tx.update(
            """
            UPDATE app.notifications SET read_at = clock_timestamp()
            WHERE recipient_id = $1 AND read_at IS NULL
              AND (id = ANY($2::uuid[]) OR ($3::uuid IS NOT NULL AND (created_at, id) <= (
                SELECT u.created_at, u.id FROM app.notifications u WHERE u.id = $3::uuid AND u.recipient_id = $1)))
            """.trimIndent(),
            actor.id,
            ids,
            upTo,
        )
        return linkedMapOf("marked" to marked, "unread" to unreadCount(tx, actor))
    }

    private fun unreadCount(tx: Transaction, actor: Actor): Int = tx.row(
        """
        SELECT count(*)::int AS count FROM app.notifications n
        JOIN app.tasks t ON t.project_id = n.project_id AND t.id = n.task_id
        WHERE n.recipient_id = $1 AND n.read_at IS NULL
        """.trimIndent(),
        actor.id,
    )!!.int("count")

    /** Current names of the members named by mention tokens in the page's quotes, per project. */
    private fun memberNames(tx: Transaction, items: List<Row>): Map<String, Map<String, String>> {
        val wanted = items.mapNotNull { row -> row.stringOrNull("quote")?.let { row.string("projectId") to it } }
            .flatMap { (project, quote) -> Mentions.TOKEN.findAll(quote).map { project to it.groupValues[2] }.toList() }
            .distinct()
        if (wanted.isEmpty()) return emptyMap()
        return tx.rows(
            """
            SELECT m.project_id AS "projectId", p.id, coalesce(p.profile_name, p.name) AS name
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = ANY($1::text[]) AND m.principal_id = ANY($2::text[]) AND p.disabled_at IS NULL
            """.trimIndent(),
            wanted.map { it.first }.distinct(),
            wanted.map { it.second }.distinct(),
        ).groupBy { it.string("projectId") }
            .mapValues { (_, rows) -> rows.associate { it.string("id") to it.string("name") } }
    }

    private fun item(row: Row, names: Map<String, String>, origin: String): Map<String, Any?> {
        val detail = row.json("detail")
        val kind = requireNotNull(NotificationKind.fromWire(row.string("kind")))
        val facts = NotificationFacts(
            kind = kind,
            actorName = row.stringOrNull("actorName"),
            taskTitle = row.string("title"),
            requestKind = detail.text("requestKind"),
            due = detail.text("due")?.let(::dateOrNull),
            raisedOn = detail.text("on")?.let(::dateOrNull),
        )
        val threadId = when (kind) {
            NotificationKind.MENTION -> detail.text("threadId")
            NotificationKind.REQUEST -> row.stringOrNull("requestThreadId")
            else -> null
        }
        return linkedMapOf(
            "id" to row.string("id"),
            "kind" to kind.wire,
            "text" to NotificationText.line(facts),
            "read" to row.boolean("read"),
            "createdAt" to row.instant("createdAt").toString(),
            "project" to linkedMapOf("id" to row.string("projectId"), "name" to row.string("projectName")),
            "task" to linkedMapOf(
                "id" to row.string("taskId"),
                "key" to row.string("taskKey"),
                "title" to row.string("title"),
                "url" to taskUrl(origin, row.string("slug"), row.string("taskKey")),
            ),
            "actor" to row.stringOrNull("actorId")?.let {
                linkedMapOf(
                    "id" to it,
                    "name" to row.stringOrNull("actorName"),
                    "kind" to row.stringOrNull("actorKind"),
                )
            },
            "quote" to row.stringOrNull("quote")?.let { quote(it, names) },
            "threadId" to threadId,
            "messageId" to if (kind == NotificationKind.MENTION) detail.text("messageId") else null,
            "request" to row.stringOrNull("requestId")?.let {
                linkedMapOf("id" to it, "kind" to row.stringOrNull("requestKind"))
            },
            "due" to if (kind == NotificationKind.DEADLINE) detail.text("due") else null,
        )
    }

    /** One line of at most 280 characters, mentions as «@Имя» with current names. */
    fun quote(source: String, names: Map<String, String>): String? {
        val text = Mentions.plainText(source, names).replace(Regex("\\s+"), " ").trim()
        if (text.isEmpty()) return null
        return if (text.length > QUOTE_LIMIT) text.take(QUOTE_LIMIT - 1).trimEnd() + "…" else text
    }

    /** The task's address in the interface, as the search of the interface builds it. */
    fun taskUrl(origin: String, slug: String, key: String): String =
        "$origin/?project=${component(slug)}#/task/${component(key)}"

    private fun component(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")

    private fun JsonNode?.text(name: String): String? =
        this?.get(name)?.takeIf { it.isString }?.asString()

    private fun dateOrNull(value: String): LocalDate? = try {
        LocalDate.parse(value)
    } catch (_: DateTimeParseException) {
        null
    }

    private fun cursorOf(at: Instant, id: String): String = encoder.encodeToString("$at|$id".toByteArray())

    private fun positionOf(cursor: String): Pair<Instant, String> {
        val parts = if (CURSOR.matches(cursor)) {
            runCatching { String(Base64.getUrlDecoder().decode(cursor)).split('|') }.getOrDefault(emptyList())
        } else {
            emptyList()
        }
        val at = parts.takeIf { it.size == 2 && UUID.matches(it[1]) }
            ?.let { runCatching { Instant.parse(it[0]) }.getOrNull() }
        return requirePresent(at, 400, "INBOX_CURSOR", "Страница недоступна.") to parts[1]
    }
}
