package com.sprintique.workbench.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.command.Receipt
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.JsonNode

/** What a person asks of another: the recipient, the kind of result, an optional date and canonical source. */
data class NewAttentionRequest(
    val id: String,
    val recipientId: String,
    val kind: String,
    val neededBy: String?,
    val threadId: String?,
    val approvalId: String?,
    val note: String,
)

/**
 * Directed requests (docs/adr W1): the only source of "Нужно действие". A request is an envelope over a task and,
 * optionally, a question thread or an approval; it never replaces them. Every command repeats the checks of the
 * recipient, their membership and the source on the server, under the project write fence, with CAS and a retry key.
 */
object AttentionRequests {
    const val OPEN_LIMIT = 500

    private const val PROJECTION = """r.id::text AS id, r.project_id AS "projectId", r.task_id AS "taskId", r.kind, r.status,
        r.revision::int AS revision, r.note, to_char(r.needed_by, 'YYYY-MM-DD') AS "neededBy", r.thread_id AS "threadId",
        r.approval_id::text AS "approvalId", r.recipient_id AS "recipientId",
        (SELECT coalesce(p.profile_name, p.name) FROM auth.principals p WHERE p.id = r.recipient_id) AS "recipientName",
        r.requested_by AS "requestedById",
        (SELECT coalesce(p.profile_name, p.name) FROM auth.principals p WHERE p.id = r.requested_by) AS "requestedByName",
        to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(r.closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "closedAt",
        r.closed_by AS "closedById", r.source_revision AS "sourceRevision""""

