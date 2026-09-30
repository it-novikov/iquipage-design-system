package com.sprintique.map.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.map.contract.PutMapTemplateRequest
import com.sprintique.problem.requireCondition
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** Map templates of a workspace: personal, project or workspace-wide. They never reference private files or tasks. */
@Component
@Profile("api")
class MapTemplates(private val json: JsonMapper, private val ledger: CommandLedger) {
    fun list(tx: Transaction, actor: Actor, projectId: String): List<JsonNode> {
        val workspaceId = ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_READ).workspaceId
        val rows = tx.rows(
            """
            SELECT value || jsonb_build_object('schema', 'iquipage.template/1', 'id', id, 'projectId', project_id,
                     'workspaceId', workspace_id, 'ownerId', owner_id, 'revision', revision, 'version', revision,
                     'category', 'Мои шаблоны', 'flow', NULL, 'createdAt', created_at, 'updatedAt', updated_at) AS value
            FROM app.map_templates WHERE workspace_id = $1 AND (project_id = $2 OR scope = 'workspace') ORDER BY id LIMIT $3
            """.trimIndent(),
            workspaceId,
            projectId,
            LIMIT + 1,
        )
        requireCondition(rows.size <= LIMIT, 422, "TEMPLATE_LIMIT", "Превышен лимит библиотеки шаблонов.")
        return rows.map { it.json("value")!! }
    }

    fun write(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        input: PutMapTemplateRequest,
        key: String,
    ): Any {
        MapLock.take(tx, actor, projectId)
        val workspaceId = ProjectAccess.authorize(tx, actor, projectId, Capability.MAPS_WRITE).workspaceId
        return ledger.idempotent(tx, actor, projectId, "map-template.put:$id", key, input) {
            val previous = tx.row(
                """SELECT revision, owner_id AS "ownerId" FROM app.map_templates WHERE project_id = $1 AND id = $2""",
                projectId,
                id,
            )
            requireCondition(
                (previous?.long("revision") ?: 0L) == input.baseRevision,
                409,
                "CONFLICT",
                "Шаблон уже изменён.",
            )
            requireCondition(
                previous == null || previous.string("ownerId") == actor.id,
                403,
                "TEMPLATE_OWNER",
                "Изменять шаблон может его автор.",
            )
            if (input.value.scope.wire == "workspace") {
                val admin = tx.row(
                    """
                    SELECT 1 AS found WHERE auth.can_workspace_do($1::uuid, 'workspace.settings') AND $2 = auth.actor_id()
                    """.trimIndent(),
                    workspaceId,
                    actor.id,
                )
                requireCondition(
                    actor.isHuman && admin != null,
                    403,
                    "WORKSPACE_ADMIN",
                    "Публикация для пространства требует его администратора.",
                )
            }
            val count = tx.row(
                "SELECT count(*)::int AS n FROM app.map_templates WHERE workspace_id = $1",
                workspaceId,
            )!!.int("n")
            requireCondition(
                previous != null || count < LIMIT,
                422,
                "TEMPLATE_LIMIT",
                "В библиотеке может быть до 200 шаблонов.",
            )
            requireCondition(
                input.value.document.objects.none { it.assetId != null || it.externalTaskId != null },
                422,
                "TEMPLATE_REFERENCE",
                "Шаблон должен быть независимым от приватных файлов и задач.",
            )
            val revision = input.baseRevision + 1
            val value = json.valueToTree<JsonNode>(input.value)
            tx.update(
                """
                INSERT INTO app.map_templates(project_id, id, workspace_id, owner_id, scope, revision, value)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT(project_id, id) DO UPDATE SET scope = $5, revision = $6, value = $7, updated_at = clock_timestamp()
                """.trimIndent(),
                projectId,
                id,
                workspaceId,
                actor.id,
                input.value.scope.wire,
                revision,
                value,
            )
            tx.update(
                """
                INSERT INTO app.map_template_versions(project_id, id, revision, value, actor_id)
                VALUES ($1, $2, $3, $4, $5)
                """.trimIndent(),
                projectId,
                id,
                revision,
                value,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "map-template.updated", id, revision)
            list(tx, actor, projectId).first {
                it.path("id").asString() == id &&
                    it.path("projectId").asString() == projectId
            }
        }
    }

    private companion object {
        const val LIMIT = 200
    }
}
