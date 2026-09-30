package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.workbench.domain.Horizon
import com.sprintique.workbench.domain.PlanHorizon
import tools.jackson.databind.json.JsonMapper
import java.time.ZoneId

/** A preference field of a command: left as it is, or set to a value (which may be null: cleared). */
sealed interface Field<out T> {
    data object Keep : Field<Nothing>

    data class Set<T>(val value: T) : Field<T>
}

/**
 * The one personal setting of the overview (docs/workbench/design-v2.md §11.4): "Текущая работа" as lanes or as one
 * list. Validated by the request contract; stored as it is.
 */
data class WorkbenchLayout(val currentForm: String) {
    fun toMap(): Map<String, Any?> = linkedMapOf("currentForm" to currentForm)

    companion object {
        val DEFAULT = WorkbenchLayout("lanes")
    }
}

/**
 * The read-only plan lens (docs/adr W5): today or seven calendar days of the person's own time. Deadlines, planned
 * intervals, requested answers, personal check-backs and project milestones stay distinct kinds; nothing is moved
 * here. Only work the person has a relation to is shown, and each item says which relation (assigned, participating,
 * waiting, request), so a board, a calendar or a list draws it without another request. Tasks the person
 * participates in without any date form "Без времени".
 */
object Plan {
    private const val ITEM_LIMIT = 500
    private const val UNDATED_LIMIT = 50
    private const val STATEMENT_BUDGET = "5s"
    private val json = JsonMapper.builder().build()

