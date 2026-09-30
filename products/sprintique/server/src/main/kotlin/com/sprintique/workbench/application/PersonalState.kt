package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import java.time.Duration
import java.time.Instant

/** How a person moves a task they participate in within their own order. */
enum class RankMove(val wire: String) { UP("up"), DOWN("down") }

/**
 * A person's private relation to a task (docs/adr W2, W3, W5): "Участвую" with the person's own order, the event
 * watermark, a snooze of requests and a check-back date of delegated work. Every field is changed by its own command
 * against its own revision, so a seen marker from one tab never collides with a move from another. Nothing here
 * writes the project's audit, outbox or retry ledger.
 */
object PersonalState {
    const val PARTICIPATION_LIMIT = 2000
    private const val RANK_STEP = 1_048_576L
    private val SNOOZE_LIMIT: Duration = Duration.ofDays(30)

    private const val PROJECTION = """participating, participation_revision AS "participationRevision", rank,
        rank_revision AS "rankRevision", last_seen_sequence AS "lastSeenSequence", seen_revision AS "seenRevision",
        to_char(snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "snoozedUntil",
        snooze_revision AS "snoozeRevision", to_char(check_back_at, 'YYYY-MM-DD') AS "checkBackAt",
        check_back_revision AS "checkBackRevision""""

    /** The caller's own state of a task, "Жду" as derived from it, and the newest event position. */
    fun read(tx: Transaction, actor: Actor, projectId: String, taskId: String): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val row = tx.row(
            """
            SELECT $PROJECTION FROM app.task_personal_state WHERE project_id = $1 AND task_id = $2 AND principal_id = $3
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )
        val participating = row?.get("participating") == true
        return linkedMapOf(
            "projectId" to projectId,
            "taskId" to taskId,
            "participating" to participating,
            "participationRevision" to revision(row, "participationRevision"),
            "rankRevision" to revision(row, "rankRevision"),
            "lastSeenSequence" to row?.get("lastSeenSequence")?.toString()?.toLong(),
            "seenRevision" to revision(row, "seenRevision"),
            "snoozedUntil" to row?.get("snoozedUntil"),
            "snoozeRevision" to revision(row, "snoozeRevision"),
            "checkBackAt" to row?.get("checkBackAt"),
            "checkBackRevision" to revision(row, "checkBackRevision"),
            "latestSequence" to WorkbenchAccess.latestSequence(tx, projectId, taskId),
            "delegated" to if (participating) delegation(tx, actor, projectId, taskId) else null,
        )
    }

    private fun revision(row: Row?, name: String): Long = row?.long(name) ?: 0L

    /**
     * "Жду" (docs/adr W5): the person participates and the task's current owner is someone else whom the person
     * assigned it to (their latest assignment of it). Null when the task is not delegated by the person.
     */
    fun delegation(tx: Transaction, actor: Actor, projectId: String, taskId: String): Map<String, Any?>? = tx.row(
        """
        SELECT d.expected AS "expectedAssigneeId", t.owner_id AS "ownerId", d.sequence AS "assignedSequence"
        FROM app.tasks t CROSS JOIN LATERAL (
          SELECT e.detail->>'to' AS expected, e.sequence FROM app.task_activity e
          WHERE e.project_id = t.project_id AND e.task_id = t.id AND e.kind = 'owner'
            AND (e.actor_id = $3 OR e.initiator_id = $3) AND e.detail->>'to' IS NOT NULL AND e.detail->>'to' <> $3
          ORDER BY e.sequence DESC LIMIT 1
        ) d
        WHERE t.project_id = $1 AND t.id = $2 AND t.owner_id IS DISTINCT FROM $3
        """.trimIndent(),
        projectId,
        taskId,
        actor.id,
    )?.let {
        LinkedHashMap<String, Any?>(it).apply { put("assignedSequence", it["assignedSequence"]?.toString()?.toLong()) }
    }

    /** "Участвую" on or off. Joining appends the task to the end of the person's order; leaving drops its rank. */
    @Suppress("LongParameterList")
    fun participation(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        participating: Boolean,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "participating" to participating)
        return PrivateLedger.once(tx, actor, projectId, "personal.participation", key, input) {
            // Per person, before any row lock: the limit and the order span every project of the person.
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "participation:${actor.id}")
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("participation_revision"), baseRevision)
            val revision = if (current.boolean("participating") == participating) {
                current.long("participation_revision")
            } else {
                if (participating) {
                    requireCondition(
                        count(tx, actor) < PARTICIPATION_LIMIT,
                        422,
                        "PARTICIPATION_LIMIT",
                        "Вы участвуете в слишком многих задачах. Выйдите из лишних.",
                    )
                    startRelation(tx, actor, projectId, taskId)
                }
                write(tx, actor, projectId, taskId, participating, if (participating) nextRank(tx, actor) else null)
            }
            PrivateEffect(
                taskId,
                revision,
                effect("participation", taskId, projectId, revision, "participating" to participating),
            )
        }
    }

    /**
     * The author of a new task participates in it from the start (a person, not an agent), within the limit; leaving
     * is one command. Part of the task's creation, so no receipt of its own.
     */
    fun joinCreatedTask(tx: Transaction, actor: Actor, projectId: String, taskId: String) {
        if (!actor.isHuman) return
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "participation:${actor.id}")
        if (count(tx, actor) >= PARTICIPATION_LIMIT) return
        lock(tx, actor, projectId, taskId)
        startRelation(tx, actor, projectId, taskId)
        write(tx, actor, projectId, taskId, true, nextRank(tx, actor))
    }

    private fun count(tx: Transaction, actor: Actor): Int = tx.row(
        "SELECT count(*)::int AS n FROM app.task_personal_state WHERE principal_id = $1 AND participating",
        actor.id,
    )!!.int("n")

    @Suppress("LongParameterList")
    private fun write(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        on: Boolean,
        rank: Long?,
    ): Long =
        tx.row(
            """
            UPDATE app.task_personal_state SET participating = $4, participation_revision = participation_revision + 1,
                   rank = $5, rank_revision = rank_revision + 1, updated_at = clock_timestamp()
            WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING participation_revision
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
            on,
            rank,
        )!!.long("participation_revision")

