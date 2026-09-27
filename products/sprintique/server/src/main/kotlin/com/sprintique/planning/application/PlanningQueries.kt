package com.sprintique.planning.application

import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.token.Tokens
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Locale

/** The filters of the planning task list; empty fields do not filter. */
data class PlanningFilters(
    val q: String = "",
    val releaseId: String? = null,
    val unassigned: Boolean = false,
    val parentId: String? = null,
    val preparation: String? = null,
    val status: String? = null,
    val owner: String? = null,
    val tagId: String? = null,
    val board: Boolean = false,
)

/** Read-only planning lists: tasks, constraints, the roadmap and release history. */
@Component
class PlanningQueries(private val json: JsonMapper) {
    fun tasks(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        filters: PlanningFilters,
        limit: Int,
        cursor: String?,
    ): Map<String, Any?> {
        val revision = PlanningStates.lock(tx, actor, projectId).revision
        val query = filters.q.lowercase(Locale.ROOT)
        val rows = PlanningRows.project(PlanningStates.load(tx, projectId)).filter { row ->
            (filters.q.isEmpty() || query in "${row.title} ${row.displayId}".lowercase(Locale.ROOT)) &&
                (filters.releaseId == null || row.effectiveReleaseId == filters.releaseId) &&
                (!filters.unassigned || row.effectiveReleaseId == null) &&
                (filters.parentId == null || row.parentId == filters.parentId) &&
                (filters.preparation == null || row.preparation == filters.preparation) &&
                (filters.status == null || row.status == filters.status) &&
                (filters.owner == null || row.ownerId == filters.owner) &&
                (filters.tagId == null || filters.tagId in row.tagIds) &&
                (!filters.board || row.boardEligible)
        }
        return PlanningJson.page(Pages.page(rows, binding(projectId, "tasks", filters), revision, limit, cursor))
    }

    fun constraints(tx: Transaction, actor: Actor, projectId: String, limit: Int, cursor: String?): Map<String, Any?> {
        val revision = PlanningStates.lock(tx, actor, projectId).revision
        val constraints = PlanningStates.load(tx, projectId).constraints
        return PlanningJson.page(Pages.page(constraints, "$projectId:constraints", revision, limit, cursor))
    }

    /** Dated tasks, releases and milestones within [from]–[to]; undated ones unless [undated] is false. */
    @Suppress("LongParameterList")
    fun roadmap(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        range: RoadmapRange,
        limit: Int,
        cursor: String?,
    ): Map<String, Any?> {
        val lock = PlanningStates.lock(tx, actor, projectId)
        val state = PlanningStates.load(tx, projectId)
        val rows =
            PlanningRows.project(state).map {
                RoadmapItem("task", it.id, it.title, it.revision, it.plannedStart, it.plannedEnd)
            } +
                state.releases.map {
                    RoadmapItem("release", it.id, it.name, it.revision, it.plannedStart, it.plannedEnd)
                } +
                state.milestones.map { RoadmapItem("milestone", it.id, it.title, it.revision, it.date, it.date) }
        val visible = rows.filter { item ->
            if (item.start != null || item.end != null) {
                val last = item.end ?: item.start!!
                val first = item.start ?: item.end!!
                (range.from == null || last >= range.from) && (range.to == null || first <= range.to)
            } else {
                range.undated
            }
        }
        val page = Pages.page(visible, binding(projectId, "roadmap", range), lock.revision, limit, cursor)
        return PlanningJson.page(page) +
            ("timezone" to lock.timezone)
    }

    data class RoadmapRange(val from: String?, val to: String?, val undated: Boolean)

    data class RoadmapItem(
        val kind: String,
        val id: String,
        val title: String,
        val revision: Int,
        val start: String?,
        val end: String?,
    )

    /** Every task of every start, close and cancel of a release, oldest first. */
    fun history(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        releaseId: String,
        limit: Int,
        cursor: String?,
    ): Map<String, Any?> {
        PlanningStates.lock(tx, actor, projectId)
        val snapshots = tx.rows(
            """
            SELECT id, release_id AS "releaseId", kind, operation_id AS "operationId", items, created_at AS "createdAt"
            FROM app.release_snapshots WHERE project_id = $1 AND release_id = $2 ORDER BY created_at, id
            """.trimIndent(),
            projectId,
            releaseId,
        )
        val items = snapshots.flatMap { snapshot ->
            snapshot.json("items")!!.values().map { item ->
                linkedMapOf<String, Any?>(
                    "snapshotId" to snapshot["id"],
                    "kind" to snapshot["kind"],
                    "operationId" to snapshot["operationId"],
                    "createdAt" to snapshot["createdAt"],
                ).apply { item.properties().forEach { (name, value) -> put(name, value) } }
            }
        }
        val page = Pages.page(items, "$projectId:history:$releaseId", snapshots.size.toLong(), limit, cursor)
        return PlanningJson.page(page) + (
            "snapshots" to snapshots.map { snapshot ->
                LinkedHashMap(snapshot.without("items")).apply { put("itemCount", snapshot.json("items")!!.size()) }
            }
            )
    }

    private fun binding(projectId: String, scope: String, filters: Any): String =
        Tokens.sha256Hex("$projectId:$scope:" + CommandLedger.canonical(json.valueToTree<JsonNode>(filters)))
}
