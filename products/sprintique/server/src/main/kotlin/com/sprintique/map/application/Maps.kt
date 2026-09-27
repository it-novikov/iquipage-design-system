package com.sprintique.map.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.map.contract.PutMapRequest
import com.sprintique.media.application.Assets
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
import java.time.Instant
import kotlin.math.ceil

/**
 * Idea maps: whiteboards that are permanent or run as a timed session with votes. Every save is a new version; an
 * archived map never changes again.
 */
@Component
@Profile("api")
class Maps(private val json: JsonMapper, private val ledger: CommandLedger) {
    fun read(tx: Transaction, actor: Actor, projectId: String, id: String): ObjectNode {
        ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_READ)
        val row = requirePresent(stored(tx, projectId, id), 404, "NOT_FOUND", "Карта недоступна.")
        return present(tx, actor, row)
    }

    fun list(tx: Transaction, actor: Actor, projectId: String, cursor: String?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_READ)
        val rows = tx.rows(
            """
            SELECT id, project_id AS "projectId", revision, value->>'title' AS title, value->>'kind' AS kind,
                   value->>'status' AS status, left(value->>'summary', 180) AS summary, updated_at AS "updatedAt"
            FROM app.maps WHERE project_id = $1 AND id > $2 ORDER BY id LIMIT $3
            """.trimIndent(),
            projectId,
            cursor.orEmpty(),
            PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(PAGE),
            "nextCursor" to if (rows.size > PAGE) rows[PAGE - 1].string("id") else null,
        )
    }

    fun history(tx: Transaction, actor: Actor, projectId: String, id: String, before: Long?): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_READ)
        read(tx, actor, projectId, id)
        val rows = tx.rows(
            """
            SELECT revision, actor_id AS "actorId", created_at AS "createdAt", value->>'title' AS title FROM app.map_versions
            WHERE project_id = $1 AND id = $2 AND revision < $3 ORDER BY revision DESC LIMIT $4
            """.trimIndent(),
            projectId,
            id,
            minOf(before ?: Long.MAX_VALUE, Int.MAX_VALUE.toLong()),
            PAGE + 1,
        )
        return mapOf(
            "items" to rows.take(PAGE),
            "nextCursor" to if (rows.size > PAGE) rows[PAGE - 1].int("revision") else null,
        )
    }

    fun version(tx: Transaction, actor: Actor, projectId: String, id: String, revision: Long): JsonNode {
        ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_READ)
        val row = tx.row(
            "SELECT value FROM app.map_versions WHERE project_id = $1 AND id = $2 AND revision = $3",
            projectId,
            id,
            revision,
        )
        return requirePresent(row, 404, "NOT_FOUND", "Версия карты недоступна.").json("value")!!
    }

    fun write(tx: Transaction, actor: Actor, projectId: String, id: String, input: PutMapRequest, key: String): Any {
        MapLock.take(tx, actor, projectId)
        return ledger.idempotent(tx, actor, projectId, "map.put:$id", key, input) {
            val previous = stored(tx, projectId, id)
            requireCondition(
                (previous?.long("revision") ?: 0L) == input.baseRevision,
                409,
                "CONFLICT",
                "Карта изменилась. Ваша копия не перезаписана.",
            )
            val value = json.valueToTree<JsonNode>(input.value) as ObjectNode
            val before = previous?.json("value")
            MapTransitions.check(before, value)
            if (before == null) checkNewMap(tx, actor, projectId, value)
            checkTaskReferences(tx, actor, projectId, input)
            Assets.linkMapAssets(tx, actor, projectId, id, input.value.document.objects.mapNotNull { it.assetId })
            keepAuthors(before, value, actor)
            requireCondition(
                input.value.session != null || (input.votes == null && input.timer == null),
                422,
                "MAP_SESSION",
                "Таймер и голоса доступны только в сессии.",
            )
            val voteLimit = before?.path("session")?.path("voteLimit")
            if (voteLimit != null && voteLimit.isNumber && input.value.session != null) {
                requireCondition(
                    input.value.session.voteLimit == voteLimit.asInt(),
                    422,
                    "VOTE_LIMIT_IMMUTABLE",
                    "Лимит голосов задаётся при создании сессии.",
                )
            }
            val revision = input.baseRevision + 1
            val document = value.get("document") as ObjectNode
            document.put("title", input.value.title)
            document.put("revision", revision)
            save(tx, actor, projectId, id, revision, value, timer(tx, previous, input))
            input.votes?.let { saveVotes(tx, actor, projectId, id, it, before, input) }
            // Removing a note removes its votes, never redistributes them to another note or participant.
            tx.update(
                """
                UPDATE app.map_votes SET votes = coalesce((SELECT jsonb_object_agg(key, value) FROM jsonb_each(votes)
                  WHERE key = ANY($3)), '{}'::jsonb) WHERE project_id = $1 AND map_id = $2
                """.trimIndent(),
                projectId,
                id,
                stickies(value),
            )
            val saved = read(tx, actor, projectId, id)
            val snapshot = saved.deepCopy()
            (snapshot.get("session") as? ObjectNode)?.remove("votes")
            tx.update(
                "INSERT INTO app.map_versions(project_id, id, revision, value, actor_id) VALUES ($1, $2, $3, $4, $5)",
                projectId,
                id,
                revision,
                snapshot,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "map.updated", id, revision)
            saved
        }
    }

    private fun checkNewMap(tx: Transaction, actor: Actor, projectId: String, value: JsonNode) {
        val count = tx.row("SELECT count(*)::int AS n FROM app.maps WHERE project_id = $1", projectId)!!.int("n")
        requireCondition(count < MAP_LIMIT, 422, "MAP_LIMIT", "В проекте может быть до 1000 карт.")
        val source = value.path("sourceMapId")
        if (source.isString) {
            val map = read(tx, actor, projectId, source.asString())
            requireCondition(
                map.path("revision").asLong() == value.path("sourceRevision").asLong(-1),
                409,
                "SOURCE_STALE",
                "Исходная карта изменилась.",
            )
        } else {
            requireCondition(value.path("sourceRevision").isNull, 422, "MAP_ORIGIN", "Не задан источник карты.")
        }
    }

    private fun checkTaskReferences(tx: Transaction, actor: Actor, projectId: String, input: PutMapRequest) {
        val taskIds = input.value.document.objects.mapNotNull { it.externalTaskId }.distinct()
        if (taskIds.isEmpty()) return
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val found = tx.rows("SELECT id FROM app.tasks WHERE project_id = $1 AND id = ANY($2)", projectId, taskIds)
        requireCondition(found.size == taskIds.size, 422, "TASK_REFERENCE", "Одна из связанных задач недоступна.")
    }

    /** Each object keeps the author it had; a new object is authored by the writer. */
    private fun keepAuthors(before: JsonNode?, value: ObjectNode, actor: Actor) {
        val authors = before?.path("document")?.path("objects")?.values().orEmpty()
            .associate { it.path("id").asString() to it.path("author") }
        for (item in value.path("document").path("objects").values()) {
            val author = authors[item.path("id").asString()]?.takeIf { it.isString && it.asString().isNotEmpty() }
            (item as ObjectNode).put("author", author?.asString() ?: actor.name.take(AUTHOR_LIMIT))
        }
    }

    private data class Timer(val remaining: Int, val endsAt: Instant?, val clock: Instant)

    /** A running timer is stored as its end; pausing keeps what was left, archiving clears it. */
    private fun timer(tx: Transaction, previous: Row?, input: PutMapRequest): Timer {
        val clock = tx.row("SELECT clock_timestamp() AS now")!!.instant("now")
        var remaining = previous?.int("timerRemaining") ?: DEFAULT_TIMER
        var endsAt = previous?.instantOrNull("timerEndsAt")
        val status = input.value.status.wire
        input.timer?.let { timer ->
            requireCondition(
                !timer.running || status == "active",
                422,
                "TIMER_STATE",
                "Таймер запускается только в активной сессии.",
            )
            remaining = timer.remaining
            endsAt = if (timer.running) clock.plusSeconds(remaining.toLong()) else null
        }
        if (status == "paused") {
            val end = previous?.instantOrNull("timerEndsAt")
            if (end != null) remaining = maxOf(0, ceil((end.toEpochMilli() - clock.toEpochMilli()) / MILLIS).toInt())
            endsAt = null
        }
        if (status == "archived") {
            remaining = 0
            endsAt = null
        }
        return Timer(remaining, endsAt, clock)
    }

    @Suppress("LongParameterList")
    private fun save(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        revision: Long,
        value: JsonNode,
        timer: Timer,
    ) {
        tx.update(
            """
            INSERT INTO app.maps(project_id, id, revision, value, timer_remaining, timer_ends_at, created_by, created_at, updated_at,
                                 started_at, archived_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NULL, NULL)
            ON CONFLICT(project_id, id) DO UPDATE SET revision = $3, value = $4, timer_remaining = $5, timer_ends_at = $6,
              updated_at = $8,
              started_at = CASE WHEN app.maps.value->>'status' = 'draft' AND $9 = 'active' THEN $8 ELSE app.maps.started_at END,
              archived_at = CASE WHEN $9 = 'archived' THEN $8::timestamptz ELSE NULL END
            """.trimIndent(),
            projectId,
            id,
            revision,
            value,
            timer.remaining,
            timer.endsAt,
            actor.id,
            timer.clock,
            value.path("status").asString(),
        )
    }

    @Suppress("LongParameterList")
    private fun saveVotes(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        requested: Map<String, Int>,
        before: JsonNode?,
        input: PutMapRequest,
    ) {
        val candidates = input.value.document.objects.filter { it.type.wire == "sticky" }.mapTo(HashSet()) { it.id }
        val removed = before?.path("document")?.path("objects")?.values().orEmpty()
            .filter { it.path("type").asString() == "sticky" && it.path("id").asString() !in candidates }
            .mapTo(HashSet()) { it.path("id").asString() }
        val votes = requested.filterKeys { it !in removed }
        requireCondition(
            votes.all { (objectId, count) -> count == 0 || objectId in candidates } &&
                votes.values.sum() <= input.value.session!!.voteLimit,
            422,
            "VOTES",
            "Проверьте объекты и лимит голосов.",
        )
        val own = votesOf(tx, projectId, id).firstOrNull { it.string("actorId") == actor.id }?.json("votes")
        requireCondition(
            actor.isHuman ||
                CommandLedger.canonical(json.valueToTree(votes)) ==
                CommandLedger.canonical(own ?: json.createObjectNode()),
            403,
            "HUMAN_VOTES",
            "Агент не голосует от лица человека.",
        )
        tx.update(
            """
            INSERT INTO app.map_votes(project_id, map_id, actor_id, votes) VALUES ($1, $2, $3, $4)
            ON CONFLICT(project_id, map_id, actor_id) DO UPDATE SET votes = $4
            """.trimIndent(),
            projectId,
            id,
            actor.id,
            votes,
        )
    }

    private fun stickies(value: JsonNode) =
        value.path("document").path("objects").values().filter { it.path("type").asString() == "sticky" }
            .map { it.path("id").asString() }

    private fun stored(tx: Transaction, projectId: String, id: String): Row? = tx.row(
        """
        SELECT id, project_id AS "projectId", revision, value, timer_remaining AS "timerRemaining",
               timer_ends_at AS "timerEndsAt", created_at AS "createdAt", updated_at AS "updatedAt",
               started_at AS "startedAt", archived_at AS "archivedAt"
        FROM app.maps WHERE project_id = $1 AND id = $2
        """.trimIndent(),
        projectId,
        id,
    )

    private fun votesOf(tx: Transaction, projectId: String, id: String) = tx.rows(
        """SELECT actor_id AS "actorId", votes FROM app.map_votes WHERE project_id = $1 AND map_id = $2""",
        projectId,
        id,
    )

    /** The map as clients read it: its value, its metadata, the document's title and revision, and session state. */
    private fun present(tx: Transaction, actor: Actor, row: Row): ObjectNode {
        val value = row.json("value")!!
        val result = value.deepCopy() as ObjectNode
        for (name in listOf("id", "projectId", "revision", "createdAt", "updatedAt", "startedAt", "archivedAt")) {
            result.set(name, json.valueToTree(row[name]))
        }
        result.put("schema", "iquipage.maps/1")
        val document = value.path("document").deepCopy() as ObjectNode
        document.set("title", value.path("title"))
        document.put("revision", row.long("revision"))
        result.set("document", document)
        val session = value.path("session")
        if (session.isObject) {
            val state = session.deepCopy() as ObjectNode
            state.set(
                "timer",
                json.valueToTree(
                    mapOf(
                        "remaining" to row.int("timerRemaining"),
                        "endsAt" to row.instantOrNull("timerEndsAt"),
                    ),
                ),
            )
            val votes = votesOf(tx, row.string("projectId"), row.string("id"))
            val totals = LinkedHashMap<String, Int>()
            for (vote in votes) {
                vote.json("votes")!!.properties().forEach { (objectId, count) ->
                    totals.merge(objectId, count.asInt(), Int::plus)
                }
            }
            state.set(
                "votes",
                votes.firstOrNull { it.string("actorId") == actor.id }?.json("votes") ?: json.createObjectNode(),
            )
            state.set("voteTotals", json.valueToTree(totals))
            result.set("session", state)
        } else {
            result.putNull("session")
        }
        return result
    }

    private companion object {
        const val PAGE = 50
        const val MAP_LIMIT = 1000
        const val AUTHOR_LIMIT = 100
        const val DEFAULT_TIMER = 300
        const val MILLIS = 1000.0
    }
}

