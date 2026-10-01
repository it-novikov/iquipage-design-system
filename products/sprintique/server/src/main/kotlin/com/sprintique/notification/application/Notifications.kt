package com.sprintique.notification.application

import com.sprintique.access.domain.Permission
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.notification.domain.MentionCandidate
import com.sprintique.notification.domain.Mentions
import com.sprintique.notification.domain.NotificationFacts
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.NotificationText
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.Base64

/**
 * A person's notifications (docs/decisions/0006-notifications-telegram.md): the page of the bell, the unread count,
 * marking read, and mentions raised by the discussion commands. Everything here is personal (docs/adr W2): no audit,
 * no outbox, no idempotency ledger; a notification of a project the person left is hidden by row security.
 */
object Notifications {
    const val PAGE_LIMIT = 20
    private val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    private val CURSOR = Regex("^[A-Za-z0-9_-]{1,200}$")
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun requireHuman(actor: Actor) =
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Уведомления доступны только людям.")

    /** Newest first; the cursor names the last row of the previous page, so new rows never shift a page. */
    fun page(tx: Transaction, actor: Actor, cursor: String?, limit: Int = PAGE_LIMIT): Map<String, Any?> {
        requireHuman(actor)
        val after = cursor?.let(::positionOf)
        val rows = tx.rows(
            """
            SELECT n.id::text AS id, n.kind, n.detail, n.created_at AS "createdAt", n.read_at IS NOT NULL AS read,
                   n.project_id AS "projectId", p.slug, p.name AS "projectName", n.task_id AS "taskId",
                   p.key || '-' || t.number AS "taskKey", t.title, n.actor_id AS "actorId",
                   coalesce(a.profile_name, a.name) AS "actorName",
                   (SELECT v.revision FROM app.person_avatars v WHERE v.principal_id = n.actor_id) AS "avatarRevision"
            FROM app.notifications n
            JOIN app.tasks t ON t.project_id = n.project_id AND t.id = n.task_id
            JOIN app.projects p ON p.id = n.project_id
            LEFT JOIN auth.principals a ON a.id = n.actor_id
            WHERE n.recipient_id = $1
              AND ($2::timestamptz IS NULL OR (n.created_at, n.id) < ($2::timestamptz, $3::uuid))
            ORDER BY n.created_at DESC, n.id DESC LIMIT $4
            """.trimIndent(),
            actor.id,
            after?.first?.toString(),
            after?.second,
            limit + 1,
        )
        val items = rows.take(limit)
        val next = if (rows.size >
            limit
        ) {
            items.last().let { cursorOf(it.instant("createdAt"), it.string("id")) }
        } else {
            null
        }
        return linkedMapOf("items" to items.map(::item), "unread" to unreadCount(tx, actor), "nextCursor" to next)
    }

    fun unread(tx: Transaction, actor: Actor): Map<String, Any?> {
        requireHuman(actor)
        return mapOf("unread" to unreadCount(tx, actor))
    }

    /** Marks the named notifications, and every one up to `before` («Прочитать все» of what the person saw), read. */
    fun markRead(tx: Transaction, actor: Actor, ids: List<String>, before: Instant?): Map<String, Any?> {
        requireHuman(actor)
        requireCondition(ids.all(UUID::matches), 400, "INVALID_REQUEST", "Некорректный запрос.")
        tx.update(
            """
            UPDATE app.notifications SET read_at = clock_timestamp()
            WHERE recipient_id = $1 AND read_at IS NULL
              AND (id = ANY($2::uuid[]) OR ($3::timestamptz IS NOT NULL AND created_at <= $3::timestamptz))
            """.trimIndent(),
            actor.id,
            ids,
            before?.toString(),
        )
        return mapOf("unread" to unreadCount(tx, actor))
    }

    /**
     * Mentions in a message the actor just wrote, in the same transaction. The names are matched here (the database
     * may run without a locale that folds Cyrillic case); the database checks the message, its author and that each
     * person may read the task, and never notifies the author.
     */
    fun raiseMentions(tx: Transaction, actor: Actor, projectId: String, messageId: String, body: String) {
        if ('@' !in body) return
        val people = tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name
            FROM app.project_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND p.kind = 'human' AND p.disabled_at IS NULL
            """.trimIndent(),
            projectId,
        ).map { MentionCandidate(it.string("id"), it.string("name")) }
        for (person in Mentions.find(body, people) - actor.id) {
            tx.row("SELECT app.notify_mention($1, $2, $3) AS raised", projectId, messageId, person)
        }
    }

    /** The project switch «Внешние уведомления» (e-mail and Telegram) as a member sees it. */
    fun projectSwitch(tx: Transaction, actor: Actor, projectId: String, available: Boolean): Map<String, Any?> {
        val membership = requirePresent(
            ProjectAccess.membership(tx, actor, projectId),
            404,
            "NOT_FOUND",
            "Проект недоступен.",
        )
        val row = tx.row(
            "SELECT enabled, revision FROM app.project_notification_settings WHERE project_id = $1",
            projectId,
        )
        return linkedMapOf(
            "available" to available,
            "enabled" to (row?.boolean("enabled") ?: true),
            "revision" to (row?.long("revision") ?: 0L),
            "canChange" to (actor.isHuman && membership.has(Permission.PROJECT_SETTINGS)),
        )
    }

    private fun unreadCount(tx: Transaction, actor: Actor): Int = tx.row(
        "SELECT count(*)::int AS count FROM app.notifications WHERE recipient_id = $1 AND read_at IS NULL",
        actor.id,
    )!!.int("count")

    private fun item(row: Row): Map<String, Any?> {
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
        return linkedMapOf(
            "id" to row.string("id"),
            "kind" to kind.wire,
            "text" to NotificationText.line(facts),
            "read" to row.boolean("read"),
            "createdAt" to row.instant("createdAt").toString(),
            "project" to
                linkedMapOf(
                    "id" to row.string("projectId"), "slug" to row.string("slug"),
                    "name" to row.string("projectName"),
                ),
            "task" to linkedMapOf(
                "id" to row.string("taskId"),
                "key" to row.string("taskKey"),
                "title" to row.string("title"),
            ),
            "actor" to row.stringOrNull("actorId")?.let {
                linkedMapOf(
                    "id" to it, "name" to row.stringOrNull("actorName"),
                    "avatarRevision" to row["avatarRevision"],
                )
            },
        )
    }

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
        return requirePresent(at, 400, "NOTIFICATION_CURSOR", "Страница недоступна.") to parts[1]
    }
}
