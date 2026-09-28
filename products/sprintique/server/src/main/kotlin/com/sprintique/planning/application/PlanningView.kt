package com.sprintique.planning.application

import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.planning.application.ViewText.BACKLOG
import com.sprintique.planning.application.ViewText.PRIORITIES
import com.sprintique.planning.application.ViewText.STATUS_LABELS
import com.sprintique.planning.application.ViewText.dateLabel
import com.sprintique.planning.application.ViewText.finished
import com.sprintique.planning.application.ViewText.isDone
import com.sprintique.planning.application.ViewText.memberNames
import com.sprintique.planning.application.ViewText.ownerLabel
import com.sprintique.planning.contract.ViewFiltering
import com.sprintique.planning.contract.ViewOptionsQuery
import com.sprintique.planning.contract.ViewQuery
import com.sprintique.planning.contract.ViewRowsQuery
import com.sprintique.planning.contract.ViewSelectQuery
import com.sprintique.planning.domain.HistoryItem
import com.sprintique.planning.domain.Milestone
import com.sprintique.planning.domain.PlanningRow
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.planning.domain.Release
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.domain.TaskRules
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Locale
import java.util.UUID

/** The projection the planning screen reads. Queries are bounded POSTs; they never change anything. */
@Component
@Profile("api")
class PlanningView(private val json: JsonMapper, private val support: ViewSupport) {
    fun groups(tx: Transaction, actor: Actor, projectId: String, query: ViewQuery): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val filters = query.filters()
        val byRelease = c.rows.groupBy { it.effectiveReleaseId ?: BACKLOG }
        val closed = query.history.wire == "closed"
        val items = ArrayList<Map<String, Any?>>()
        // One bounded release snapshot at a time; the whole history catalogue is never materialized.
        val shown = c.state.releases.filter {
            it.archivedAt == null && finished(it) == closed && (query.releaseId.isEmpty() || it.id == query.releaseId)
        }
        for (release in shown) {
            val members = if (closed) {
                support.finalSnapshot(tx, projectId, release.id).orEmpty().map(HistoryItem::before)
            } else {
                byRelease[release.id].orEmpty()
            }
            items += group(
                release.id,
                release.name,
                release.lifecycle,
                members,
                support.matches(filters, members, c.state.releases).size,
                release,
            )
        }
        items.sortWith(
            compareBy<Map<String, Any?>> { if (it["state"] == "active") 0 else 1 }
                .then { a, b ->
                    ViewOrder.text(
                        a["plannedStart"] as String? ?: "9999",
                        b["plannedStart"] as String? ?: "9999",
                    )
                }
                .then { a, b -> ViewOrder.text(a["title"] as String, b["title"] as String) }
                .then { a, b -> ViewOrder.text(a["id"] as String, b["id"] as String) },
        )
        if (!closed && (query.releaseId.isEmpty() || query.releaseId == BACKLOG)) {
            val members = byRelease[BACKLOG].orEmpty()
            items +=
                group(
                    BACKLOG,
                    "Бэклог",
                    "backlog",
                    members,
                    support.matches(filters, members, c.state.releases).size,
                    null,
                )
        }
        val page = Pages.page(
            items,
            support.binding(projectId, "groups", filters),
            c.revision,
            GROUP_PAGE,
            query.cursor,
        )
        val can = c.write
        return linkedMapOf(
            "protocol" to "sprintique.planning-view/1",
            "projectId" to projectId,
            "revision" to c.revision.toString(),
            "items" to page.items,
            "nextCursor" to page.nextCursor,
            "matchedTotal" to items.sumOf { it["matched"] as Int },
            "capabilities" to linkedMapOf(
                "createTask" to can, "createRelease" to can, "prepare" to can, "move" to can, "start" to can,
                "editRelease" to can, "close" to can, "cancel" to can, "bulk" to can, "reorder" to can,
                "selection" to can,
                "timeline" to true, "temporal" to can, "milestone" to can, "settings" to c.admin,
            ),
        )
    }

    @Suppress("LongParameterList")
    private fun group(
        id: String,
        title: String,
        state: String,
        members: List<PlanningRow>,
        matched: Int,
        release: Release?,
    ) =
        linkedMapOf<String, Any?>(
            "id" to id,
            "title" to title,
            "state" to state,
            "total" to members.size,
            "matched" to matched,
            "done" to members.count(::isDone),
            "dateLabel" to (release?.let(::dateLabel) ?: ""),
            "formatLabel" to when (release?.format) {
                null -> ""
                "timeboxed" -> "Спринт"
                else -> "Релиз"
            },
            "format" to (release?.format ?: ""),
            "plannedStart" to release?.plannedStart,
            "plannedEnd" to release?.plannedEnd,
            "deadline" to release?.deadline,
        )

    fun rows(tx: Transaction, actor: Actor, projectId: String, query: ViewRowsQuery): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        requireCondition(
            query.revision == c.revision.toString(),
            409,
            "CURSOR_STALE",
            "Состав изменился. Обновите планирование.",
        )
        val release = c.state.releases.firstOrNull { it.id == query.groupId }
        val historical = release != null && finished(release)
        val closed = query.history.wire == "closed"
        requireCondition(
            (query.groupId == BACKLOG && !closed) ||
                (release != null && release.archivedAt == null && historical == closed),
            404,
            "NOT_FOUND",
            "Группа недоступна.",
        )
        val members = if (historical) {
            support.finalSnapshot(tx, projectId, query.groupId).orEmpty().map(HistoryItem::before)
        } else {
            c.rows.filter { (it.effectiveReleaseId ?: BACKLOG) == query.groupId }
        }
        val filters = query.filters()
        val matched = support.matches(filters, members, c.state.releases)
        val childCounts = HashMap<String, Int>()
        for (row in members) row.parentId?.let { childCounts.merge(it, 1, Int::plus) }
        val scope = RowScope(
            groupId = query.groupId,
            matched = matched,
            memberIds = members.mapTo(HashSet(), PlanningRow::id),
            childCounts = childCounts,
            byId = c.rows.associateBy(PlanningRow::id),
            names = memberNames(c.state),
            editable = c.write && !historical,
        )
        val ordered = orderedRows(members, filters, matched, query.collapsedTaskIds)
        val bindingValue = listOf(filters, query.groupId, query.collapsedTaskIds)
        val page = Pages.page(
            ordered,
            support.binding(projectId, "rows", bindingValue),
            c.revision,
            ROW_PAGE,
            query.cursor,
        )
        // Only the requested page becomes transport rows; hierarchy counts are indexed once.
        val rows = page.items.map { (row, depth) -> viewRow(row, depth, scope) }
        return linkedMapOf(
            "projectId" to projectId,
            "groupId" to query.groupId,
            "revision" to c.revision.toString(),
            "rows" to rows,
            "nextCursor" to page.nextCursor,
        )
    }

    /** What every row of one page is described against. */
    private data class RowScope(
        val groupId: String,
        val matched: Set<String>,
        val memberIds: Set<String>,
        val childCounts: Map<String, Int>,
        val byId: Map<String, PlanningRow>,
        val names: Map<String, String>,
        val editable: Boolean,
    )

    private fun viewRow(row: PlanningRow, depth: Int, scope: RowScope): Map<String, Any?> = linkedMapOf(
        "id" to "${scope.groupId}/${row.id}",
        "taskId" to row.id,
        "key" to row.displayId,
        "title" to row.title,
        "type" to row.type,
        "priority" to row.priority,
        "preparation" to row.preparation,
        "statusLabel" to if (row.result == "accepted") "Принята" else STATUS_LABELS[row.status] ?: row.status,
        "ownerLabel" to ownerLabel(row, scope.names),
        "ownerId" to (row.ownerId ?: ""),
        "dueValue" to row.due,
        "dateLabel" to (row.due ?: ""),
        "parentId" to row.parentId,
        "admission" to row.admitted,
        "outcome" to row.result,
        "revision" to row.revision,
        "depth" to depth,
        "childrenCount" to (scope.childCounts[row.id] ?: 0),
        "contextOnly" to (row.id !in scope.matched),
        "selectable" to (scope.editable && row.result == "open" && row.id in scope.matched),
        "parentContext" to parentContext(row, scope),
    )

    private fun parentContext(row: PlanningRow, scope: RowScope): String {
        val parent = row.parentId ?: return ""
        if (parent in scope.memberIds) return ""
        return scope.byId[parent]?.displayId ?: "Родитель в другой группе"
    }

    /** Stores a canonical server selector for the matching tasks, never a client-generated list. */
    fun select(tx: Transaction, actor: Actor, projectId: String, query: ViewSelectQuery): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        requireCondition(c.write && query.history.wire == "current", 403, "READ_ONLY", "Нельзя изменять историю.")
        val selection = support.filterSelection(query, query.taskIds)
        val count = PlanningRows.selected(selection.toDomain(), c.rows, c.state.releases).size
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO app.planning_selections(project_id, id, actor_id, credential_id, project_revision, filter, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp() + interval '10 minutes')
            """.trimIndent(),
            projectId, id, actor.id, actor.credentialId, c.revision, json.valueToTree<JsonNode>(selection),
        )
        return linkedMapOf("token" to id, "count" to count, "revision" to c.revision.toString())
    }

    fun options(tx: Transaction, actor: Actor, projectId: String, query: ViewOptionsQuery): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val kind = query.kind.wire
        var items: List<Map<String, Any?>> = when (kind) {
            "destinations" -> listOf(option(BACKLOG, "Бэклог")) +
                c.state.releases.filter { !finished(it) && it.archivedAt == null && it.id != query.excludeId }
                    .map { option(it.id, it.name, dateLabel(it)) }

            "tasks" -> c.rows.filter { it.result == "open" }.map { option(it.id, "${it.displayId} ${it.title}") }

            "positions" -> {
                val taskId = requirePresent(query.taskId, 400, "TASK_REQUIRED", "Укажите задачу.")
                support.siblings(c.rows, taskId).filter {
                    it.id != taskId
                }.map { option(it.id, "Перед ${it.displayId} ${it.title}") }
            }

            "owner" -> listOf(option("__none__", "Не назначен")) + c.state.members.map { option(it.id, it.name) }

            else -> tx.rows(
                """
                SELECT id AS value, name AS label FROM app.tags
                WHERE project_id = $1 AND archived_at IS NULL ORDER BY name, id
                """.trimIndent(),
                projectId,
            )
        }
        val search = query.query.lowercase(Locale.ROOT)
        items = items.filter { search in (it["label"] as String).lowercase(Locale.ROOT) }
        // The end of the list stays reachable whatever the search.
        if (kind == "positions") items = items + option("__end__", "В конец списка")
        val bindingValue = query.copy(cursor = null)
        val page = Pages.page(
            items,
            support.binding(projectId, "options", bindingValue),
            c.revision,
            OPTION_PAGE,
            query.cursor,
        )
        return linkedMapOf("options" to page.items, "nextCursor" to page.nextCursor)
    }

    private fun option(value: String, label: String, description: String? = null): Map<String, Any?> =
        linkedMapOf<String, Any?>("value" to value, "label" to label).apply {
            if (description !=
                null
            ) {
                put("description", description)
            }
        }

    fun describeRelease(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        groupId: String,
        cursor: String?,
    ): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val release =
            requirePresent(c.state.releases.firstOrNull { it.id == groupId }, 404, "NOT_FOUND", "Релиз недоступен.")
        val snapshot = support.finalSnapshot(tx, projectId, groupId)
        val members = snapshot?.map(HistoryItem::before) ?: c.rows.filter { it.effectiveReleaseId == groupId }
        val openChildren = HashMap<String, Int>()
        for (task in c.rows) {
            if (task.parentId != null &&
                task.result == "open"
            ) {
                openChildren.merge(task.parentId, 1, Int::plus)
            }
        }
        val items = members.map { task ->
            val outcome = when {
                task.result == "accepted" -> "accepted"
                task.preparation == "ready" && task.status == "ready_for_release" -> "candidate"
                else -> "unfinished"
            }
            linkedMapOf(
                "id" to task.id,
                "key" to task.displayId,
                "title" to task.title,
                "outcome" to outcome,
                "openChildren" to (openChildren[task.id] ?: 0),
            )
        }
        val page = Pages.page(
            items,
            support.binding(projectId, "release-items", groupId),
            c.revision,
            RELEASE_PAGE,
            cursor,
        )
        val visible = page.items.mapTo(HashSet()) { it["id"] }
        val result = linkedMapOf<String, Any?>(
            "title" to release.name,
            "format" to release.format,
            "start" to release.plannedStart,
            "end" to release.plannedEnd,
            "deadline" to release.deadline,
            "nextCursor" to page.nextCursor,
            "revision" to c.revision.toString(),
            "counts" to linkedMapOf(
                "total" to items.size,
                "accepted" to items.count { it["outcome"] == "accepted" },
                "candidates" to items.count { it["outcome"] == "candidate" },
                "unfinished" to items.count { it["outcome"] == "unfinished" },
            ),
            "items" to page.items,
        )
        if (snapshot != null) {
            result["snapshot"] = linkedMapOf(
                "name" to release.name,
                "accepted" to snapshot.count { it.outcome == "accepted" },
                "carried" to snapshot.count { it.outcome != "accepted" },
                "items" to snapshot.filter { it.before.id in visible }.map {
                    linkedMapOf(
                        "id" to it.before.id, "key" to it.before.displayId, "title" to it.before.title,
                        "outcome" to it.outcome,
                    )
                },
            )
        }
        return result
    }

    fun settings(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val defaults = c.state.defaults!!
        val source = tx.row("SELECT inherited, workspace_timezone FROM auth.project_timezone_source($1)", projectId)
        return linkedMapOf(
            "format" to defaults.format,
            "days" to defaults.days,
            "timezone" to defaults.timezone,
            "timezoneInherited" to defaults.timezoneInherited,
            "timeZone" to defaults.timezone,
            "timeZoneInherited" to (source?.get("inherited") == true),
            "workspaceTimeZone" to (source?.stringOrNull("workspace_timezone") ?: defaults.timezone),
        )
    }

    fun timeline(tx: Transaction, actor: Actor, projectId: String, query: ViewQuery): Map<String, Any?> {
        val c = support.context(tx, actor, projectId)
        val matched = support.matches(query, c.rows, c.state.releases)
        val open = c.state.releases.filter { !finished(it) && it.archivedAt == null }
        val releases = open.filter { query.releaseId.isEmpty() || it.id == query.releaseId }
        val releaseIds = releases.mapTo(HashSet(), Release::id)
        val openIds = open.mapTo(HashSet(), Release::id)
        val names = memberNames(c.state)
        val tasks = c.rows.filter {
            it.id in matched &&
                (it.effectiveReleaseId == null || it.effectiveReleaseId in releaseIds)
        }
        val milestones = c.state.milestones.filter {
            (it.releaseId == null || it.releaseId in openIds) &&
                (query.releaseId.isEmpty() || it.releaseId == query.releaseId)
        }
        val records = releases.map { releaseRecord(it, c.write) } + tasks.map { taskRecord(it, c.write, names) } +
            milestones.map { milestoneRecord(it, c.write) }
        requireCondition(
            c.state.constraints.size <= CONSTRAINT_LIMIT,
            422,
            "PROJECTION_LIMIT",
            "Уточните календарный план: превышен лимит зависимостей.",
        )
        val binding = support.binding(projectId, "timeline", query.filters())
        val page = Pages.page(records, binding, c.revision, ROW_PAGE, query.cursor)
        return linkedMapOf(
            "projectId" to projectId,
            "revision" to c.revision.toString(),
            "rows" to page.items,
            "nextCursor" to page.nextCursor,
            "total" to page.total,
            "dependencies" to c.state.constraints.map {
                linkedMapOf(
                    "id" to it.id,
                    "from" to "${it.source.kind}:${it.source.id}",
                    "to" to "${it.target.kind}:${it.target.id}",
                    "type" to it.relation,
                    "lagDays" to it.lagDays,
                )
            },
        )
    }

    private fun releaseRecord(release: Release, write: Boolean): Map<String, Any?> = linkedMapOf(
        "id" to "release:${release.id}",
        "entityId" to release.id,
        "entityKind" to "release",
        "title" to release.name,
        "start" to release.plannedStart,
        "end" to release.plannedEnd,
        "deadline" to release.deadline,
        "readonly" to !write,
    )

    private fun taskRecord(task: PlanningRow, write: Boolean, names: Map<String, String>): Map<String, Any?> =
        linkedMapOf<String, Any?>(
            "id" to "task:${task.id}",
            "entityId" to task.id,
            "entityKind" to "task",
            "title" to "${task.displayId} ${task.title}",
            "start" to task.plannedStart,
            "end" to task.plannedEnd,
            "deadline" to task.due,
            "readonly" to (!write || task.result == "accepted"),
        ).apply {
            val parent = task.parentId?.let { "task:$it" } ?: task.effectiveReleaseId?.let { "release:$it" }
            if (parent != null) put("parentId", parent)
            put("status", if (task.result == "accepted") "done" else task.status)
            // Calendar cards show the same facts as board cards.
            put(
                "card",
                linkedMapOf(
                    "key" to task.displayId,
                    "name" to task.title,
                    "type" to task.type,
                    "priority" to task.priority,
                    "owner" to ownerLabel(task, names),
                ),
            )
        }

    private fun milestoneRecord(milestone: Milestone, write: Boolean): Map<String, Any?> = linkedMapOf<String, Any?>(
        "id" to "milestone:${milestone.id}",
        "entityId" to milestone.id,
        "entityKind" to "milestone",
        "title" to milestone.title,
        "start" to milestone.date,
        "end" to milestone.date,
        "deadline" to null,
        "readonly" to !write,
        "releaseId" to milestone.releaseId,
    ).apply { milestone.releaseId?.let { put("parentId", "release:$it") } }

    private fun orderedRows(
        rows: List<PlanningRow>,
        filters: ViewFiltering,
        matched: Set<String>,
        collapsed: List<String>,
    ): List<Pair<PlanningRow, Int>> {
        val byId = rows.associateBy(PlanningRow::id)
        val include = LinkedHashSet(matched)
        for (id in matched) {
            var parent = byId[id]?.parentId
            val visited = HashSet<String>()
            while (parent != null && parent in byId && visited.add(parent)) {
                include += parent
                parent = byId.getValue(parent).parentId
            }
        }
        val order = when (filters.sort.wire) {
            "priority" -> compareBy<PlanningRow> { PRIORITIES.indexOf(it.priority) }
            "date" -> Comparator { a, b -> ViewOrder.text(a.due ?: "9999", b.due ?: "9999") }
            else -> compareBy(PlanningRow::rank)
        }.then { a, b -> ViewOrder.natural(a.displayId, b.displayId) }.then { a, b -> ViewOrder.text(a.id, b.id) }
        val children = LinkedHashMap<String, MutableList<PlanningRow>>()
        for (row in rows.filter { it.id in include }.sortedWith(order)) {
            val parent = row.parentId?.takeIf { it in include } ?: ""
            children.getOrPut(parent, ::ArrayList) += row
        }
        val filtering = filters.query.isNotEmpty() || filters.preparation.wire != "all" || filters.owner.isNotEmpty() ||
            filters.tagIds.isNotEmpty()
        val folded = collapsed.toSet()
        val result = ArrayList<Pair<PlanningRow, Int>>()
        val stack = ArrayDeque(children[""].orEmpty().reversed().map { it to 0 })
        while (stack.isNotEmpty()) {
            val (row, depth) = stack.removeLast()
            requireCondition(
                depth <= TaskRules.MAX_DEPTH,
                422,
                "HIERARCHY_DEPTH",
                "Иерархия глубже 100 уровней не поддерживается.",
            )
            result += row to depth
            if (filtering || row.id !in folded) {
                children[row.id].orEmpty().reversed().forEach { stack.addLast(it to depth + 1) }
            }
        }
        return result
    }

    private companion object {
        const val GROUP_PAGE = 100
        const val ROW_PAGE = 200
        const val OPTION_PAGE = 50
        const val RELEASE_PAGE = 100
        const val CONSTRAINT_LIMIT = 10_000
    }
}
