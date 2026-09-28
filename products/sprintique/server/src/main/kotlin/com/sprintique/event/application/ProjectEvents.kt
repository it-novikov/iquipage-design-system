package com.sprintique.event.application

import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import tools.jackson.databind.json.JsonMapper
import java.util.Base64

/** A page of project events after a cursor. */
data class EventPage(val items: List<Map<String, Any?>>, val cursor: String?, val hasMore: Boolean)

/**
 * The committed outbox of a project as a durable, commit-ordered feed. Each reader sees only the topics its rights
 * cover; the feed carries identifiers and revisions, never content.
 */
object ProjectEvents {
    private const val PAGE = 100
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
    private val json = JsonMapper.builder().build()

    private fun authorize(tx: Transaction, actor: Actor, projectId: String) {
        val capability = when {
            actor.mayRead(Capability.TASKS_READ) -> Capability.TASKS_READ
            actor.mayRead(Capability.THREADS_READ) -> Capability.THREADS_READ
            else -> Capability.MAPS_READ
        }
        ProjectAccess.authorize(tx, actor, projectId, capability)
    }

    /** The position to subscribe from, read before a snapshot so a commit during its loading is caught up. */
    fun head(tx: Transaction, actor: Actor, projectId: String): Map<String, String> {
        authorize(tx, actor, projectId)
        val row = tx.row("SELECT event_sequence AS position FROM app.projects WHERE id = $1", projectId)
        val position = requirePresent(row, 404, "NOT_FOUND", "Проект недоступен.").long("position")
        return mapOf("cursor" to cursor(projectId, position))
    }

    fun page(tx: Transaction, actor: Actor, projectId: String, cursor: String?): EventPage {
        authorize(tx, actor, projectId)
        val after = positionOf(cursor, projectId)
        val rows = tx.rows(
            """
            SELECT o.id, o.topic, a.resource_id AS "resourceId", a.revision, a.actor_id AS "actorId",
                   a.initiator_id AS "initiatorId", a.operation_id AS "operationId", a.correlation_id AS "correlationId",
                   a.causation_id AS "causationId", o.project_sequence AS position
            FROM app.outbox o JOIN app.audit_events a ON a.id = o.id
            WHERE o.project_id = $1 AND o.project_sequence > $2
              AND ($3::boolean OR o.topic NOT LIKE 'thread.%')
              AND ($4::boolean OR o.topic NOT LIKE 'agent.%')
              AND ((o.topic LIKE 'thread.%' AND $3::boolean)
                OR ((o.topic LIKE 'map.%' OR o.topic LIKE 'map-template.%') AND $7::boolean)
                OR (o.topic LIKE 'asset.%' AND EXISTS (SELECT 1 FROM app.assets f WHERE f.project_id = $1 AND f.id = a.resource_id
                      AND CASE WHEN f.target_type = 'map' THEN $7::boolean ELSE $6::boolean END))
                OR (o.topic NOT LIKE 'thread.%' AND o.topic NOT LIKE 'map.%' AND o.topic NOT LIKE 'map-template.%'
                      AND o.topic NOT LIKE 'asset.%' AND $6::boolean))
              AND ($4::boolean OR o.topic NOT LIKE 'approval.%'
                OR a.resource_id IN (SELECT id::text FROM app.approvals WHERE project_id = $1 AND requested_by = $5))
            ORDER BY o.project_sequence LIMIT $8
            """.trimIndent(),
            projectId,
            after,
            actor.mayRead(Capability.THREADS_READ),
            actor.isHuman,
            actor.id,
            actor.mayRead(Capability.TASKS_READ),
            actor.mayRead(Capability.MAPS_READ),
            PAGE + 1,
        )
        val items = rows.take(PAGE).map { row ->
            LinkedHashMap<String, Any?>(row.without("position")).apply {
                put("cursor", cursor(projectId, row.long("position")))
            }
        }
        val last = items.lastOrNull()?.get("cursor") as String?
        return EventPage(items, last ?: cursor, rows.size > PAGE)
    }

    private fun cursor(projectId: String, position: Long): String =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString(json.writeValueAsBytes(linkedMapOf("projectId" to projectId, "position" to position)))

    private fun positionOf(cursor: String?, projectId: String): Long {
        if (cursor.isNullOrEmpty()) return 0
        val value = try {
            json.readTree(Base64.getUrlDecoder().decode(cursor))
        } catch (@Suppress("TooGenericExceptionCaught", "SwallowedException") _: RuntimeException) {
            throw ProblemException(400, "CURSOR_INVALID", "Некорректная позиция событий.")
        }
        val position = value.path("position")
        requireCondition(
            value.path("projectId").let { it.isString && it.asString() == projectId } &&
                position.isIntegralNumber && position.asLong() in 0..MAX_SAFE_INTEGER,
            400,
            "CURSOR_INVALID",
            "Позиция относится к другому проекту.",
        )
        return position.asLong()
    }
}
