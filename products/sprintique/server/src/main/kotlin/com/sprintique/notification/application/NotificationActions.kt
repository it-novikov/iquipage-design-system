package com.sprintique.notification.application

import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.discussion.application.Discussions
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.notification.domain.QuickAction
import com.sprintique.notification.domain.QuickActionText
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.workbench.application.AttentionRequests
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.UUID

/** What a quick action carries besides its name: a reply's text, or the date a deadline moves to. */
data class QuickActionInput(val text: String? = null, val due: String? = null)

/**
 * One-click answers to a notification, from the bell or a Telegram button
 * (docs/decisions/0007-notification-channels.md).
 * Each one is the person's ordinary write through the existing use cases (a task's status or due date, a request's
 * resolution, a message in a thread), behind the same write fence and permission checks, and only while
 * `app.notification_actions` still offers it to them. The notification is read afterwards. A repeated command (the
 * same key) returns the first result without acting twice.
 */
@Component
@Profile("api")
class NotificationActions(private val ledger: CommandLedger) {
    fun perform(
        tx: Transaction,
        actor: Actor,
        notificationId: String,
        action: QuickAction,
        input: QuickActionInput,
        key: String,
    ): Any {
        Notifications.requireHuman(actor)
        requireCondition(UUID_SHAPE.matches(notificationId), 404, "NOT_FOUND", "Уведомление недоступно.")
        val item = requirePresent(
            tx.row(
                """
                SELECT n.id::text AS id, n.project_id AS "projectId", n.task_id AS "taskId", n.detail,
                       app.notification_actions(n) AS actions,
                       (clock_timestamp() AT TIME ZONE coalesce(
                         (SELECT w.timezone FROM app.workbench_preferences w WHERE w.principal_id = n.recipient_id),
                         auth.project_timezone(n.project_id), 'UTC'))::date::text AS today
                FROM app.notifications n WHERE n.id = $1::uuid AND n.recipient_id = $2
                """.trimIndent(),
                notificationId,
                actor.id,
            ),
            404,
            "NOT_FOUND",
            "Уведомление недоступно.",
        )
        val projectId = item.string("projectId")
        return ledger.idempotent(tx, actor, projectId, "notification.${action.wire}:$notificationId", key, input) {
            requireCondition(
                action.wire in item.strings("actions"),
                409,
                "ACTION_UNAVAILABLE",
                "Это действие уже недоступно: откройте задачу.",
            )
            val outcome = when (action) {
                QuickAction.TAKE -> take(tx, actor, item)
                QuickAction.POSTPONE -> postpone(tx, actor, item, input.due)
                QuickAction.ACCEPT -> accept(tx, actor, item, key)
                QuickAction.RETURN -> giveBack(tx, actor, item, key)
                QuickAction.REPLY -> reply(tx, actor, item, input.text, key)
            }
            tx.update(
                "UPDATE app.notifications SET read_at = clock_timestamp() WHERE id = $1::uuid AND read_at IS NULL",
                notificationId,
            )
            outcome
        }
    }

    private fun take(tx: Transaction, actor: Actor, item: Row): Map<String, Any?> {
        val (projectId, taskId) = item.string("projectId") to item.string("taskId")
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val task = Tasks.read(tx, projectId, taskId)
        val content = Tasks.contentOf(task)
        val saved = Tasks.put(tx, actor, projectId, taskId, task.long("revision"), content.copy(status = IN_PROGRESS))
        return result(
            QuickActionText.done(QuickAction.TAKE),
            mapOf(
                "kind" to "status", "status" to content.status, "rank" to content.rank,
                "revision" to revisionOf(saved),
            ),
        )
    }