/** How a map may change between versions: its kind, its status transitions and its origin. */
internal object MapTransitions {
    private val SESSION = mapOf(
        "draft" to setOf("draft", "active"),
        "active" to setOf("active", "paused", "archived"),
        "paused" to setOf("paused", "active", "archived"),
    )
    private val PERMANENT = mapOf("active" to setOf("active", "archived"))

    fun check(before: JsonNode?, value: JsonNode) {
        requireCondition(
            before?.path("status")?.asString() != "archived",
            409,
            "ARCHIVED",
            "Архив неизменяем. Создайте продолжение карты.",
        )
        val kind = value.path("kind").asString()
        requireCondition(
            before == null || before.path("kind").asString() == kind,
            422,
            "MAP_KIND",
            "Формат существующей карты нельзя изменить.",
        )
        val status = value.path("status").asString()
        val allowed = if (before == null) {
            status == if (kind == "session") "draft" else "active"
        } else {
            status in (if (kind == "session") SESSION else PERMANENT)[before.path("status").asString()].orEmpty()
        }
        requireCondition(allowed, 422, "MAP_TRANSITION", "Недопустимый переход состояния карты.")
        requireCondition(
            before == null || (
                before.path("sourceMapId") == value.path("sourceMapId") &&
                    before.path("sourceRevision").asLong(-1) == value.path("sourceRevision").asLong(-1) &&
                    CommandLedger.canonical(before.path("templateOrigin")) ==
                    CommandLedger.canonical(value.path("templateOrigin"))
                ),
            422,
            "MAP_ORIGIN",
            "Источник карты неизменяем.",
        )
    }
}

/** Maps and templates take the project row, as membership changes and planning commands do. */
internal object MapLock {
    fun take(tx: Transaction, actor: Actor, projectId: String) {
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.MAPS_WRITE)
    }
}