    /** Requests on a task for its drawer: open and orphaned ones first, then the latest closed ones. */
    fun forTask(tx: Transaction, actor: Actor, projectId: String, taskId: String): List<Row> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        return tx.rows(
            """
            SELECT $PROJECTION FROM app.attention_requests r WHERE r.project_id = $1 AND r.task_id = $2
            ORDER BY (r.status IN ('open', 'orphaned')) DESC, r.created_at DESC, r.id LIMIT 50
            """.trimIndent(),
            projectId,
            taskId,
        )
    }

    fun read(tx: Transaction, projectId: String, id: String): Row = requirePresent(
        tx.row(
            "SELECT $PROJECTION FROM app.attention_requests r WHERE r.project_id = $1 AND r.id::text = $2",
            projectId,
            id,
        ),
        404,
        "NOT_FOUND",
        "Запрос недоступен.",
    )

    @Suppress("LongParameterList")
    fun create(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        request: NewAttentionRequest,
        key: String,
        ledger: CommandLedger,
    ): Any {
        WorkbenchAccess.requireHuman(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        return ledger.idempotent(tx, actor, projectId, "request.create:$taskId", key, request, receipt(tx, projectId)) {
            WorkbenchAccess.requireTask(tx, projectId, taskId)
            // An approval is asked only on its approval; a request has at most one canonical source.
            requireCondition(
                (request.kind == "approval") == (request.approvalId != null) &&
                    (request.threadId == null || request.approvalId == null),
                422,
                "REQUEST_SOURCE",
                "Утверждение запрашивается по предложению, у запроса один источник.",
            )
            requireCondition(
                request.recipientId != actor.id,
                422,
                "REQUEST_SELF",
                "Запрос адресуется другому человеку.",
            )
            requireRecipient(tx, projectId, request.recipientId)
            requireNeededBy(tx, projectId, request.neededBy)
            val sourceRevision = sourceRevision(tx, projectId, taskId, request)
            // Every project counts toward the recipient's limit, serialized per recipient (docs/adr W1).
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "requests:${request.recipientId}")
            val open = tx.row("SELECT auth.open_requests_for($1) AS n", request.recipientId)!!.int("n")
            requireCondition(open < OPEN_LIMIT, 422, "REQUEST_LIMIT", "У адресата слишком много открытых запросов.")
            // The requester follows the answer from now on; the history before the request is not news.
            PersonalState.startRelation(tx, actor, projectId, taskId)
            tx.update(
                """
                INSERT INTO app.attention_requests(project_id, id, task_id, recipient_id, requested_by, kind, thread_id,
                                                   approval_id, note, needed_by, source_revision)
                VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9, $10::date, $11)
                """.trimIndent(),
                projectId,
                request.id,
                taskId,
                request.recipientId,
                actor.id,
                request.kind,
                request.threadId,
                request.approvalId,
                request.note,
                request.neededBy,
                sourceRevision,
            )
            AuditTrail.record(tx, actor, projectId, "request.created", request.id, 1)
            read(tx, projectId, request.id)
        }
    }

    /** A new recipient or date. Allowed to the requester, the current recipient and a project administrator. */
    @Suppress("LongParameterList")
    fun change(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        recipientId: String,
        neededBy: String?,
        key: String,
        ledger: CommandLedger,
    ): Any {
        WorkbenchAccess.requireHuman(actor)
        val membership = ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val input = mapOf("baseRevision" to baseRevision, "recipientId" to recipientId, "neededBy" to neededBy)
        return ledger.idempotent(tx, actor, projectId, "request.change:$id", key, input, receipt(tx, projectId)) {
            val current = lock(tx, projectId, id, baseRevision)
            requireCondition(
                actor.id == current.string("requested_by") || actor.id == current.string("recipient_id") ||
                    membership.role == "admin",
                403,
                "FORBIDDEN",
                "Изменить запрос может автор, адресат или администратор проекта.",
            )
            requireCondition(
                current.string("status") in setOf("open", "orphaned"),
                409,
                "REQUEST_CLOSED",
                "Запрос уже решён или отменён.",
            )
            requireCondition(
                recipientId != current.string("requested_by"),
                422,
                "REQUEST_SELF",
                "Запрос адресуется другому человеку.",
            )
            requireRecipient(tx, projectId, recipientId)
            if (recipientId != current.string("recipient_id")) {
                tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "requests:$recipientId")
                val open = tx.row("SELECT auth.open_requests_for($1) AS n", recipientId)!!.int("n")
                requireCondition(open < OPEN_LIMIT, 422, "REQUEST_LIMIT", "У адресата слишком много открытых запросов.")
            }
            if (neededBy != current["needed_by"]?.toString()) requireNeededBy(tx, projectId, neededBy)
            val revision = tx.row(
                """
                UPDATE app.attention_requests SET recipient_id = $3, needed_by = $4::date, status = 'open',
                       addressed_at = CASE WHEN recipient_id <> $3 OR status <> 'open' THEN clock_timestamp()
                                           ELSE addressed_at END,
                       revision = revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id::text = $2 RETURNING revision
                """.trimIndent(),
                projectId,
                id,
                recipientId,
                neededBy,
            )!!.long("revision")
            AuditTrail.record(tx, actor, projectId, "request.changed", id, revision)
            read(tx, projectId, id)
        }
    }

    /**
     * The recipient marks the result as given. Reading a request never does this. A service account answers in the
     * discussion and has no Workbench, so a request addressed to one is marked by the person who asked or by the
     * account's owner (docs/decisions/0008-mentions-and-service-inbox.md).
     */
    fun resolve(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
    ): Any =
        close(tx, actor, projectId, id, baseRevision, key, ledger, "resolved") { current, _ ->
            val recipient = current.string("recipient_id")
            requireCondition(
                recipient == actor.id || serviceAccountAnswered(tx, recipient, current.string("requested_by"), actor),
                403,
                "FORBIDDEN",
                "Отметить запрос решённым может адресат, а за сервисный аккаунт — автор запроса или его владелец.",
            )
        }

    @Suppress("LongParameterList")
    fun cancel(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
    ): Any =
        close(tx, actor, projectId, id, baseRevision, key, ledger, "cancelled") { current, role ->
            requireCondition(
                current.string("requested_by") == actor.id || role == "admin",
                403,
                "FORBIDDEN",
                "Отменить запрос может автор или администратор проекта.",
            )
        }

    @Suppress("LongParameterList")
    private fun close(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
        status: String,
        allowed: (Row, String) -> Unit,
    ): Any {
        WorkbenchAccess.requireHuman(actor)
        val membership = ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val input = mapOf("baseRevision" to baseRevision, "status" to status)
        return ledger.idempotent(tx, actor, projectId, "request.$status:$id", key, input, receipt(tx, projectId)) {
            // State before permission: a request reassigned or closed meanwhile is "already changed" for everyone,
            // which is what the recipient who lost a race needs to see ("Уже решено"), not a refusal.
            val current = lock(tx, projectId, id, null)
            val open = if (status == "resolved") setOf("open") else setOf("open", "orphaned")
            requireCondition(current.string("status") in open, 409, "REQUEST_CLOSED", "Запрос уже решён или отменён.")
            requireCondition(current.long("revision") == baseRevision, 409, "CONFLICT", "Запрос уже изменён.")
            allowed(current, membership.role)
            val revision = tx.row(
                """
                UPDATE app.attention_requests SET status = $3, closed_at = clock_timestamp(), closed_by = $4,
                       revision = revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id::text = $2 RETURNING revision
                """.trimIndent(),
                projectId,
                id,
                status,
                actor.id,
            )!!.long("revision")
            AuditTrail.record(tx, actor, projectId, "request.$status", id, revision)
            read(tx, projectId, id)
        }
    }

    /** Undo of "Отметить решённым": only by the person who resolved it, and only while its source is still open. */
    fun reopen(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        baseRevision: Long,
        key: String,
        ledger: CommandLedger,
    ): Any {
        WorkbenchAccess.requireHuman(actor)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.TASKS_WRITE)
        val input = mapOf("baseRevision" to baseRevision)
        return ledger.idempotent(tx, actor, projectId, "request.reopen:$id", key, input, receipt(tx, projectId)) {
            val current = lock(tx, projectId, id, baseRevision)
            requireCondition(
                current.string("status") == "resolved" && current.stringOrNull("closed_by") == actor.id &&
                    current.string("recipient_id") == actor.id,
                409,
                "REQUEST_REOPEN",
                "Вернуть можно только запрос, который вы сами отметили решённым.",
            )
            requireRecipient(tx, projectId, actor.id)
            requireCondition(
                sourceOpen(tx, projectId, current),
                409,
                "REQUEST_SOURCE_CLOSED",
                "Источник запроса уже закрыт.",
            )
            val revision = tx.row(
                """
                UPDATE app.attention_requests SET status = 'open', closed_at = NULL, closed_by = NULL,
                       revision = revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND id::text = $2 RETURNING revision
                """.trimIndent(),
                projectId,
                id,
            )!!.long("revision")
            AuditTrail.record(tx, actor, projectId, "request.reopened", id, revision)
            read(tx, projectId, id)
        }
    }

    /** A question resolved in its thread resolves the requests made on it, in the same transaction. */
    fun resolveForThread(tx: Transaction, actor: Actor, projectId: String, threadId: String) =
        closeForSource(tx, actor, projectId, "thread_id = $2", threadId)

    /** A decision on an approval resolves the requests made on it, in the same transaction. */
    fun resolveForApproval(tx: Transaction, actor: Actor, projectId: String, approvalId: String) =
        closeForSource(tx, actor, projectId, "approval_id::text = $2", approvalId)

    private fun closeForSource(tx: Transaction, actor: Actor, projectId: String, condition: String, sourceId: String) {
        val closed = tx.rows(
            """
            UPDATE app.attention_requests SET status = 'resolved', closed_at = clock_timestamp(), closed_by = $3,
                   revision = revision + 1, updated_at = clock_timestamp()
            WHERE project_id = $1 AND $condition AND status IN ('open', 'orphaned') RETURNING id::text AS id, revision
            """.trimIndent(),
            projectId,
            sourceId,
            actor.id,
        )
        for (row in closed) {
            AuditTrail.record(tx, actor, projectId, "request.resolved", row.string("id"), row.long("revision"))
        }
    }

    /**
     * A recipient who left the project, or can no longer act in it, leaves their open requests orphaned for the
     * requester to reassign or cancel; they never disappear silently (docs/adr W1).
     */
    fun orphanRecipient(tx: Transaction, actor: Actor, projectId: String, principalId: String) {
        val orphaned = tx.rows(
            """
            UPDATE app.attention_requests SET status = 'orphaned', revision = revision + 1, updated_at = clock_timestamp()
            WHERE project_id = $1 AND recipient_id = $2 AND status = 'open' RETURNING id::text AS id, revision
            """.trimIndent(),
            projectId,
            principalId,
        )
        for (row in orphaned) {
            AuditTrail.record(tx, actor, projectId, "request.orphaned", row.string("id"), row.long("revision"))
        }
    }

    private fun lock(tx: Transaction, projectId: String, id: String, baseRevision: Long?): Row {
        val row = tx.row(
            "SELECT * FROM app.attention_requests WHERE project_id = $1 AND id::text = $2 FOR UPDATE",
            projectId,
            id,
        )
        val current = requirePresent(row, 404, "NOT_FOUND", "Запрос недоступен.")
        if (baseRevision != null) {
            requireCondition(current.long("revision") == baseRevision, 409, "CONFLICT", "Запрос уже изменён.")
        }
        return current
    }

    /** Whether the actor may mark for a service account recipient: the requester, or the account's owner. */
    private fun serviceAccountAnswered(tx: Transaction, recipient: String, requester: String, actor: Actor): Boolean {
        val owner = tx.row("SELECT owner_id FROM auth.service_accounts WHERE principal_id = $1", recipient)
            ?.string("owner_id") ?: return false
        return actor.id == requester || actor.id == owner
    }

    /**
     * A current member who can act on the task: changes tasks there («Менять задачи»), not disabled. A service account
     * that may act is one too (docs/decisions/0008-mentions-and-service-inbox.md): the request reaches its inbox, it
     * answers in the discussion, and a person resolves the request.
     */
    private fun requireRecipient(tx: Transaction, projectId: String, recipientId: String) {
        val member = tx.row(
            """
            SELECT 'tasks.write' = ANY(m.permissions) AS writes FROM app.project_members m
            JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.project_id = $1 AND m.principal_id = $2 AND p.disabled_at IS NULL
              AND (p.kind = 'human' OR (p.kind = 'service' AND auth.service_account_active(p.id) AND EXISTS (
                SELECT 1 FROM auth.service_accounts s JOIN app.project_members o
                  ON o.project_id = m.project_id AND o.principal_id = s.owner_id
                WHERE s.principal_id = p.id)))
            """.trimIndent(),
            projectId,
            recipientId,
        )
        requireCondition(
            member != null && member.boolean("writes"),
            422,
            "REQUEST_RECIPIENT",
            "Адресатом может быть участник проекта с правом изменения.",
        )
    }

    /** A date that has not passed yet in the project's time zone. */
    private fun requireNeededBy(tx: Transaction, projectId: String, neededBy: String?) {
        if (neededBy == null) return
        val row = tx.row(
            """
            SELECT $2::date >= (clock_timestamp() AT TIME ZONE coalesce(auth.project_timezone($1), 'UTC'))::date AS ok
            """.trimIndent(),
            projectId,
            neededBy,
        )!!
        requireCondition(row.boolean("ok"), 422, "REQUEST_NEEDED_BY", "Дата ответа уже прошла.")
    }

    /** The source must be open when the request is made: an unresolved question of this task, a pending approval. */
    private fun sourceRevision(
        tx: Transaction,
        projectId: String,
        taskId: String,
        request: NewAttentionRequest,
    ): Long? {
        if (request.threadId != null) {
            val thread = tx.row(
                """
                SELECT revision FROM app.threads
                WHERE project_id = $1 AND id = $2 AND task_id = $3 AND requires_resolution AND NOT resolved
                """.trimIndent(),
                projectId,
                request.threadId,
                taskId,
            )
            requireCondition(thread != null, 422, "REQUEST_SOURCE", "Вопрос обсуждения недоступен или уже решён.")
            return thread.long("revision")
        }
        if (request.approvalId != null) {
            val approval = tx.row(
                """
                SELECT revision FROM app.approvals
                WHERE project_id = $1 AND id::text = $2 AND status = 'proposed' AND expires_at > clock_timestamp()
                """.trimIndent(),
                projectId,
                request.approvalId,
            )
            requireCondition(approval != null, 422, "REQUEST_SOURCE", "Предложение недоступно или уже решено.")
            return approval.long("revision")
        }
        return null
    }

    private fun sourceOpen(tx: Transaction, projectId: String, current: Row): Boolean {
        val thread = current.stringOrNull("thread_id")
        val approval = current["approval_id"]?.toString()
        return when {
            thread != null -> tx.row(
                "SELECT 1 AS found FROM app.threads WHERE project_id = $1 AND id = $2 AND NOT resolved",
                projectId,
                thread,
            ) != null

            approval != null -> tx.row(
                """
                SELECT 1 AS found FROM app.approvals
                WHERE project_id = $1 AND id::text = $2 AND status = 'proposed' AND expires_at > clock_timestamp()
                """.trimIndent(),
                projectId,
                approval,
            ) != null

            else -> true
        }
    }

    /** The receipt keeps the request id; a retry reads the request back from current state. */
    private fun receipt(tx: Transaction, projectId: String) = object : Receipt<Row> {
        override fun store(value: Row): Any = mapOf("request" to value["id"])

        override fun restore(record: JsonNode): Any = read(tx, projectId, record.path("request").asString())
    }
}
