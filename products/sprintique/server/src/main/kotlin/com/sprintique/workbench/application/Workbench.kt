package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import com.sprintique.workbench.domain.Activity
import com.sprintique.workbench.domain.Reason
import com.sprintique.workbench.domain.Reasons
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** Which parts of the Workbench this process serves (docs/adr W6); a disabled part contributes no candidates. */
data class WorkbenchParts(val requests: Boolean, val personal: Boolean, val waiting: Boolean)

/**
 * The Workbench "Сейчас" projection (docs/adr W4): one set-based statement over the caller's authorized projects,
 * so counts and first pages share one snapshot. Candidate reasons are deduplicated per task before any page is cut:
 * `action > focus > active > waiting > updates`. Nothing is filtered after SQL; row security applies underneath.
 */
object Workbench {
    const val PROJECT_LIMIT = 1000
    const val DEFAULT_LIMIT = 10
    const val MAXIMUM_LIMIT = 50
    private const val UPDATES_CAP = 100
    private const val STATEMENT_BUDGET = "5s"
    private val json = JsonMapper.builder().build()

    /** The sections and groups of the default view, and the filter lists. */
    val SECTIONS = listOf("action", "focus", "active", "waiting", "updates", "snoozed", "backlog")

    /** The first screen: every section's count and first page from one snapshot. */
    fun envelope(
        tx: Transaction,
        actor: Actor,
        projects: List<String>?,
        limit: Int,
        parts: WorkbenchParts,
        cursors: WorkbenchCursors,
    ): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        tx.update("SET LOCAL statement_timeout = '$STATEMENT_BUDGET'")
        val rows = tx.rows(
            query("now", final = ENVELOPE), actor.id, projects, parts.requests, parts.personal, parts.waiting,
            limit + 1,
        )
        val extras = rows.first()
        val epoch = epochOf(extras)
        val filter = filterOf(projects)
        val items = rows.filter { it["project_id"] != null }.groupBy { it.string("bucket") }
        val page = { bucket: String ->
            val bucketRows = items[bucket].orEmpty()
            val count = bucketRows.firstOrNull()?.long("bucket_count") ?: 0L
            pageOf(bucketRows, limit, count, CursorScope(actor.id, epoch, bucket, filter), cursors, parts)
        }
        val action = page("action")
        val focus = page("focus")
        val active = page("active")
        val waiting = page("waiting")
        val updates = page("updates")
        val sections = listOf(
            section("action", action, extras = mapOf("snoozedCount" to extras.long("snoozed_count"))),
            linkedMapOf(
                "key" to "current",
                "count" to (focus.count + active.count + waiting.count),
                "backlogCount" to extras.long("backlog_count"),
                "groups" to listOf(group("focus", focus), group("active", active), group("waiting", waiting)),
            ),
            section("updates", updates, capped = true),
        )
        return linkedMapOf(
            "mode" to "now",
            "generatedAt" to extras["generated_at"],
            "snapshotToken" to snapshotToken(epoch, filter, sections),
            "scope" to scopeOf(extras, projects),
            "features" to
                linkedMapOf("requests" to parts.requests, "personal" to parts.personal, "waiting" to parts.waiting),
            "sections" to sections,
        )
    }

    /**
     * The first-screen statement with its parameters in order (actor, filter, three parts, page size + 1), for plan
     * inspection by the capacity test and by operators; the envelope runs exactly this text.
     */
    fun snapshotStatement(): String = query("now", final = ENVELOPE)

    /** The next page of one section or group, or the first page of a filter list (`snoozed`, `backlog`). */
    @Suppress("LongParameterList")
    fun list(
        tx: Transaction,
        actor: Actor,
        section: String,
        projects: List<String>?,
        cursor: String?,
        limit: Int,
        parts: WorkbenchParts,
        cursors: WorkbenchCursors,
    ): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        requireCondition(section in SECTIONS, 400, "VALIDATION", "Неизвестная секция.")
        tx.update("SET LOCAL statement_timeout = '$STATEMENT_BUDGET'")
        val view = when (section) {
            "snoozed" -> "snoozed"
            "backlog" -> "backlog"
            else -> "now"
        }
        val filter = filterOf(projects)
        // Everything but the epoch is checked before the statement; the epoch after it, against the memberships the
        // same statement read: a change of access between pages is seen, never paged across.
        val opened = cursor?.let { cursors.open(it, actor.id, section, filter) }
        val rows = tx.rows(
            query(view, final = LIST),
            actor.id,
            projects,
            parts.requests,
            parts.personal,
            parts.waiting,
            section,
            opened?.after ?: "",
            limit + 1,
        )
        val extras = rows.first()
        val epoch = epochOf(extras)
        if (opened != null) cursors.requireEpoch(opened, epoch)
        val scope = CursorScope(actor.id, epoch, section, filter)
        val page =
            pageOf(rows.filter { it["project_id"] != null }, limit, extras.long("bucket_total"), scope, cursors, parts)
        return linkedMapOf(
            "section" to section,
            "generatedAt" to extras["generated_at"],
            "count" to countOf(section, page.count),
            "items" to page.items,
            "nextCursor" to page.nextCursor,
        )
    }

    private data class Page(val items: List<Map<String, Any?>>, val count: Long, val nextCursor: String?)

    private fun pageOf(
        rows: List<Row>,
        limit: Int,
        count: Long,
        scope: CursorScope,
        cursors: WorkbenchCursors,
        parts: WorkbenchParts,
    ): Page {
        val shown = rows.take(limit)
        val next = if (rows.size > limit) cursors.encode(scope, shown.last().string("sort_key")) else null
        return Page(shown.map { item(it, parts) }, count, next)
    }

    private fun section(
        key: String,
        page: Page,
        capped: Boolean = false,
        extras: Map<String, Any?> = emptyMap(),
    ): Map<String, Any?> = linkedMapOf<String, Any?>(
        "key" to key,
        "count" to if (capped) minOf(page.count, UPDATES_CAP.toLong()) else page.count,
        "countCapped" to (capped && page.count >= UPDATES_CAP),
    ).apply {
        putAll(extras)
        put("items", page.items)
        put("nextCursor", page.nextCursor)
    }

    private fun group(key: String, page: Page) = linkedMapOf(
        "key" to key,
        "count" to page.count,
        "items" to page.items,
        "nextCursor" to page.nextCursor,
    )

    private fun countOf(section: String, count: Long): Any = if (section ==
        "updates"
    ) {
        minOf(count, UPDATES_CAP.toLong())
    } else {
        count
    }

    private fun scopeOf(extras: Row, projects: List<String>?): Map<String, Any?> = linkedMapOf(
        "kind" to if (projects == null) "all" else "selected",
        "projectIds" to projects,
        "projectCount" to extras.long("project_count"),
        "truncated" to (extras.long("membership_count") > PROJECT_LIMIT && projects == null),
    )

    /** The caller's memberships and roles in scope: a change of access makes older cursors stale. */
    private fun epochOf(extras: Row): String = Tokens.sha256Hex(extras.string("epoch_source")).take(EPOCH_LENGTH)

    fun filterOf(projects: List<String>?): String =
        Tokens.sha256Hex(projects?.sorted()?.joinToString(",") ?: "*").take(EPOCH_LENGTH)

    /** Changes when a first page, an order or a count changes: the client offers a refresh instead of reordering. */
    private fun snapshotToken(epoch: String, filter: String, sections: List<Map<String, Any?>>): String {
        val shape = buildString {
            append(epoch).append(filter)
            for (section in sections) {
                append('|').append(section["key"]).append(':').append(section["count"])
                @Suppress("UNCHECKED_CAST")
                val groups = (section["groups"] as List<Map<String, Any?>>?) ?: listOf(section)
                for (group in groups) {
                    @Suppress("UNCHECKED_CAST")
                    for (item in group["items"] as List<Map<String, Any?>>) {
                        append(',').append(item["key"]).append('@').append(item["taskRevision"]).append('/')
                            .append(item["latestSequence"])
                    }
                }
            }
        }
        return Tokens.sha256Hex(shape).take(TOKEN_LENGTH)
    }

    private const val EPOCH_LENGTH = 16
    private const val TOKEN_LENGTH = 24

    private val SECTION_OF = mapOf(
        "action" to ("action" to null),
        "focus" to ("current" to "focus"),
        "active" to ("current" to "active"),
        "waiting" to ("current" to "waiting"),
        "updates" to ("updates" to null),
        "snoozed" to ("action" to "snoozed"),
        "backlog" to ("current" to "backlog"),
    )

    private fun person(id: Any?, name: Any?): Map<String, Any?>? = id?.let { linkedMapOf("id" to it, "name" to name) }

    private fun activity(row: Row): Activity? {
        val kind = row.stringOrNull("latest_kind") ?: return null
        val detail: JsonNode? = row.json("latest_detail")

        @Suppress("UNCHECKED_CAST")
        val values = detail?.let { json.treeToValue(it, Map::class.java) as Map<String, Any?> } ?: emptyMap()
        return Activity(
            kind,
            values,
            row.stringOrNull("latest_actor"),
            row.stringOrNull("latest_actor_name"),
            row.stringOrNull("unseen_latest_at"),
        )
    }

    /** One task, one row: the primary reason of its placement and the others as secondary reasons. */
    private fun item(row: Row, parts: WorkbenchParts): Map<String, Any?> {
        val bucket = row.string("bucket")
        val (section, group) = SECTION_OF.getValue(bucket)
        val projectId = row.string("project_id")
        val taskId = row.string("task_id")
        val latest = activity(row)
        val reasons = reasonsOf(row, latest)
        val weights = (row["weights"] as List<*>).map { it.toString().toInt() }
        return linkedMapOf<String, Any?>(
            "resourceKind" to "task",
            "key" to "$projectId:$taskId",
            "projectId" to projectId,
            "projectName" to row["project_name"],
            "workspaceName" to row["workspace_name"],
            "taskId" to taskId,
            "displayId" to row["display_id"],
            "taskRevision" to row.long("task_revision"),
            "title" to row["title"],
            "status" to row["status"],
            "type" to row["type"],
            "priority" to row["priority"],
            "done" to row.boolean("done"),
            "owner" to person(row["owner_id"], row["owner_name"]),
            "due" to row["due"],
            "plannedStart" to row["planned_start"],
            "plannedEnd" to row["planned_end"],
            "section" to section,
            "group" to group,
            "primaryReason" to reasons.first().let(::reasonOf),
            "secondaryReasons" to secondary(row, bucket, weights, latest).map(::reasonOf),
            "request" to row.stringOrNull("request_id")?.let {
                linkedMapOf(
                    "id" to it,
                    "kind" to row["request_kind"],
                    "revision" to row.long("request_revision"),
                    "neededBy" to row["needed_by"],
                    "requestedBy" to person(row["requested_by"], row["requested_by_name"]),
                    "createdAt" to row["requested_at"],
                    "openCount" to row.long("open_requests"),
                )
            },
            "waiting" to row["wait_revision"]?.let {
                linkedMapOf(
                    "revision" to row.long("wait_revision"),
                    "checkBackAt" to row["check_back_at"],
                    "expectedAssignee" to if (row.boolean("expected_is_member")) {
                        person(row["expected_assignee_id"], row["expected_name"])
                    } else {
                        null
                    },
                    "expectedAssigneeLeft" to !row.boolean("expected_is_member"),
                )
            },
            "updates" to row["unseen_count"]?.let {
                linkedMapOf(
                    "count" to minOf(row.long("unseen_count"), UPDATES_CAP.toLong()),
                    "latestSequence" to row.long("unseen_latest"),
                    "latestAt" to row["unseen_latest_at"],
                    "kinds" to row.strings("unseen_kinds"),
                )
            },
            "personal" to linkedMapOf(
                "following" to (row["following"] ?: false),
                "followRevision" to (row["follow_revision"]?.toString()?.toLong() ?: 0L),
                "focused" to (row["focus_rank"] != null),
                "focusRevision" to (row["focus_revision"]?.toString()?.toLong() ?: 0L),
                "lastSeenSequence" to row["last_seen_sequence"]?.toString()?.toLong(),
                "seenRevision" to (row["seen_revision"]?.toString()?.toLong() ?: 0L),
                "snoozedUntil" to row["snoozed_until"],
                "snoozeRevision" to (row["snooze_revision"]?.toString()?.toLong() ?: 0L),
            ),
            "latestSequence" to (row["latest_sequence"]?.toString()?.toLong() ?: 0L),
            "blockedBy" to
                row.stringOrNull("blocker_id")?.let {
                    linkedMapOf("id" to it, "displayId" to row["blocker_display_id"])
                },
            "allowedActions" to allowedActions(row, bucket, parts),
            "canonicalUrl" to "/workbench/tasks/$projectId/$taskId",
        ).apply { if (get("workspaceName") == null) remove("workspaceName") }
    }

    private fun reasonOf(reason: Reason): Map<String, Any?> = linkedMapOf<String, Any?>(
        "code" to reason.code,
        "text" to reason.text,
    ).apply {
        reason.actorId?.let { put("actor", linkedMapOf("id" to it, "name" to reason.actorName)) }
        reason.occurredAt?.let { put("occurredAt", it) }
        reason.neededBy?.let { put("neededBy", it) }
    }

    private fun requestReason(row: Row) = Reasons.request(
        row.string("request_kind"),
        row.stringOrNull("requested_by"),
        row.stringOrNull("requested_by_name"),
        row.stringOrNull("requested_at"),
        row.stringOrNull("needed_by"),
    )

    private fun waitingReason(row: Row, latest: Activity?) = Reasons.waiting(
        row.stringOrNull("expected_name"),
        row.boolean("expected_is_member"),
        row.stringOrNull("owner_id"),
        row.stringOrNull("expected_assignee_id"),
        row.stringOrNull("owner_name"),
        row.boolean("done"),
        latest,
    )

    private fun activeReason(row: Row) = Reasons.assigned(row.string("status"), row.stringOrNull("blocker_display_id"))

    private fun updateReason(row: Row, latest: Activity) =
        Reasons.update(latest, row["following"] == true, row.string("status"))

    private fun reasonsOf(row: Row, latest: Activity?): List<Reason> = listOf(
        when (row.string("bucket")) {
            "action", "snoozed" -> requestReason(row)
            "focus" -> Reasons.focus()
            "active" -> activeReason(row)
            "waiting" -> waitingReason(row, latest)
            "backlog" -> Reasons.backlog()
            else -> updateReason(row, requireNotNull(latest))
        },
    )

    private fun secondary(row: Row, bucket: String, weights: List<Int>, latest: Activity?): List<Reason> = buildList {
        if (bucket == "action" && row.long("open_requests") > 1) {
            add(Reason("request_to_you", "Ещё запросов к вам: ${row.long("open_requests") - 1}"))
        }
        for (weight in weights) {
            if (weight == WEIGHT[bucket]) continue
            when (weight) {
                ACTION_WEIGHT -> if (row.stringOrNull("request_id") != null) add(requestReason(row))

                FOCUS_WEIGHT -> add(Reasons.focus())

                ACTIVE_WEIGHT -> add(activeReason(row))

                WAITING_WEIGHT -> add(waitingReason(row, latest))

                UPDATES_WEIGHT -> latest?.let {
                    add(Reasons.update(it, row["following"] == true, row.string("status")))
                }
            }
        }
        if (row["following"] == true && bucket != "updates" && weights.none { it == UPDATES_WEIGHT }) {
            add(Reason("following", "Вы следите за задачей"))
        }
    }

    // The precedence of a task's placement, as the statement ranks candidates: lower wins.
    private const val ACTION_WEIGHT = 1
    private const val FOCUS_WEIGHT = 2
    private const val ACTIVE_WEIGHT = 3
    private const val WAITING_WEIGHT = 4
    private const val UPDATES_WEIGHT = 5
    private val WEIGHT = mapOf(
        "action" to ACTION_WEIGHT,
        "focus" to FOCUS_WEIGHT,
        "active" to ACTIVE_WEIGHT,
        "waiting" to WAITING_WEIGHT,
        "updates" to UPDATES_WEIGHT,
    )

    /** A hint for the interface only: the server checks every command again. */
    private fun allowedActions(row: Row, bucket: String, parts: WorkbenchParts): List<String> = buildList {
        add("open")
        add("openProject")
        if (parts.personal) {
            add(if (row["focus_rank"] != null) "unfocus" else "focus")
            if (row["focus_rank"] != null) addAll(listOf("rankUp", "rankDown"))
            add(if (row["following"] == true) "unfollow" else "follow")
        }
        if (row.stringOrNull("request_id") != null) {
            add("resolveRequest")
            if (parts.personal) add(if (bucket == "snoozed") "unsnooze" else "snooze")
        }
        if (row["wait_revision"] != null) addAll(listOf("resolveWaiting", "cancelWaiting", "changeCheckBack"))
        // Seen moves the watermark that requests and waiting also count news from.
        if (row["unseen_count"] != null) add("markSeen")
    }

    /**
     * The statement. `$1` actor, `$2` project filter (null: all), `$3`–`$5` enabled parts; the rest depends on the
     * final part. Every CTE starts from the caller's memberships; foreign projects never enter a count.
     */
    // One statement is one snapshot: its CTEs stay together, in the order the ADR describes them.
    @Suppress("LongMethod")
    private fun query(view: String, final: String): String {
        val placed = when (view) {
            "snoozed" ->
                """SELECT project_id, task_id, 0 AS weight, ARRAY[0] AS weights FROM requests WHERE snoozed
                GROUP BY project_id, task_id"""

            "backlog" ->
                """SELECT t.project_id, t.id AS task_id, 6 AS weight, ARRAY[6] AS weights
                FROM app.tasks t JOIN authorized a ON a.id = t.project_id
                WHERE t.owner_id = $1 AND t.result = 'open' AND t.status = 'ready'"""

            else ->
                """SELECT project_id, task_id, min(weight) AS weight, array_agg(DISTINCT weight ORDER BY weight) AS weights
                FROM candidates GROUP BY project_id, task_id"""
        }
        val leadFromSnoozed = if (view == "snoozed") "snoozed" else "NOT snoozed"
        return """
        WITH authorized AS MATERIALIZED (
          SELECT p.id, p.key, p.name, m.role, w.name AS workspace_name,
                 coalesce(auth.project_timezone(p.id), 'UTC') AS timezone
          FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
          LEFT JOIN app.workspaces w ON w.id = p.workspace_id
          WHERE m.principal_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))
          ORDER BY p.id LIMIT $PROJECT_LIMIT
        ), personal AS MATERIALIZED (
          -- Watermarks are read whatever is switched on: requests and waiting count news from them too.
          SELECT s.* FROM app.task_personal_state s JOIN authorized a ON a.id = s.project_id
          WHERE s.principal_id = $1
        ), requests AS MATERIALIZED (
          SELECT r.project_id, r.task_id, r.id::text AS id, r.kind, r.needed_by, r.created_at, r.requested_by, r.revision, r.note,
                 coalesce($4::boolean AND s.snoozed_until > now() AND r.addressed_at <= s.snoozed_at
                   AND (r.needed_by IS NULL OR (r.needed_by::timestamp AT TIME ZONE a.timezone) > now()), false) AS snoozed
          FROM app.attention_requests r JOIN authorized a ON a.id = r.project_id
          LEFT JOIN personal s ON s.project_id = r.project_id AND s.task_id = r.task_id
          WHERE $3::boolean AND r.recipient_id = $1 AND r.status = 'open' AND a.role IN ('editor', 'admin')
            AND (r.approval_id IS NULL OR EXISTS (SELECT 1 FROM app.approvals ap WHERE ap.project_id = r.project_id
                 AND ap.id = r.approval_id AND ap.status = 'proposed' AND ap.expires_at > now()))
        ), lead_request AS (
          SELECT DISTINCT ON (project_id, task_id) *, count(*) OVER (PARTITION BY project_id, task_id) AS open_requests
          FROM requests WHERE $leadFromSnoozed
          ORDER BY project_id, task_id, needed_by NULLS LAST, created_at, id
        ), waits AS MATERIALIZED (
          SELECT w.* FROM app.task_wait_state w JOIN authorized a ON a.id = w.project_id
          WHERE $5::boolean AND w.principal_id = $1 AND w.state = 'active'
        ), assigned AS MATERIALIZED (
          SELECT t.project_id, t.id AS task_id FROM app.tasks t JOIN authorized a ON a.id = t.project_id
          WHERE t.owner_id = $1 AND t.result = 'open' AND t.status IN ('in_progress', 'review', 'ready_for_testing', 'testing')
        ), outgoing AS MATERIALIZED (
          SELECT DISTINCT r.project_id, r.task_id FROM app.attention_requests r JOIN authorized a ON a.id = r.project_id
          WHERE $3::boolean AND r.requested_by = $1
            AND (r.status IN ('open', 'orphaned') OR r.updated_at > now() - interval '30 days')
        ), related AS (
          -- A person's own request makes only its own events news; following and waiting make every event news.
          SELECT project_id, task_id, bool_and(request_only) AS request_only FROM (
            SELECT project_id, task_id, false AS request_only FROM personal WHERE following AND $4::boolean
            UNION ALL SELECT project_id, task_id, false FROM waits
            UNION ALL SELECT project_id, task_id, true FROM outgoing
          ) relation GROUP BY project_id, task_id
        ), unseen AS MATERIALIZED (
          SELECT x.project_id, x.task_id, agg.n, agg.latest, agg.latest_at, agg.latest_kind, agg.latest_actor,
                 agg.latest_detail, agg.kinds
          FROM related x LEFT JOIN personal s ON s.project_id = x.project_id AND s.task_id = x.task_id
          CROSS JOIN LATERAL (
            SELECT count(*) AS n, max(v.sequence) AS latest, max(v.created_at) AS latest_at,
                   (array_agg(v.kind ORDER BY v.sequence DESC))[1] AS latest_kind,
                   (array_agg(v.actor_id ORDER BY v.sequence DESC))[1] AS latest_actor,
                   (array_agg(v.detail ORDER BY v.sequence DESC))[1] AS latest_detail,
                   array_agg(DISTINCT v.kind) AS kinds
            FROM (SELECT e.sequence, e.created_at, e.kind, e.actor_id, e.detail FROM app.task_activity e
                  WHERE e.project_id = x.project_id AND e.task_id = x.task_id AND e.sequence > coalesce(s.last_seen_sequence, 0)
                    AND e.actor_id <> $1 AND e.initiator_id IS DISTINCT FROM $1
                    AND (NOT x.request_only OR (e.kind = 'request' AND e.detail->>'requestedBy' = $1))
                  ORDER BY e.sequence DESC LIMIT $UPDATES_CAP) v
          ) agg
          WHERE agg.n > 0
        ), candidates AS (
          SELECT project_id, task_id, 1 AS weight FROM lead_request
          UNION ALL SELECT project_id, task_id, 2 FROM personal WHERE focus_rank IS NOT NULL AND $4::boolean
          UNION ALL SELECT project_id, task_id, 3 FROM assigned
          UNION ALL SELECT project_id, task_id, 4 FROM waits
          UNION ALL SELECT project_id, task_id, 5 FROM unseen
        ), placed AS (
          $placed
        ), shaped AS (
          SELECT pl.project_id, pl.task_id, pl.weights,
                 CASE pl.weight WHEN 0 THEN 'snoozed' WHEN 1 THEN 'action' WHEN 2 THEN 'focus' WHEN 3 THEN 'active'
                   WHEN 4 THEN 'waiting' WHEN 5 THEN 'updates' ELSE 'backlog' END AS bucket,
                 t.title, t.status, t.type, t.priority, t.revision AS task_revision, t.owner_id,
                 (t.status = 'ready_for_release' OR t.result = 'accepted') AS done,
                 to_char(t.due, 'YYYY-MM-DD') AS due, to_char(t.planned_start, 'YYYY-MM-DD') AS planned_start,
                 to_char(t.planned_end, 'YYYY-MM-DD') AS planned_end, t.due AS due_date,
                 a.key || '-' || t.number AS display_id, a.name AS project_name,
                 CASE WHEN a.name IN (SELECT name FROM authorized GROUP BY name HAVING count(*) > 1) THEN a.workspace_name END
                   AS workspace_name,
                 (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = t.owner_id) AS owner_name,
                 s.following, s.follow_revision, s.focus_rank, s.focus_revision, s.last_seen_sequence, s.seen_revision,
                 to_char(s.snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS snoozed_until,
                 s.snoozed_until AS snoozed_until_at, s.snooze_revision,
                 q.id AS request_id, q.kind AS request_kind, q.revision AS request_revision, q.note AS request_note,
                 q.requested_by, q.open_requests, q.needed_by AS needed_by_date,
                 to_char(q.needed_by, 'YYYY-MM-DD') AS needed_by, q.created_at AS requested_at_raw,
                 to_char(q.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS requested_at,
                 (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = q.requested_by) AS requested_by_name,
                 w.revision AS wait_revision, to_char(w.check_back_at, 'YYYY-MM-DD') AS check_back_at, w.check_back_at AS check_back_date,
                 w.updated_at AS wait_updated_at, w.expected_assignee_id,
                 (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = w.expected_assignee_id) AS expected_name,
                 EXISTS (SELECT 1 FROM app.project_members pm WHERE pm.project_id = pl.project_id
                         AND pm.principal_id = w.expected_assignee_id) AS expected_is_member,
                 u.n AS unseen_count, u.latest AS unseen_latest, u.latest_at AS unseen_latest_at_raw,
                 to_char(u.latest_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS unseen_latest_at,
                 u.latest_kind, u.latest_actor, u.latest_detail, u.kinds AS unseen_kinds,
                 (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = u.latest_actor) AS latest_actor_name,
                 (SELECT max(e.sequence) FROM app.task_activity e WHERE e.project_id = pl.project_id AND e.task_id = pl.task_id)
                   AS latest_sequence,
                 blk.id AS blocker_id, blk.display_id AS blocker_display_id,
                 t.status_entered_at
          FROM placed pl
          JOIN app.tasks t ON t.project_id = pl.project_id AND t.id = pl.task_id
          JOIN authorized a ON a.id = pl.project_id
          LEFT JOIN personal s ON s.project_id = pl.project_id AND s.task_id = pl.task_id
          LEFT JOIN lead_request q ON q.project_id = pl.project_id AND q.task_id = pl.task_id
          LEFT JOIN waits w ON w.project_id = pl.project_id AND w.task_id = pl.task_id
          LEFT JOIN unseen u ON u.project_id = pl.project_id AND u.task_id = pl.task_id
          LEFT JOIN LATERAL (
            SELECT b.id, a.key || '-' || b.number AS display_id FROM app.task_links l
            JOIN app.tasks b ON b.project_id = l.project_id AND b.id = l.to_id
            WHERE l.project_id = pl.project_id AND l.from_id = pl.task_id AND l.kind = 'depends' AND l.archived_at IS NULL
              AND b.status <> 'ready_for_release' AND b.result = 'open'
            ORDER BY b.number LIMIT 1
          ) blk ON true
        ), keyed AS MATERIALIZED (
          SELECT shaped.*, (CASE bucket
              WHEN 'action' THEN coalesce(to_char(needed_by_date, 'YYYY-MM-DD'), '9999-12-31') || '|'
                || to_char(requested_at_raw AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
              WHEN 'snoozed' THEN to_char(snoozed_until_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
              WHEN 'focus' THEN lpad(focus_rank::text, 19, '0')
              WHEN 'active' THEN (CASE status WHEN 'in_progress' THEN '1' WHEN 'review' THEN '2'
                  WHEN 'ready_for_testing' THEN '3' ELSE '4' END)
                || (CASE priority WHEN 'critical' THEN '0' WHEN 'high' THEN '1' WHEN 'normal' THEN '2' ELSE '3' END)
                || '|' || coalesce(to_char(due_date, 'YYYY-MM-DD'), '9999-12-31')
              WHEN 'backlog' THEN (CASE priority WHEN 'critical' THEN '0' WHEN 'high' THEN '1' WHEN 'normal' THEN '2' ELSE '3' END)
                || '|' || coalesce(to_char(due_date, 'YYYY-MM-DD'), '9999-12-31')
              WHEN 'waiting' THEN coalesce(to_char(check_back_date, 'YYYY-MM-DD'), '9999-12-31') || '|'
                || lpad((9999999999999 - floor(extract(epoch FROM coalesce(unseen_latest_at_raw, wait_updated_at)) * 1000))::bigint::text, 13, '0')
              ELSE lpad((9999999999999 - floor(extract(epoch FROM unseen_latest_at_raw) * 1000))::bigint::text, 13, '0')
            END) || '|' || project_id || '|' || task_id AS sort_key
          FROM shaped
        ), extras AS (
          SELECT (SELECT count(*) FROM (SELECT DISTINCT project_id, task_id FROM requests WHERE snoozed) z) AS snoozed_count,
                 (SELECT count(*) FROM app.tasks t JOIN authorized a ON a.id = t.project_id
                  WHERE t.owner_id = $1 AND t.result = 'open' AND t.status = 'ready') AS backlog_count,
                 (SELECT count(*) FROM authorized) AS project_count,
                 (SELECT count(*) FROM app.project_members m WHERE m.principal_id = $1) AS membership_count,
                 (SELECT coalesce(string_agg(id || ':' || role, ',' ORDER BY id), '') FROM authorized) AS epoch_source,
                 to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS generated_at
        )
        $final
        """.trimIndent()
    }

    /** `$6`: page size + 1 per section and group. */
    private const val ENVELOPE = """
        SELECT e.*, x.* FROM extras e LEFT JOIN (
          SELECT keyed.*, row_number() OVER (PARTITION BY bucket ORDER BY sort_key COLLATE "C") AS position,
                 count(*) OVER (PARTITION BY bucket) AS bucket_count
          FROM keyed
        ) x ON x.position <= $6
        ORDER BY x.bucket, x.position
    """

    /** `$6` section, `$7` position after (empty: the first page), `$8` page size + 1. */
    private const val LIST = """
        SELECT e.*, (SELECT count(*) FROM keyed WHERE bucket = $6) AS bucket_total, x.* FROM extras e LEFT JOIN (
          SELECT * FROM keyed WHERE bucket = $6 AND sort_key COLLATE "C" > $7 ORDER BY sort_key COLLATE "C" LIMIT $8
        ) x ON true
        ORDER BY x.sort_key COLLATE "C"
    """
}
