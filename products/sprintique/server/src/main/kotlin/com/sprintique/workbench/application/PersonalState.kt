package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import java.time.Duration
import java.time.Instant

/** How a person changes a task's place in their focus. */
enum class FocusAction(val wire: String) { ADD("add"), REMOVE("remove"), UP("up"), DOWN("down") }

/**
 * A person's private relation to a task (docs/adr W2, W3): following, focus with its rank, the event watermark and a
 * snooze. Every field is changed by its own command against its own revision, so a seen marker from one tab never
 * collides with a focus move from another. Nothing here writes the project's audit, outbox or retry ledger.
 */
object PersonalState {
    const val FOCUS_LIMIT = 200
    const val FOLLOW_LIMIT = 2000
    private const val RANK_STEP = 1_048_576L
    private val SNOOZE_LIMIT: Duration = Duration.ofDays(30)

    private const val PROJECTION = """following, follow_revision AS "followRevision", focus_rank AS "focusRank",
        focus_revision AS "focusRevision", last_seen_sequence AS "lastSeenSequence", seen_revision AS "seenRevision",
        to_char(snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "snoozedUntil",
        snooze_revision AS "snoozeRevision""""

    /** The caller's own state of a task, with its waiting relation and the newest event position. */
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
        return linkedMapOf(
            "projectId" to projectId,
            "taskId" to taskId,
            "following" to (row?.get("following") ?: false),
            "followRevision" to revision(row, "followRevision"),
            "focused" to (row?.get("focusRank") != null),
            "focusRevision" to revision(row, "focusRevision"),
            "lastSeenSequence" to row?.get("lastSeenSequence")?.toString()?.toLong(),
            "seenRevision" to revision(row, "seenRevision"),
            "snoozedUntil" to row?.get("snoozedUntil"),
            "snoozeRevision" to revision(row, "snoozeRevision"),
            "latestSequence" to WorkbenchAccess.latestSequence(tx, projectId, taskId),
            // The newest assignment: "Следить за результатом" right after assigning names it as its source.
            "ownerSequence" to tx.row(
                """
                SELECT max(sequence) AS latest FROM app.task_activity
                WHERE project_id = $1 AND task_id = $2 AND kind = 'owner'
                """.trimIndent(),
                projectId,
                taskId,
            )?.get("latest")?.toString()?.toLong(),
            "waiting" to Waiting.current(tx, actor, projectId, taskId)?.let {
                it.with("sourceSequence" to it["sourceSequence"]?.toString()?.toLong())
            },
        )
    }

    private fun revision(row: Row?, name: String): Long = row?.long(name) ?: 0L

    @Suppress("LongParameterList")
    fun follow(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        following: Boolean,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf("taskId" to taskId, "baseRevision" to baseRevision, "following" to following)
        return PrivateLedger.once(tx, actor, projectId, "personal.follow", key, input) {
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("follow_revision"), baseRevision)
            var revision = current.long("follow_revision")
            if (current.boolean("following") != following) {
                if (following) {
                    val count = tx.row(
                        "SELECT count(*)::int AS n FROM app.task_personal_state WHERE principal_id = $1 AND following",
                        actor.id,
                    )!!.int("n")
                    requireCondition(
                        count < FOLLOW_LIMIT,
                        422,
                        "FOLLOW_LIMIT",
                        "Слишком много подписок. Снимите лишние.",
                    )
                }
                revision = tx.row(
                    """
                    UPDATE app.task_personal_state SET following = $4, follow_revision = follow_revision + 1,
                           updated_at = clock_timestamp()
                    WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING follow_revision
                    """.trimIndent(),
                    projectId,
                    taskId,
                    actor.id,
                    following,
                )!!.long("follow_revision")
                if (following) ensureWatermark(tx, actor, projectId, taskId)
            }
            PrivateEffect(taskId, revision, effect("follow", taskId, projectId, revision, "following" to following))
        }
    }

    @Suppress("LongParameterList")
    fun focus(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        taskId: String,
        baseRevision: Long,
        action: FocusAction,
        scope: List<String>?,
        key: String,
    ): Map<String, Any?> {
        WorkbenchAccess.task(tx, actor, projectId, taskId, Capability.TASKS_READ)
        val input = mapOf(
            "taskId" to taskId, "baseRevision" to baseRevision, "action" to action.wire,
            "projects" to scope,
        )
        return PrivateLedger.once(tx, actor, projectId, "personal.focus", key, input) {
            val current = lock(tx, actor, projectId, taskId)
            requireRevision(current.long("focus_revision"), baseRevision)
            // One person's focus order spans projects: moves are serialized per person, not per project.
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "focus:${actor.id}")
            val focused = current["focus_rank"] != null
            val rank: Long? = when (action) {
                FocusAction.ADD -> if (focused) current.long("focus_rank") else nextRank(tx, actor)

                FocusAction.REMOVE -> null

                FocusAction.UP, FocusAction.DOWN -> {
                    requireCondition(focused, 422, "FOCUS_MISSING", "Задача не в фокусе.")
                    move(tx, actor, projectId, taskId, action == FocusAction.UP, scope)
                }
            }
            val changed = (rank != null) != focused || (rank != null && rank != current.long("focus_rank"))
            var revision = current.long("focus_revision")
            if (changed) {
                revision = tx.row(
                    """
                    UPDATE app.task_personal_state SET focus_rank = $4, focus_revision = focus_revision + 1,
                           updated_at = clock_timestamp()
                    WHERE project_id = $1 AND task_id = $2 AND principal_id = $3 RETURNING focus_revision
                    """.trimIndent(),
                    projectId,
                    taskId,
                    actor.id,
                    rank,
                )!!.long("focus_revision")
            }
            PrivateEffect(taskId, revision, effect("focus", taskId, projectId, revision, "focused" to (rank != null)))
        }
    }

    private fun nextRank(tx: Transaction, actor: Actor): Long {
        val row = tx.row(
            """
            SELECT count(*)::int AS n, coalesce(max(focus_rank), 0) AS last FROM app.task_personal_state
            WHERE principal_id = $1 AND focus_rank IS NOT NULL
            """.trimIndent(),
            actor.id,
        )!!
        requireCondition(row.int("n") < FOCUS_LIMIT, 422, "FOCUS_LIMIT", "В фокусе уже 200 задач. Уберите лишние.")
        return row.long("last") + RANK_STEP
    }

    /**
     * The rank that places the task one step up or down in the list the person sees: their focus in `scope` (the
     * Workbench project filter; null is every project). Ranks keep gaps; with no gap left the person's whole focus is
     * renumbered in its current order first. Ranks encode order only, so the other rows keep their revisions.
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
        val order = focusOrder(tx, actor, scope)
        val index = order.indexOfFirst { it["projectId"] == projectId && it["taskId"] == taskId }
        val target = if (up) index - 1 else index + 1
        requireCondition(index >= 0 && target in order.indices, 422, "FOCUS_EDGE", "Задача уже на краю списка.")
        placeBetween(order, index, target)?.let { return it }
        tx.update(
            """
            UPDATE app.task_personal_state s SET focus_rank = o.position * $2
            FROM (SELECT project_id, task_id, row_number() OVER (ORDER BY focus_rank, project_id, task_id) AS position
                  FROM app.task_personal_state WHERE principal_id = $1 AND focus_rank IS NOT NULL) o
            WHERE s.principal_id = $1 AND s.project_id = o.project_id AND s.task_id = o.task_id
            """.trimIndent(),
            actor.id,
            RANK_STEP,
        )
        return requireNotNull(placeBetween(focusOrder(tx, actor, scope), index, target))
    }

    private fun focusOrder(tx: Transaction, actor: Actor, scope: List<String>?): List<Row> = tx.rows(
        """
        SELECT project_id AS "projectId", task_id AS "taskId", focus_rank AS rank FROM app.task_personal_state
        WHERE principal_id = $1 AND focus_rank IS NOT NULL AND ($2::text[] IS NULL OR project_id = ANY($2::text[]))
        ORDER BY focus_rank, project_id, task_id
        """.trimIndent(),
        actor.id,
        scope,
    )

    /** A rank strictly between the new neighbours of the moved row, or null when they leave no gap. */
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
     * A new relation (a follow, a waiting control, an own request) starts at the task's current events: history
     * before the relation is not news. A marker the person already has is kept.
     */
    fun ensureWatermark(tx: Transaction, actor: Actor, projectId: String, taskId: String) {
        tx.update(
            """
            INSERT INTO app.task_personal_state(project_id, task_id, principal_id, last_seen_sequence, seen_revision)
            SELECT $1, $2, $3, coalesce(max(sequence), 0), 1 FROM app.task_activity WHERE project_id = $1 AND task_id = $2
            ON CONFLICT (project_id, task_id, principal_id) DO UPDATE
              SET last_seen_sequence = EXCLUDED.last_seen_sequence, seen_revision = app.task_personal_state.seen_revision + 1
              WHERE app.task_personal_state.last_seen_sequence IS NULL
            """.trimIndent(),
            projectId,
            taskId,
            actor.id,
        )
    }
}