    fun preferences(tx: Transaction, actor: Actor): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        val row = tx.row(
            "SELECT timezone, layout, revision FROM app.workbench_preferences WHERE principal_id = $1",
            actor.id,
        )
        return linkedMapOf(
            "timezone" to row?.get("timezone"),
            "layout" to layoutOf(row).toMap(),
            "revision" to (row?.long("revision") ?: 0L),
        )
    }

    private fun layoutOf(row: Row?): WorkbenchLayout {
        val node = row?.json("layout") ?: return WorkbenchLayout.DEFAULT
        val form = node.path("currentForm").asString().takeIf { it.isNotEmpty() } ?: WorkbenchLayout.DEFAULT.currentForm
        return WorkbenchLayout(form)
    }

    /** Sets the fields the command names and keeps the others, against the preferences' one revision. */
    fun savePreferences(
        tx: Transaction,
        actor: Actor,
        baseRevision: Long,
        timezone: Field<String?>,
        layout: Field<WorkbenchLayout?>,
    ): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        requireCondition(
            timezone != Field.Keep || layout != Field.Keep,
            400,
            "VALIDATION",
            "Передайте часовой пояс или раскладку.",
        )
        val zone = (timezone as? Field.Set)?.value
        requireCondition(
            zone == null || PlanHorizon.zoneOf(zone) != null,
            400,
            "VALIDATION",
            "Неизвестный часовой пояс.",
        )
        val arranged = (layout as? Field.Set)?.value ?: WorkbenchLayout.DEFAULT
        val layoutJson = json.writeValueAsString(arranged.toMap())
        val saved = tx.row(
            """
            INSERT INTO app.workbench_preferences(principal_id, timezone, layout)
            SELECT $1, $2, $3::jsonb WHERE $4::bigint = 0
            ON CONFLICT (principal_id) DO NOTHING RETURNING revision
            """.trimIndent(),
            actor.id,
            zone,
            layoutJson,
            baseRevision,
        ) ?: tx.row(
            """
            UPDATE app.workbench_preferences
            SET timezone = CASE WHEN $5 THEN $2 ELSE timezone END, layout = CASE WHEN $6 THEN $3::jsonb ELSE layout END,
                revision = revision + 1, updated_at = clock_timestamp()
            WHERE principal_id = $1 AND revision = $4 RETURNING revision
            """.trimIndent(),
            actor.id,
            zone,
            layoutJson,
            baseRevision,
            timezone is Field.Set,
            layout is Field.Set,
        )
        requireCondition(saved != null, 409, "CONFLICT", "Настройки уже изменены. Обновите страницу.")
        return preferences(tx, actor)
    }

    /**
     * The plan of [horizon]. `undatedRows` false (the overview's week) returns only the number of undated tasks in
     * `summary`, not their rows.
     */
    @Suppress("LongParameterList")
    fun horizon(
        tx: Transaction,
        actor: Actor,
        horizon: Horizon,
        projects: List<String>?,
        requested: String?,
        parts: WorkbenchParts,
        undatedRows: Boolean = true,
    ): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        tx.update("SET LOCAL statement_timeout = '$STATEMENT_BUDGET'")
        val preference = tx.row("SELECT timezone FROM app.workbench_preferences WHERE principal_id = $1", actor.id)
            ?.stringOrNull("timezone")
        val (timezone, source) = when {
            requested != null -> requested to "request"
            preference != null -> preference to "preference"
            else -> "UTC" to "default"
        }
        val zone = PlanHorizon.zoneOf(timezone) ?: ZoneId.of("UTC")
        val now = tx.row("SELECT clock_timestamp() AS now")!!.instant("now")
        val range = PlanHorizon.range(now, zone, horizon)
        val rows = tx.rows(
            QUERY,
            actor.id,
            projects,
            parts.requests,
            parts.personal,
            parts.waiting,
            range.from.toString(),
            range.to.toString(),
            ITEM_LIMIT + 1,
            if (undatedRows) UNDATED_LIMIT + 1 else 0,
        )
        val undatedCount = rows.first().long("undated_count")
        val found = rows.filter { it.stringOrNull("kind") != null }
        val items = found.filter { it.string("kind") != "undated" }
        val undated = found.filter { it.string("kind") == "undated" }.take(UNDATED_LIMIT)
        val first = range.from.toString()
        val dated = items.take(ITEM_LIMIT).map { item(it, first) }
        val byDay = dated.groupBy { it["day"] as String }
        val days = generateSequence(range.from) { it.plusDays(1) }.takeWhile { !it.isAfter(range.to) }.map { day ->
            linkedMapOf("date" to day.toString(), "items" to byDay[day.toString()].orEmpty())
        }.toList()
        return linkedMapOf(
            "horizon" to horizon.wire,
            "timezone" to zone.id,
            "timezoneSource" to source,
            "preferredTimezone" to preference,
            "generatedAt" to now.toString(),
            "today" to range.today.toString(),
            "from" to first,
            "to" to range.to.toString(),
            "days" to days,
            "undated" to undated.map { item(it, first) },
            "truncated" to (items.size > ITEM_LIMIT),
            "summary" to linkedMapOf(
                "itemCount" to dated.size,
                "overdueCount" to dated.count { it["overdue"] == true },
                "undatedCount" to undatedCount,
                "undatedTruncated" to (undatedCount > UNDATED_LIMIT || (!undatedRows && undatedCount > 0)),
            ),
        )
    }

    private fun item(row: Row, first: String): Map<String, Any?> {
        val date = row.stringOrNull("day")
        val overdue = date != null && date < first
        val taskId = row.stringOrNull("task_id")
        val projectId = row.string("project_id")
        val kind = row.string("kind")
        return linkedMapOf<String, Any?>(
            // Unique per item: a task can carry two requests with the same date, each its own item.
            "key" to "$kind:$projectId:${taskId ?: ""}:${row.stringOrNull("ref_id") ?: ""}:${date ?: ""}",
            "kind" to kind,
            "day" to if (overdue) first else (date ?: first),
            "date" to date,
            "overdue" to overdue,
            "startDate" to row["start_day"],
            "endDate" to row["end_day"],
            // Why this is in the person's plan: their assignment, participation, delegated work or a request to them.
            "relation" to row["relation"],
            "projectId" to projectId,
            "projectName" to row["project_name"],
            "workspaceName" to row["workspace_name"],
            "task" to taskId?.let {
                linkedMapOf(
                    "id" to it,
                    "displayId" to row["display_id"],
                    "title" to row["title"],
                    "status" to row["status"],
                    "statusCategory" to when {
                        row["done"] == true -> "done"
                        row["status"] == "ready" -> "todo"
                        else -> "active"
                    },
                    "done" to row["done"],
                    "priority" to row["priority"],
                    "owner" to row.stringOrNull("owner_id")?.let { id ->
                        linkedMapOf("id" to id, "name" to row["owner_name"])
                    },
                    "due" to row["task_due"],
                    "plannedStart" to row["task_planned_start"],
                    "plannedEnd" to row["task_planned_end"],
                    "revision" to row["task_revision"],
                )
            },
            "milestone" to if (kind == "milestone") {
                linkedMapOf("id" to row["ref_id"], "title" to row["title"])
            } else {
                null
            },
            "requestId" to if (kind == "neededBy") row["ref_id"] else null,
            "canonicalUrl" to taskId?.let { "/workbench/tasks/$projectId/$it" },
        ).apply { if (get("workspaceName") == null) remove("workspaceName") }
    }

    /**
     * `$1` actor, `$2` project filter, `$3`–`$5` enabled parts, `$6`–`$7` the local day range, `$8` item cap + 1,
     * `$9` undated rows cap + 1 (0: only their number). Overdue deadlines, answers and check-backs of open work are
     * kept (shown on the first day); planned intervals appear on every day of the range they cover. The first row
     * carries the number of undated tasks even when there are no items.
     */
    private val QUERY = """
        WITH authorized AS MATERIALIZED (
          SELECT p.id, p.key, p.name, m.role, m.permissions, w.name AS workspace_name
          FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
          LEFT JOIN app.workspaces w ON w.id = p.workspace_id
          WHERE m.principal_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))
          ORDER BY p.id LIMIT ${Workbench.PROJECT_LIMIT}
        ), personal AS MATERIALIZED (
          SELECT s.* FROM app.task_personal_state s JOIN authorized a ON a.id = s.project_id
          WHERE s.principal_id = $1 AND $4::boolean
        ), requests AS MATERIALIZED (
          SELECT r.* FROM app.attention_requests r JOIN authorized a ON a.id = r.project_id
          WHERE $3::boolean AND r.recipient_id = $1 AND r.status = 'open' AND 'tasks.write' = ANY(a.permissions)
            -- A request on an approval that expired can no longer be answered: it is not planned time.
            AND (r.approval_id IS NULL OR EXISTS (SELECT 1 FROM app.approvals ap WHERE ap.project_id = r.project_id
                 AND ap.id = r.approval_id AND ap.status = 'proposed' AND ap.expires_at > now()))
        ), participating AS MATERIALIZED (
          SELECT project_id, task_id, rank, check_back_at, accepted_sequence FROM personal WHERE participating
        ), delegated AS MATERIALIZED (
          -- "Жду", by the same rule as the Workbench statement: the person's latest assignment went to someone else.
          SELECT p.project_id, p.task_id, p.check_back_at
          FROM participating p JOIN app.tasks t ON t.project_id = p.project_id AND t.id = p.task_id
          CROSS JOIN LATERAL (
            SELECT e.detail->>'to' AS expected, e.sequence FROM app.task_activity e
            WHERE e.project_id = p.project_id AND e.task_id = p.task_id AND e.kind = 'owner'
              AND (e.actor_id = $1 OR e.initiator_id = $1)
            ORDER BY e.sequence DESC LIMIT 1
          ) d
          WHERE $5::boolean AND t.owner_id IS DISTINCT FROM $1 AND d.expected IS NOT NULL AND d.expected <> $1
            AND NOT (p.accepted_sequence IS NOT NULL AND p.accepted_sequence >= d.sequence
                     AND (t.status = 'ready_for_release' OR t.result = 'accepted'))
        ), mine AS MATERIALIZED (
          -- One relation per task: an assignment outranks participation, delegated participation is waiting.
          SELECT DISTINCT ON (project_id, task_id) project_id, task_id, relation FROM (
            SELECT t.project_id, t.id AS task_id, 'assigned' AS relation, 1 AS precedence
            FROM app.tasks t JOIN authorized a ON a.id = t.project_id
            WHERE t.owner_id = $1 AND t.result = 'open' AND t.status <> 'ready_for_release'
            UNION ALL
            SELECT p.project_id, p.task_id, CASE WHEN d.task_id IS NULL THEN 'participating' ELSE 'waiting' END, 2
            FROM participating p LEFT JOIN delegated d ON d.project_id = p.project_id AND d.task_id = p.task_id
          ) m ORDER BY project_id, task_id, precedence
        ), items AS (
          SELECT 'due' AS kind, m.project_id, m.task_id, t.due AS day, NULL::date AS start_day, NULL::date AS end_day,
                 NULL::text AS ref_id, m.relation, 1 AS kind_order
          FROM mine m JOIN app.tasks t ON t.project_id = m.project_id AND t.id = m.task_id
          WHERE t.due IS NOT NULL AND t.due <= $7::date
            AND (t.due >= $6::date OR (t.status <> 'ready_for_release' AND t.result = 'open'))
          UNION ALL
          SELECT 'planned', m.project_id, m.task_id, d::date, t.planned_start, t.planned_end, NULL, m.relation, 2
          FROM mine m JOIN app.tasks t ON t.project_id = m.project_id AND t.id = m.task_id
          CROSS JOIN LATERAL generate_series(
            greatest(coalesce(t.planned_start, t.planned_end), $6::date)::timestamp,
            least(coalesce(t.planned_end, t.planned_start), $7::date)::timestamp, interval '1 day') d
          WHERE coalesce(t.planned_start, t.planned_end) IS NOT NULL AND t.status <> 'ready_for_release' AND t.result = 'open'
          UNION ALL
          SELECT 'neededBy', r.project_id, r.task_id, r.needed_by, NULL, NULL, r.id::text, 'request', 0
          FROM requests r WHERE r.needed_by IS NOT NULL AND r.needed_by <= $7::date
          UNION ALL
          SELECT 'checkBack', w.project_id, w.task_id, w.check_back_at, NULL, NULL, NULL, 'waiting', 3
          FROM delegated w WHERE w.check_back_at IS NOT NULL AND w.check_back_at <= $7::date
          UNION ALL
          SELECT 'milestone', m.project_id, NULL, m.date, NULL, NULL, m.id, NULL, 4
          FROM app.milestones m JOIN authorized a ON a.id = m.project_id
          WHERE m.date BETWEEN $6::date AND $7::date
        ), dated AS (
          SELECT i.*, greatest(i.day, $6::date) AS placed_day FROM items i
          ORDER BY greatest(i.day, $6::date), i.day, i.kind_order, i.project_id, i.task_id NULLS LAST, i.ref_id
          LIMIT $8
        ), undated_all AS MATERIALIZED (
          SELECT s.project_id, s.task_id, s.rank FROM participating s
          JOIN app.tasks t ON t.project_id = s.project_id AND t.id = s.task_id
          WHERE t.result = 'open' AND t.status <> 'ready_for_release' AND t.due IS NULL AND t.planned_start IS NULL
            AND t.planned_end IS NULL
            AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.project_id = s.project_id AND r.task_id = s.task_id
                            AND r.needed_by IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM delegated w WHERE w.project_id = s.project_id AND w.task_id = s.task_id
                            AND w.check_back_at IS NOT NULL)
        ), undated AS (
          SELECT 'undated' AS kind, u.project_id, u.task_id, NULL::date AS day, NULL::date AS start_day,
                 NULL::date AS end_day, NULL::text AS ref_id, m.relation, 9 AS kind_order, NULL::date AS placed_day
          FROM undated_all u JOIN mine m ON m.project_id = u.project_id AND m.task_id = u.task_id
          ORDER BY u.rank, u.project_id, u.task_id LIMIT $9
        ), picked AS (
          SELECT * FROM dated UNION ALL SELECT * FROM undated
        ), shaped AS (
          SELECT x.kind, x.project_id, x.task_id, to_char(x.day, 'YYYY-MM-DD') AS day,
                 to_char(x.start_day, 'YYYY-MM-DD') AS start_day, to_char(x.end_day, 'YYYY-MM-DD') AS end_day, x.ref_id,
                 x.relation, x.placed_day AS placed, x.day AS day_raw, x.kind_order,
                 a.name AS project_name,
                 CASE WHEN a.name IN (SELECT name FROM authorized GROUP BY name HAVING count(*) > 1) THEN a.workspace_name END
                   AS workspace_name,
                 coalesce(t.title, ms.title) AS title, a.key || '-' || t.number AS display_id, t.status,
                 t.revision AS task_revision, t.priority, t.owner_id,
                 (SELECT coalesce(o.profile_name, o.name) FROM auth.principals o WHERE o.id = t.owner_id) AS owner_name,
                 to_char(t.due, 'YYYY-MM-DD') AS task_due, to_char(t.planned_start, 'YYYY-MM-DD') AS task_planned_start,
                 to_char(t.planned_end, 'YYYY-MM-DD') AS task_planned_end,
                 (t.status = 'ready_for_release' OR t.result = 'accepted') AS done
          FROM picked x JOIN authorized a ON a.id = x.project_id
          LEFT JOIN app.tasks t ON t.project_id = x.project_id AND t.id = x.task_id
          LEFT JOIN app.milestones ms ON x.kind = 'milestone' AND ms.project_id = x.project_id AND ms.id = x.ref_id
        )
        SELECT c.undated_count, s.* FROM (SELECT count(*) AS undated_count FROM undated_all) c
        LEFT JOIN shaped s ON true
        ORDER BY s.placed NULLS LAST, s.day_raw, s.kind_order, s.project_id, s.task_id NULLS LAST, s.ref_id
    """.trimIndent()
}