    /** Up or down within the list the person sees: `scope` is the Workbench project filter (null: every project). */
    @Suppress("LongParameterList")
    fun rank(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        move: RankMove,
        scope: List<String>?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "move" to move.wire, "projects" to scope)
        return PrivateLedger.once(tx, actor, projectId, "personal.rank", key, input) {
            // Per person before any row lock: a renumbering never waits on a row another command of theirs holds.
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "participation:${actor.id}")
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("rank_revision"), baseRevision)
            requireCondition(current.boolean("participating"), 422, "NOT_PARTICIPATING", "Вы не участвуете в задаче.")
            val rank = move(tx, actor, projectId, taskId, move == RankMove.UP, scope)
            val revision = tx.row(
                """
                UPDATE app.task_personal_state SET rank = $4, rank_revision = rank_revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING rank_revision
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                rank,
            )!!.long("rank_revision")
            PrivateEffect(taskId, revision, effect("rank", taskId, projectId, revision, "move" to move.wire))
        }
    }

    private fun nextRank(tx: Transaction, actor: Actor): Long = tx.row(
        """
        SELECT coalesce(max(rank), 0) AS last FROM app.task_personal_state WHERE principal_id = $1 AND participating
        """.trimIndent(),
        actor.id,
    )!!.long("last") + RANK_STEP

    /**
     * The rank that places the task one step up or down in the list the person sees. Ranks keep gaps; with no gap
     * left the person's whole order is renumbered in its current order first. Ranks encode order only, so the other
     * rows keep their revisions.
     */
    @Suppress("LongParameterList")
    private fun move(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        up: Boolean,
        scope: List<String>?,
    ): Long {
        val order = rankOrder(tx, actor, scope)
        val index = order.indexOfFirst { it["projectId"] == projectId && it["taskId"] == taskId }
        val target = if (up) index - 1 else index + 1
        requireCondition(index >= 0 && target in order.indices, 422, "RANK_EDGE", "Задача уже на краю списка.")
        placeBetween(order, index, target)?.let { return it }
        tx.update(
            """
            UPDATE app.task_personal_state s SET rank = o.position * $2
            FROM (SELECT project_id, task_id, row_number() OVER (ORDER BY rank, project_id, task_id) AS position
                  FROM app.task_personal_state WHERE principal_id = $1 AND participating) o
            WHERE s.principal_id = $1 AND s.project_id = o.project_id AND s.task_id = o.task_id
            """.trimIndent(),
            actor.id,
            RANK_STEP,
        )
        return requireNotNull(placeBetween(rankOrder(tx, actor, scope), index, target))
    }

    private fun rankOrder(tx: Transaction, actor: Actor, scope: List<String>?): List<Row> = tx.rows(
        """
        SELECT project_id AS "projectId", task_id AS "taskId", rank FROM app.task_personal_state
        WHERE principal_id = $1 AND participating AND ($2::text[] IS NULL OR project_id = ANY($2::text[]))
        ORDER BY rank, project_id, task_id
        """.trimIndent(),
        actor.id,
        scope,
    )

    private fun placeBetween(order: List<Row>, index: Int, target: Int): Long? {
        val reordered = order.toMutableList().apply { add(target, removeAt(index)) }
        val before = reordered.getOrNull(target - 1)?.long("rank") ?: 0L
        val after = reordered.getOrNull(target + 1)?.long("rank")
        val between = if (after == null) before + RANK_STEP else before + (after - before) / 2
        return between.takeIf { it > before && (after == null || it < after) }
    }

    @Suppress("LongParameterList")
    fun seen(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        sequence: Long,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "sequence" to sequence)
        return PrivateLedger.once(tx, actor, projectId, "personal.seen", key, input) {
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("seen_revision"), baseRevision)
            // Forward only, and never past the task's own newest event: a marker cannot pre-approve the future.
            val latest = WorkbenchAccess.latestSequence(tx, projectId, taskId)
            val previous = current["last_seen_sequence"]?.toString()?.toLong() ?: 0L
            val next = maxOf(previous, minOf(sequence, latest))
            var revision = current.long("seen_revision")
            if (current["last_seen_sequence"] == null || next != previous) {
                revision = tx.row(
                    """
                    UPDATE app.task_personal_state SET last_seen_sequence = $4, seen_revision = seen_revision + 1,
                           updated_at = clock_timestamp()
                    WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING seen_revision
                    """.trimIndent(),
                    projectId,
                    taskId,
                    actor.id,
                    next,
                )!!.long("seen_revision")
            }
            PrivateEffect(taskId, revision, effect("seen", taskId, projectId, revision, "lastSeenSequence" to next))
        }
    }

    @Suppress("LongParameterList")
    fun snooze(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        until: Instant?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "until" to until?.toString())
        return PrivateLedger.once(tx, actor, projectId, "personal.snooze", key, input) {
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("snooze_revision"), baseRevision)
            if (until != null) requireSnoozable(tx, actor, projectId, taskId, until)
            val revision = tx.row(
                """
                UPDATE app.task_personal_state SET snoozed_until = $4::timestamptz,
                       snoozed_at = CASE WHEN $4::timestamptz IS NULL THEN NULL ELSE clock_timestamp() END,
                       snooze_revision = snooze_revision + 1, updated_at = clock_timestamp()
                WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING snooze_revision
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                until,
            )!!.long("snooze_revision")
            PrivateEffect(
                taskId, revision,
                effect(
                    "snooze", taskId, projectId, revision,
                    "snoozedUntil" to until?.toString(),
                ),
            )
        }
    }

    /**
     * A snooze hides the person's open requests on the task, never past the start of the earliest `neededBy` day in
     * the project's time zone, and never for more than 30 days (docs/adr W5).
     */
    private fun requireSnoozable(tx: Transaction, actor: Actor, projectId: String, taskId: String, until: Instant) {
        val row = tx.row(
            """
            SELECT count(*)::int AS open, clock_timestamp() AS now,
                   min(r.needed_by::timestamp AT TIME ZONE coalesce(auth.project_timezone($1), 'UTC')) AS limit_at
            FROM app.attention_requests r WHERE r.project_id = $1 AND r.task_id = $2 AND r.recipient_id = $3 AND r.status = 'open'
              AND (r.approval_id IS NULL OR EXISTS (SELECT 1 FROM app.approvals ap WHERE ap.project_id = r.project_id
                   AND ap.id = r.approval_id AND ap.status = 'proposed' AND ap.expires_at > clock_timestamp()))
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )!!
        requireCondition(row.int("open") > 0, 422, "SNOOZE_NOTHING", "Отложить можно только открытый запрос к вам.")
        val now = row.instant("now")
        requireCondition(
            until.isAfter(now) && !until.isAfter(now.plus(SNOOZE_LIMIT)),
            422,
            "SNOOZE_RANGE",
            "Отложить можно на срок до 30 дней.",
        )
        val limit = row.instantOrNull("limit_at")
        requireCondition(
            limit == null || !until.isAfter(limit),
            422,
            "SNOOZE_AFTER_NEEDED_BY",
            "Запрос нельзя отложить дальше даты, к которой ждут ответ.",
        )
    }

    /** The person's own date to check delegated work: private, never the task's due date (docs/adr W5). */
    @Suppress("LongParameterList")
    fun checkBack(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        checkBackAt: String?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "checkBackAt" to checkBackAt)
        return PrivateLedger.once(tx, actor, projectId, "personal.check-back", key, input) {
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("check_back_revision"), baseRevision)
            val waiting = current.boolean("participating") && delegation(tx, actor, projectId, taskId) != null
            requireCondition(
                checkBackAt == null || waiting,
                422,
                "NOT_WAITING",
                "Дату проверки ставят для задачи, которую вы поручили и в которой участвуете.",
            )
            val revision = tx.row(
                """
                UPDATE app.task_personal_state SET check_back_at = $4::date, check_back_revision = check_back_revision + 1,
                       updated_at = clock_timestamp()
                WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING check_back_revision
                """.trimIndent(),
                projectId,
                taskId,
                actor.id,
                checkBackAt,
            )!!.long("check_back_revision")
            PrivateEffect(
                taskId, revision,
                effect(
                    "checkBack", taskId, projectId, revision,
                    "checkBackAt" to checkBackAt,
                ),
            )
        }
    }

    /**
     * The person's state row, created empty on first use and locked: every field command checks its own revision
     * against this row, so concurrent commands on different fields serialize without conflicting.
     */
    private fun lock(tx: Transaction, actor: Actor, projectId: String, taskId: String): Row {
        tx.update(
            """
            INSERT INTO app.task_personal_state(project_id, task_id, principal_id) VALUES ($1, $2, $3)
            ON CONFLICT (project_id, task_id, principal_id) DO NOTHING
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )
        return tx.row(
            """
            SELECT * FROM app.task_personal_state WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 FOR UPDATE
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )!!
    }

    private fun requireRevision(current: Long, base: Long) {
        requireCondition(current == base, 409, "CONFLICT", "Личное состояние задачи уже изменено. Обновите его.")
    }

    private fun effect(field: String, taskId: String, projectId: String, revision: Long, value: Pair<String, Any?>) =
        linkedMapOf("command" to field, "projectId" to projectId, "taskId" to taskId, "revision" to revision, value)

    /**
     * A relation that starts from nothing (participation, an own request) starts at the task's current events:
     * history before it is not news (docs/adr W3 §5). Called before the new relation is written; while another
     * relation already holds, the person's marker and their unseen news are kept.
     */
    fun startRelation(tx: Transaction, actor: Actor, projectId: String, taskId: String) {
        tx.update(
            """
            INSERT INTO app.task_personal_state(project_id, task_id, principal_id, last_seen_sequence, seen_revision)
            SELECT $1, $2, $3, coalesce(max(sequence), 0), 1 FROM app.task_activity WHERE project_id = $1 AND task_id = $2
            ON CONFLICT (project_id, task_id, principal_id) DO UPDATE
              SET last_seen_sequence = greatest(coalesce(app.task_personal_state.last_seen_sequence, 0),
                                                EXCLUDED.last_seen_sequence),
                  seen_revision = app.task_personal_state.seen_revision + 1
              WHERE NOT app.task_personal_state.participating
                AND NOT EXISTS (SELECT 1 FROM app.attention_requests r WHERE r.project_id = $1 AND r.task_id = $2
                                AND r.requested_by = $3
                                AND (r.status IN ('open', 'orphaned') OR r.updated_at > now() - interval '30 days'))
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )
    }
}
