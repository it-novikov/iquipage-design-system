package com.sprintique.work.application

import com.sprintique.access.domain.Permission
import com.sprintique.ai.application.TaskAgents
import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.command.Receipt
import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.task.application.Tasks
import com.sprintique.work.application.WorkStep
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
import java.time.Instant
import java.util.UUID

/** Task work owns only its aggregate and projections; execution and credentials stay in their existing modules. */
@Component
@Profile("api")
class TaskWork(
    internal val json: JsonMapper,
    internal val ledger: CommandLedger,
    internal val flags: FeatureFlags,
    internal val agents: TaskAgents,
) {
    fun read(tx: Transaction, actor: Actor, project: String, reference: String): Map<String, Any?> {
        flags.require(Feature.AGENT_WORK)
        val access = ProjectAccess.authorize(tx, actor, project, Capability.TASKS_READ)
        val task = Tasks.read(tx, project, reference)
        val id = task.string("id")
        val row = plan(tx, project, id)
        val document = row?.json("document")?.deepCopy() as? ObjectNode
        document?.put("revision", row.long("revision"))
        document?.put("taskId", id)
        document?.set("lease", json.valueToTree(leaseView(row)))
        val human = actor.isHuman && actor.isInteractive
        val permissions = mapOf(
            "canEdit" to (Permission.WORK_WRITE in access.permissions && actor.mayChange),
            "canAssign" to
                (human && Permission.TASKS_WRITE in access.permissions && Permission.WORK_WRITE in access.permissions),
            "canDecide" to (human && Permission.APPROVALS_DECIDE in access.permissions),
            "canAnswer" to
                (
                    human && Permission.APPROVALS_DECIDE in access.permissions &&
                        Permission.THREADS_WRITE in access.permissions
                    ),
            "canStop" to (human && Permission.TASKS_WRITE in access.permissions),
        )
        return linkedMapOf(
            "schema" to "bridge/1", "revision" to (row?.long("revision") ?: 0L), "workPlan" to document,
            "sessions" to sessions(tx, actor, project, id), "requests" to requests(tx, project, id),
            "events" to events(tx, actor, project, id, null, WorkLimits.PAGE_SIZE), "permissions" to permissions,
        )
    }

    fun events(
        tx: Transaction,
        actor: Actor,
        project: String,
        reference: String,
        cursor: String?,
        limit: Int,
    ): Any {
        flags.require(Feature.AGENT_WORK)
        ProjectAccess.authorize(tx, actor, project, Capability.TASKS_READ)
        val task = Tasks.read(tx, project, reference).string("id")
        val size = limit.coerceIn(1, WorkLimits.LIST_LIMIT)
        val rows = tx.rows(
            """
                SELECT e.id,e.kind,e.text,e.detail,e.session_id AS "sessionId",e.thread_id AS "threadId",
                e.actor_id AS "actorId",coalesce(p.profile_name,p.name) AS "actorName",e.created_at AS at
                FROM app.task_work_event e JOIN auth.principals p ON p.id=e.actor_id
                WHERE e.project_id=$1 AND e.task_id=$2 AND ($3::text IS NULL OR
                  (e.created_at,e.id)<(SELECT created_at,id FROM app.task_work_event WHERE project_id=$1 AND
                  task_id=$2 AND id=$3))
                ORDER BY e.created_at DESC,e.id DESC LIMIT $4
            """.trimIndent(),
            project, task, cursor, size + 1,
        )
        return mapOf(
            "items" to rows.take(size),
            "nextCursor" to if (rows.size > size) rows[size - 1].string("id") else null,
        )
    }

    fun catalog(tx: Transaction, actor: Actor, project: String): Any {
        flags.require(Feature.AGENT_WORK)
        val membership = ProjectAccess.authorize(tx, actor, project, Capability.TASKS_READ)
        val rows = tx.rows(
            """
                SELECT a.id,coalesce(a.profile_name,a.name) AS name,coalesce(o.profile_name,o.name) AS "ownerName",
            m.permissions,p.model,p.enabled,p.max_steps AS "maxSteps",p.max_run_tokens AS "maxRunTokens",
            p.runs_per_hour AS "runsPerHour",m.role,c.deleted_at AS "connectionDeleted",p.instructions AS description,
            auth.service_account_active(a.id) AS active,
            (SELECT max(last_used_at) FROM auth.credentials WHERE principal_id=a.id AND revoked_at IS NULL) AS
            "lastActiveAt",
            (SELECT count(*)::int FROM app.task_work_session s WHERE s.project_id=m.project_id AND
            s.agent_id=a.id
              AND s.state IN ('queued','running','waiting','awaiting_agent')) AS working
            FROM app.project_members m JOIN auth.principals a ON a.id=m.principal_id AND a.kind='service'
            JOIN auth.service_accounts sa ON sa.principal_id=a.id AND sa.deleted_at IS NULL
            JOIN auth.principals o ON o.id=sa.owner_id LEFT JOIN app.ai_agent_profiles p ON p.principal_id=a.id
            LEFT JOIN app.ai_connections c ON c.id=p.connection_id WHERE m.project_id=$1 ORDER BY name,a.id
            LIMIT 100
            """,
            project,
        )
        return mapOf(
            "items" to rows.map { row ->
                val api =
                    row["enabled"] == true && row["connectionDeleted"] == null && row.stringOrNull("model") != null
                mapOf(
                    "id" to row.string("id"), "name" to row.string("name"), "ownerName" to row.string("ownerName"),
                    "description" to "Агент сервисного аккаунта проекта.", "model" to row["model"],
                    "role" to row["role"],
                    "limits" to if (api) {
                        mapOf(
                            "maxSteps" to row["maxSteps"], "maxRunTokens" to row["maxRunTokens"],
                            "runsPerHour" to row["runsPerHour"],
                        )
                    } else {
                        null
                    },
                    "modes" to if (api) listOf("external", "provider_api") else listOf("external"),
                    "state" to
                        if (!row.boolean("active")) {
                            "suspended"
                        } else if (row.int("working") > 0) {
                            "working"
                        } else {
                            "available"
                        },
                    "unavailableReason" to
                        if (row.boolean("active")) null else "Аккаунт приостановлен или владелец потерял доступ.",
                    "permissions" to row.strings("permissions"),
                    "skills" to skillsFor(
                        tx,
                        project,
                        row.string("id"),
                    ),
                    "lastActiveAt" to row["lastActiveAt"],
                    "canAssign" to
                        (
                            actor.isHuman && actor.isInteractive && membership.has(Permission.TASKS_WRITE) &&
                                membership.has(Permission.WORK_WRITE) &&
                                row.boolean("active")
                            ),
                )
            },
            "canManage" to (actor.isHuman && actor.isInteractive && membership.has(Permission.AGENTS_MANAGE)),
        )
    }

    fun agent(tx: Transaction, actor: Actor, project: String, id: String): Any {
        val catalog = json.valueToTree<JsonNode>(catalog(tx, actor, project))
        val selected = requirePresent(
            catalog.path("items").values().firstOrNull { it.path("id").asString() == id },
            404, "NOT_FOUND", "Агент недоступен в проекте.",
        )
        val sessions = tx.rows(
            """SELECT s.id,s.task_id AS "taskId",s.mode,coalesce(r.state,s.state) AS state,s.goal,s.summary,
                s.started_at AS "startedAt",coalesce(s.finished_at,r.finished_at) AS "finishedAt"
                FROM app.task_work_session s LEFT JOIN app.ai_agent_runs r ON r.project_id=s.project_id AND r.id=s.ai_run_id
                WHERE s.project_id=$1 AND s.agent_id=$2 ORDER BY s.started_at DESC,s.id LIMIT 50""",
            project, id,
        )
        val events = tx.rows(
            """SELECT e.id,e.task_id AS "taskId",e.text,e.detail,e.created_at AS at FROM app.task_work_event e
                WHERE e.project_id=$1 AND e.actor_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 50""",
            project, id,
        )
        val revision = tx.row(
            "SELECT revision FROM app.agent_work_profile WHERE project_id=$1 AND agent_id=$2", project, id,
        )?.long("revision") ?: 0L
        return mapOf(
            "agent" to selected, "sessions" to sessions, "events" to mapOf("items" to events),
            "skillsRevision" to revision, "canManage" to catalog.path("canManage").asBoolean(),
        )
    }

    @Suppress("LongParameterList")
    internal fun change(
        tx: Transaction,
        actor: Actor,
        project: String,
        reference: String,
        baseRevision: Long,
        operation: String,
        input: Any,
        key: String,
        text: String,
        detail: String = "",
        capability: Capability = Capability.WORK_WRITE,
        effect: (ObjectNode, Row?, String) -> Unit,
    ): Any {
        flags.require(Feature.AGENT_WORK)
        ProjectAccess.authorize(tx, actor, project, capability)
        safe(json.valueToTree(input))
        val task = Tasks.read(tx, project, reference)
        val id = task.string("id")
        val receipt = object : Receipt<Map<String, Any?>> {
            override fun store(value: Map<String, Any?>): Any = mapOf(
                "taskId" to id, "revision" to baseRevision + 1,
                "lease" to (value["workPlan"] as? JsonNode)?.path("lease"),
            )
            override fun restore(record: JsonNode): Any {
                read(tx, actor, project, id)
                val revision = record.path("revision").asLong()
                return mapOf(
                    "schema" to "bridge/1", "revision" to revision, "appliedRevision" to revision,
                    "workPlan" to mapOf("revision" to revision, "lease" to record.path("lease")),
                    "replayed" to true, "requiresReload" to true,
                )
            }
        }
        return ledger.idempotent(tx, actor, project, "work.$operation:$id", key, input, receipt) {
            ProjectAccess.projectWriteFence(tx, actor, project, capability)
            val row = plan(tx, project, id, true)
            requireCondition(
                (row?.long("revision") ?: 0L) == baseRevision,
                409, "CONFLICT", "План изменился. Обновите его перед продолжением.",
            )
            val document = (row?.json("document")?.deepCopy() as? ObjectNode) ?: json.createObjectNode().also {
                it.put("status", "draft")
                it.put("risk", "standard")
                it.putArray("steps")
                it.putArray("criteria")
                it.putArray("questions")
                it.putArray("decisions")
            }
            if (!actor.isHuman) {
                val participation = tx.rows(
                    """
                    SELECT requested_by,state FROM app.task_work_session
                    WHERE project_id=$1 AND task_id=$2 AND agent_id=$3
                    """,
                    project, id, actor.id,
                )
                val active = participation.filter {
                    it.string("state") in setOf("awaiting_agent", "queued", "running", "waiting")
                }
                requireCondition(
                    participation.isEmpty() || active.isNotEmpty(),
                    409, "WORK_SESSION_ENDED", "Работа завершена. Нужно новое поручение человека.",
                )
                active.forEach { requester(tx, it, project) }
            }
            document.remove("importedCard")
            effect(document, row, id)
            requireCondition(
                json.writeValueAsBytes(document).size <= WorkLimits.PLAN_BYTES,
                422, "WORK_PLAN_LIMIT", "План превышает допустимый размер.",
            )
            val bridge =
                document.path("bridgeId").takeIf { it.isString }?.asString() ?: row?.string("bridge_id")
                    ?: java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString().replace("-", "") + "-" +
                    task.string("displayId").lowercase()
            tx.update(
                """
                    INSERT INTO app.task_work_plan(project_id,task_id,revision,document,bridge_id)
                    VALUES($1,$2,1,$3::jsonb,$4)
                ON CONFLICT(project_id,task_id) DO UPDATE SET
                document=excluded.document,revision=app.task_work_plan.revision+1,card=NULL,bridge_id=excluded.bridge_id,updated_at=clock_timestamp()
                """,
                project, id, json.writeValueAsString(document), bridge,
            )
            if (operation ==
                "card.imported"
            ) {
                tx.update(
                    "UPDATE app.task_work_plan SET card=$3 WHERE project_id=$1 AND task_id=$2",
                    project, id, document.path("importedCard").asString(),
                )
            }
            AuditTrail.record(tx, actor, project, "task.work.$operation", id, baseRevision + 1)
            tx.update(
                """
INSERT INTO app.task_work_event(project_id,task_id,id,revision,actor_id,kind,text,detail)
VALUES($1,$2,$3,$4,$5,$6,$7,$8)
""",
                project, id, UUID.randomUUID().toString(),
                baseRevision + 1, actor.id, operation, text, detail.take(WorkLimits.TEXT_LIMIT),
            )
            val result = read(tx, actor, project, id)
            if (operation == "lease.claim") {
                val latest = plan(tx, project, id)!!
                val document = result["workPlan"] as ObjectNode
                document.set("lease", json.valueToTree(leaseView(latest)))
                (document.path("lease") as ObjectNode).put("leaseToken", latest.string("lease_token"))
            }
            result
        }
    }

    internal fun plan(tx: Transaction, project: String, id: String, lock: Boolean = false): Row? = tx.row(
        """
SELECT *,lease_token::text AS lease_token FROM app.task_work_plan WHERE project_id=$1 AND task_id=$2
""" +
            if (lock) " FOR UPDATE" else "",
        project, id,
    )

    internal fun holder(row: Row?, actor: Actor, token: String?) {
        requireCondition(
            row != null && row.stringOrNull("holder_id") == actor.id && token != null &&
                row.stringOrNull("lease_token") == token &&
                row.instantOrNull("lease_until")?.isAfter(Instant.now()) == true,
            409, "WORK_LEASE_LOST", "Аренда плана закончилась или перешла другому участнику.",
        )
    }
    internal fun leaseView(row: Row): Any? = row.stringOrNull("holder_id")?.let {
        mapOf(
            "holderId" to it, "held" to true, "expiresAt" to row["lease_until"],
            "expired" to (row.instantOrNull("lease_until")?.isAfter(Instant.now()) != true),
        )
    }
    internal fun authored(step: WorkStep, actor: Actor): ObjectNode = json.valueToTree<ObjectNode>(step).also {
        it.put("authorId", actor.id)
        it.put("revision", 1)
        it.put("approval", if (actor.isHuman) "unreviewed" else "pending")
    }
    internal fun child(doc: ObjectNode, list: String, id: String): ObjectNode = requirePresent(
        doc.path(list).values().firstOrNull {
            it.path("id").asString() == id
        } as? ObjectNode,
        404, "NOT_FOUND", "Элемент плана недоступен.",
    )
    internal fun unique(
        ids: List<String>,
    ) {
        requireCondition(
            ids.size == ids.distinct().size,
            422, "WORK_DUPLICATE", "Идентификаторы должны быть уникальными.",
        )
    }
    internal fun person(
        actor: Actor,
    ) {
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Решение принимает человек.")
    }
    internal fun account(tx: Transaction, project: String, id: String) {
        requirePresent(
            tx.row(
                """
            SELECT m.principal_id FROM app.project_members m JOIN auth.service_accounts s ON
            s.principal_id=m.principal_id WHERE m.project_id=$1 AND m.principal_id=$2 AND s.deleted_at IS NULL
            AND auth.service_account_active(s.principal_id)
        """,
                project, id,
            ),
            404, "NOT_FOUND", "Агент недоступен в проекте.",
        )
    }
    internal fun thread(tx: Transaction, project: String, task: String, id: String?) {
        if (id !=
            null
        ) {
            requirePresent(
                tx.row(
                    """
                SELECT id FROM app.threads WHERE project_id=$1 AND task_id=$2 AND id=$3
            """,
                    project, task, id,
                ),
                404, "NOT_FOUND", "Обсуждение недоступно.",
            )
        }
    }
    internal fun session(
        tx: Transaction,
        project: String,
        task: String,
        id: String,
    ): Row = requirePresent(
        tx.row(
            """
        SELECT *,ai_run_id::text AS ai_run_id FROM app.task_work_session WHERE project_id=$1 AND task_id=$2
        AND id=$3 FOR UPDATE
    """,
            project, task, id,
        ),
        404, "NOT_FOUND", "Поручение недоступно.",
    )
    internal fun requester(
        tx: Transaction,
        row: Row,
        project: String,
    ) {
        requirePresent(
            tx.row(
                """
            SELECT m.principal_id FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE
            m.project_id=$1 AND m.principal_id=$2 AND p.disabled_at IS NULL AND 'work.write'=ANY(m.permissions)
        """,
                project, row.string("requested_by"),
            ),
            403, "INITIATOR_LOST", "У поручившего работу больше нет права вести план.",
        )
    }
    internal fun skillsFor(
        tx: Transaction,
        project: String,
        id: String,
    ): List<Row> = tx.rows(
        """
        SELECT s.id,s.name,s.version,s.digest,s.required_tools AS "requiredTools" FROM
        app.agent_work_profile p JOIN app.agent_skill_version s ON s.project_id=p.project_id AND
        s.id=ANY(p.skill_ids) WHERE p.project_id=$1 AND p.agent_id=$2 ORDER BY s.name,s.version
    """,
        project, id,
    )
    internal fun requests(
        tx: Transaction,
        project: String,
        task: String,
    ): List<Row> = tx.rows(
        """
        SELECT r.id,r.agent_id AS "agentId",coalesce(a.profile_name,a.name) AS "agentName",
        r.thread_id AS "threadId",r.message_id AS "messageId",r.state,r.session_id AS "sessionId",
        r.created_at AS "createdAt" FROM app.task_work_request r JOIN auth.principals a ON a.id=r.agent_id
        WHERE r.project_id=$1 AND r.task_id=$2 ORDER BY r.created_at DESC,r.id LIMIT 50
    """,
        project, task,
    )
    internal fun sessions(
        tx: Transaction,
        actor: Actor,
        project: String,
        task: String,
    ): List<Map<String, Any?>> = tx.rows(
        """
            SELECT s.id,s.mode,s.agent_id AS "agentId",coalesce(a.profile_name,a.name) AS "agentName",
            coalesce(CASE WHEN s.state NOT IN ('handed_off','cancelled') THEN r.state END,s.state) AS state,
            s.goal,s.summary,s.started_at AS "startedAt",coalesce(s.finished_at,r.finished_at) AS "finishedAt",
            s.thread_id AS "threadId",s.relayed_from AS "relayedFrom",s.skill_snapshot AS skills,
            r.cancel_requested_at IS NOT NULL AS "stopRequested",r.id AS "runId",
            auth.can(s.project_id,'tasks.write') AS "stopAllowed",
            auth.can(s.project_id,'work.write') AS "handoffAllowed"
            FROM app.task_work_session s JOIN auth.principals a ON a.id=s.agent_id
            LEFT JOIN app.ai_agent_runs r ON r.project_id=s.project_id AND r.id=s.ai_run_id
            WHERE s.project_id=$1 AND s.task_id=$2 ORDER BY s.started_at DESC,s.id LIMIT 50
            """,
        project, task,
    ).map {
        LinkedHashMap<String, Any?>(it).apply {
            put(
                "canStop",
                actor.isHuman && actor.isInteractive && it.boolean("stopAllowed") && it.string("state") in ACTIVE,
            )
            put(
                "canHandoff",
                it.string("state") in ACTIVE && it.boolean("handoffAllowed") &&
                    (
                        (actor.isHuman && actor.isInteractive && it.boolean("stopAllowed")) ||
                            it.string("agentId") == actor.id
                        ),
            )
        }
    }
    internal fun safe(node: JsonNode) {
        requireCondition(
            !SECRET.containsMatchIn(node.toString()),
            422, "SECRET_LIKE_CONTENT", "Уберите ключи и токены из сохраняемого текста.",
        )
    }
    companion object {
        internal val ACTIVE = setOf("awaiting_agent", "queued", "running", "waiting")
        private val SECRET =
            Regex(
                "(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|(?:spr|spk)_[A-Za-z0-9_-]{20,}|" +
                    "-----BEGIN [A-Z ]*PRIVATE KEY-----)",
            )
    }
}