    private fun postpone(tx: Transaction, actor: Actor, item: Row, chosen: String?): Map<String, Any?> {
        val (projectId, taskId) = item.string("projectId") to item.string("taskId")
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val task = Tasks.read(tx, projectId, taskId)
        val content = Tasks.contentOf(task)
        val today = LocalDate.parse(item.string("today"))
        val picked = chosen?.let(::dateOrNull)
        requireCondition(
            chosen == null || picked != null,
            400,
            "INVALID_REQUEST",
            "Некорректная дата.",
        )
        val target = picked ?: QuickAction.postponed(content.due?.let(::dateOrNull), today)
        val moved = content.copy(due = target.toString())
        val saved = Tasks.put(tx, actor, projectId, taskId, task.long("revision"), moved)
        return result(
            QuickActionText.done(QuickAction.POSTPONE, target),
            mapOf("kind" to "due", "due" to content.due, "revision" to revisionOf(saved)),
        )
    }

    private fun accept(tx: Transaction, actor: Actor, item: Row, key: String): Map<String, Any?> {
        val (projectId, requestId, revision) = request(tx, item)
        val resolved = AttentionRequests.resolve(tx, actor, projectId, requestId, revision, key, ledger)
        return result(
            QuickActionText.done(QuickAction.ACCEPT),
            mapOf("kind" to "reopen", "requestId" to requestId, "revision" to revisionOf(resolved)),
        )
    }

    /** «Вернуть»: the task goes back to «В работе», and the review request is resolved. */
    private fun giveBack(tx: Transaction, actor: Actor, item: Row, key: String): Map<String, Any?> {
        val (projectId, requestId, revision) = request(tx, item)
        val taskId = item.string("taskId")
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val task = Tasks.read(tx, projectId, taskId)
        Tasks.put(tx, actor, projectId, taskId, task.long("revision"), Tasks.contentOf(task).copy(status = IN_PROGRESS))
        AttentionRequests.resolve(tx, actor, projectId, requestId, revision, key, ledger)
        return result(QuickActionText.done(QuickAction.RETURN), null)
    }

    private fun reply(tx: Transaction, actor: Actor, item: Row, text: String?, key: String): Map<String, Any?> {
        val body = text?.trim().orEmpty()
        requireCondition(body.length in 1..BODY_LIMIT, 400, "INVALID_REQUEST", "Напишите ответ.")
        val projectId = item.string("projectId")
        val threadId = requirePresent(
            item.json("detail")?.get("threadId")?.takeIf { it.isString }?.asString(),
            409,
            "ACTION_UNAVAILABLE",
            "Обсуждение недоступно.",
        )
        val revision = requirePresent(
            tx.row("SELECT revision FROM app.threads WHERE project_id = $1 AND id = $2", projectId, threadId),
            409,
            "ACTION_UNAVAILABLE",
            "Обсуждение недоступно.",
        ).long("revision")
        val message = Discussions.NewMessage("m-" + UUID.randomUUID().toString().take(MESSAGE_ID), body, revision)
        Discussions.append(tx, actor, projectId, threadId, message, key, ledger)
        return result(QuickActionText.done(QuickAction.REPLY), null)
    }

    private fun request(tx: Transaction, item: Row): Triple<String, String, Long> {
        val projectId = item.string("projectId")
        val requestId = requirePresent(
            item.json("detail")?.get("requestId")?.takeIf { it.isString }?.asString()?.lowercase(),
            409,
            "ACTION_UNAVAILABLE",
            "Запрос недоступен.",
        )
        val revision = requirePresent(
            tx.row(
                "SELECT revision FROM app.attention_requests WHERE project_id = $1 AND id = $2::uuid",
                projectId,
                requestId,
            ),
            409,
            "ACTION_UNAVAILABLE",
            "Запрос недоступен.",
        ).long("revision")
        return Triple(projectId, requestId, revision)
    }

    private fun result(text: String, undo: Map<String, Any?>?): Map<String, Any?> =
        linkedMapOf("result" to text, "read" to true, "undo" to undo)

    @Suppress("UNCHECKED_CAST")
    private fun revisionOf(saved: Any): Any? = (saved as? Map<String, Any?>)?.get("revision")

    private fun dateOrNull(value: String): LocalDate? = try {
        LocalDate.parse(value)
    } catch (_: DateTimeParseException) {
        null
    }

    private companion object {
        const val IN_PROGRESS = "in_progress"
        const val BODY_LIMIT = 20_000
        const val MESSAGE_ID = 18
        val UUID_SHAPE = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    }
}
