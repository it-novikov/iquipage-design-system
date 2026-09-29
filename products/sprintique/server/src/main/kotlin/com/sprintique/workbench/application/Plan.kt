package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.workbench.domain.Horizon
import com.sprintique.workbench.domain.PlanHorizon
import java.time.ZoneId

/**
 * The read-only plan lens (docs/adr W5): today or seven calendar days of the person's own time. Deadlines, planned
 * intervals, requested answers, personal check-backs and project milestones stay distinct kinds; nothing is moved
 * here. Only work the person has a relation to is shown; tasks without dates stay on "Сейчас".
 */
object Plan {
    private const val ITEM_LIMIT = 500
    private const val UNDATED_LIMIT = 50
    private const val STATEMENT_BUDGET = "5s"

    fun preferences(tx: Transaction, actor: Actor): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        val row = tx.row("SELECT timezone, revision FROM app.workbench_preferences WHERE principal_id = $1", actor.id)
        return linkedMapOf("timezone" to row?.get("timezone"), "revision" to (row?.long("revision") ?: 0L))
    }

    fun savePreferences(tx: Transaction, actor: Actor, baseRevision: Long, timezone: String): Map<String, Any?> {
        WorkbenchAccess.requireHuman(actor)
        requireCondition(PlanHorizon.zoneOf(timezone) != null, 400, "VALIDATION", "Неизвестный часовой пояс.")
        val saved = tx.row(
            """
            INSERT INTO app.workbench_preferences(principal_id, timezone) SELECT $1, $2 WHERE $3::bigint = 0
            ON CONFLICT (principal_id) DO NOTHING RETURNING revision
            """.trimIndent(),
            actor.id,
            timezone,
            baseRevision,
        ) ?: tx.row(
            """
            UPDATE app.workbench_preferences SET timezone = $2, revision = revision + 1, updated_at = clock_timestamp()
            WHERE principal_id = $1 AND revision = $3 RETURNING revision
            """.trimIndent(),
            actor.id,
            timezone,
            baseRevision,
        )
        requireCondition(saved != null, 409, "CONFLICT", "Настройки уже изменены. Обновите страницу.")
        return linkedMapOf("timezone" to timezone, "revision" to saved.long("revision"))
    }

    @Suppress("LongParameterList")
    fun horizon(
        tx: Transaction,
        actor: Actor,
        horizon: Horizon,
        projects: List<String>?,
        requested: String?,
        parts: WorkbenchParts,
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
        )
        val items = rows.filter { it.string("kind") != "undated" }
        val undated = rows.filter { it.string("kind") == "undated" }.take(UNDATED_LIMIT)
        val byDay = items.take(ITEM_LIMIT).map { item(it, range.from.toString()) }.groupBy { it["day"] as String }
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
            "from" to range.from.toString(),
            "to" to range.to.toString(),
            "days" to days,
            "undated" to undated.map { item(it, range.from.toString()) },
            "truncated" to (items.size > ITEM_LIMIT),
        )
    }

    private fun item(row: Row, first: String): Map<String, Any?> {
        val date = row.stringOrNull("day")
        val overdue = date != null && date < first
        val taskId = row.stringOrNull("task_id")
        val projectId = row.string("project_id")
        return linkedMapOf<String, Any?>(
            "key" to "${row.string("kind")}:$projectId:${taskId ?: row["ref_id"]}:${date ?: ""}",
            "kind" to row["kind"],
            "day" to if (overdue) first else (date ?: first),
            "date" to date,
            "overdue" to overdue,
            "startDate" to row["start_day"],
            "endDate" to row["end_day"],
            "projectId" to projectId,
            "projectName" to row["project_name"],
            "workspaceName" to row["workspace_name"],
            "task" to taskId?.let {
                linkedMapOf(
                    "id" to it,
                    "displayId" to row["display_id"],
                    "title" to row["title"],
                    "status" to row["status"],
                    "done" to row["done"],
                    "revision" to row["task_revision"],
                )
            },
            "milestone" to if (row.string("kind") == "milestone") {
                linkedMapOf("id" to row["ref_id"], "title" to row["title"])
            } else {
                null
            },
            "requestId" to if (row.string("kind") == "neededBy") row["ref_id"] else null,
            "canonicalUrl" to taskId?.let { "/workbench/tasks/$projectId/$it" },
        ).apply { if (get("workspaceName") == null) remove("workspaceName") }
    }

    /**
     * `$1` actor, `$2` project filter, `$3`–`$5` enabled parts, `$6`–`$7` the local day range, `$8` item cap + 1.
     * Overdue deadlines, answers and check-backs of open work are kept (shown on the first day); planned intervals
     * appear on every day of the range they cover.
     */
    private val QUERY = """
        WITH authorized AS MATERIALIZED (
          SELECT p.id, p.key, p.name, m.role, w.name AS workspace_name
          FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
          LEFT JOIN app.workspaces w ON w.id = p.workspace_id
          WHERE m.principal_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))
          ORDER BY p.id LIMIT ${Workbench.PROJECT_LIMIT}
        ), personal AS MATERIALIZED (
          SELECT s.* FROM app.task_personal_state s JOIN authorized a ON a.id = s.project_id
          WHERE s.principal_id = $1 AND $4::boolean
        ), requests AS MATERIALIZED (
          SELECT r.* FROM app.attention_requests r JOIN authorized a ON a.id = r.project_id
          WHERE $3::boolean AND r.recipient_id = $1 AND r.status = 'open' AND a.role IN ('editor', 'admin')
        ), waits AS MATERIALIZED (
          SELECT w.* FROM app.task_wait_state w JOIN authorized a ON a.id = w.project_id
          WHERE $5::boolean AND w.principal_id = $1 AND w.state = 'active'
        ), mine AS MATERIALIZED (
          SELECT t.project_id, t.id AS task_id FROM app.tasks t JOIN authorized a ON a.id = t.project_id
          WHERE t.owner_id = $1 AND t.result = 'open' AND t.status <> 'ready_for_release'
          UNION SELECT project_id, task_id FROM personal WHERE focus_rank IS NOT NULL
        ), items AS (
          SELECT 'due' AS kind, m.project_id, m.task_id, t.due AS day, NULL::date AS start_day, NULL::date AS end_day,
                 NULL::text AS ref_id, 1 AS kind_order
          FROM mine m JOIN app.tasks t ON t.project_id = m.project_id AND t.id = m.task_id
          WHERE t.due IS NOT NULL AND t.due <= $7::date
            AND (t.due >= $6::date OR (t.status <> 'ready_for_release' AND t.result = 'open'))
          UNION ALL
          SELECT 'planned', m.project_id, m.task_id, d::date, t.planned_start, t.planned_end, NULL, 2
          FROM mine m JOIN app.tasks t ON t.project_id = m.project_id AND t.id = m.task_id
          CROSS JOIN LATERAL generate_series(
            greatest(coalesce(t.planned_start, t.planned_end), $6::date)::timestamp,
            least(coalesce(t.planned_end, t.planned_start), $7::date)::timestamp, interval '1 day') d
          WHERE coalesce(t.planned_start, t.planned_end) IS NOT NULL AND t.status <> 'ready_for_release' AND t.result = 'open'
          UNION ALL
          SELECT 'neededBy', r.project_id, r.task_id, r.needed_by, NULL, NULL, r.id::text, 0
          FROM requests r WHERE r.needed_by IS NOT NULL AND r.needed_by <= $7::date
          UNION ALL
          SELECT 'checkBack', w.project_id, w.task_id, w.check_back_at, NULL, NULL, NULL, 3
          FROM waits w WHERE w.check_back_at IS NOT NULL AND w.check_back_at <= $7::date
          UNION ALL
          SELECT 'milestone', m.project_id, NULL, m.date, NULL, NULL, m.id, 4
          FROM app.milestones m JOIN authorized a ON a.id = m.project_id
          WHERE m.date BETWEEN $6::date AND $7::date
        ), dated AS (
          SELECT i.*, greatest(i.day, $6::date) AS placed_day FROM items i
          ORDER BY greatest(i.day, $6::date), i.day, i.kind_order, i.project_id, i.task_id NULLS LAST, i.ref_id
          LIMIT $8
        ), undated AS (
          SELECT 'undated' AS kind, s.project_id, s.task_id, NULL::date AS day, NULL::date AS start_day, NULL::date AS end_day,
                 NULL::text AS ref_id, 9 AS kind_order, NULL::date AS placed_day
          FROM personal s JOIN app.tasks t ON t.project_id = s.project_id AND t.id = s.task_id
          WHERE s.focus_rank IS NOT NULL AND t.due IS NULL AND t.planned_start IS NULL AND t.planned_end IS NULL
            AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.project_id = s.project_id AND r.task_id = s.task_id AND r.needed_by IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM waits w WHERE w.project_id = s.project_id AND w.task_id = s.task_id AND w.check_back_at IS NOT NULL)
          ORDER BY s.focus_rank LIMIT ${UNDATED_LIMIT}
        ), picked AS (
          SELECT * FROM dated UNION ALL SELECT * FROM undated
        )
        SELECT x.kind, x.project_id, x.task_id, to_char(x.day, 'YYYY-MM-DD') AS day,
               to_char(x.start_day, 'YYYY-MM-DD') AS start_day, to_char(x.end_day, 'YYYY-MM-DD') AS end_day, x.ref_id,
               a.name AS project_name,
               CASE WHEN a.name IN (SELECT name FROM authorized GROUP BY name HAVING count(*) > 1) THEN a.workspace_name END
                 AS workspace_name,
               coalesce(t.title, ms.title) AS title, a.key || '-' || t.number AS display_id, t.status, t.revision AS task_revision,
               (t.status = 'ready_for_release' OR t.result = 'accepted') AS done
        FROM picked x JOIN authorized a ON a.id = x.project_id
        LEFT JOIN app.tasks t ON t.project_id = x.project_id AND t.id = x.task_id
        LEFT JOIN app.milestones ms ON x.kind = 'milestone' AND ms.project_id = x.project_id AND ms.id = x.ref_id
        ORDER BY x.placed_day NULLS LAST, x.day, x.kind_order, x.project_id, x.task_id NULLS LAST, x.ref_id
    """.trimIndent()
}
