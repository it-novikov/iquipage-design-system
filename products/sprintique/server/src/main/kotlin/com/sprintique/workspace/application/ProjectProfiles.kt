package com.sprintique.workspace.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ServiceAccounts
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.media.application.Assets
import com.sprintique.problem.requireCondition
import java.util.UUID

/** Project and workspace profiles: names, time zones, avatars, catalogs of projects and members. */
object ProjectProfiles {
    fun project(tx: Transaction, actor: Actor, projectId: String): Row? {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return tx.row(
            """
            SELECT id, name, slug, key, profile_revision AS revision, avatar_asset_id AS "avatarAssetId" FROM app.projects WHERE id = $1
            """.trimIndent(),
            projectId,
        )
    }

    data class ProjectChange(val baseRevision: Long, val name: String, val avatarAssetId: String?)

    fun changeProject(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        input: ProjectChange,
        key: String,
        ledger: CommandLedger,
    ): Any {
        Membership.manageProject(tx, actor, projectId)
        return ledger.idempotent(tx, actor, projectId, "project.profile", key, input) {
            val current = project(tx, actor, projectId)
            requireCondition(
                current?.long("revision") == input.baseRevision,
                409,
                "CONFLICT",
                "Настройки проекта уже изменены.",
            )
            Assets.linkProjectAvatar(tx, actor, projectId, input.avatarAssetId)
            tx.update(
                "UPDATE app.projects SET name = $2, profile_revision = profile_revision + 1 WHERE id = $1",
                projectId,
                input.name,
            )
            AuditTrail.record(tx, actor, projectId, "project.updated", projectId, input.baseRevision + 1)
            project(tx, actor, projectId)!!
        }
    }

    data class WorkspaceChange(val baseRevision: Long, val name: String, val timezone: String)

    fun changeWorkspace(tx: Transaction, actor: Actor, id: String, input: WorkspaceChange): Row {
        val current = Workspaces.lockAsAdministrator(tx, actor, id)
        requireCondition(current.long("revision") == input.baseRevision, 409, "CONFLICT", "Пространство уже изменено.")
        tx.update(
            "UPDATE app.workspaces SET name = $2, timezone = $3, revision = revision + 1 WHERE id = $1",
            id,
            input.name,
            input.timezone,
        )
        audit(tx, actor, id, "workspace.updated", id, input.baseRevision + 1)
        return Workspaces.profile(tx, actor, id)
    }

    /** All projects for workspace administrators, own projects for other members. Names only. */
    fun workspaceProjects(tx: Transaction, actor: Actor, id: String): List<Row> {
        Workspaces.profile(tx, actor, id)
        val rows = tx.rows("SELECT id, name, slug, key, members, role FROM auth.workspace_projects($1)", id)
        requireCondition(rows.size <= CATALOG_LIMIT, 409, "CATALOG_LIMIT", "Каталог достиг лимита.")
        return rows
    }

    fun workspaceMembers(tx: Transaction, actor: Actor, id: String): List<Row> {
        Workspaces.lockAsAdministrator(tx, actor, id)
        return tx.rows(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, m.role, m.revision
            FROM app.workspace_members m JOIN auth.principals p ON p.id = m.principal_id
            WHERE m.workspace_id = $1 ORDER BY name, p.id LIMIT 501
            """.trimIndent(),
            id,
        )
    }

    data class WorkspaceMemberChange(val baseRevision: Long, val role: String?)

    fun changeWorkspaceMember(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        input: WorkspaceMemberChange,
    ): Map<String, Any?> {
        Workspaces.lockAsAdministrator(tx, actor, workspaceId)
        val current = tx.row(
            "SELECT role, revision FROM app.workspace_members WHERE workspace_id = $1 AND principal_id = $2",
            workspaceId,
            id,
        )
        requireCondition(current != null, 404, "NOT_FOUND", "Участник недоступен.")
        requireCondition(
            current.long("revision") == input.baseRevision,
            409,
            "CONFLICT",
            "Права участника уже изменены.",
        )
        if (current.string("role") == "admin" && input.role != "admin") {
            val admins = tx.row(
                """
                SELECT count(*)::int AS n FROM app.workspace_members m JOIN auth.principals p ON p.id = m.principal_id
                WHERE workspace_id = $1 AND role = 'admin' AND p.kind = 'human' AND p.disabled_at IS NULL
                """.trimIndent(),
                workspaceId,
            )!!.int("n")
            requireCondition(admins > 1, 409, "LAST_ADMIN", "Сначала назначьте другого администратора.")
        }
        if (input.role == null) {
            requireCondition(
                id != actor.id,
                422,
                "SELF_REMOVAL",
                "Удаление своего доступа выполняет другой администратор.",
            )
            // Workspace roles do not implicitly grant or revoke project roles: no hidden cascading removal.
            val linked = tx.row(
                """
                SELECT 1 AS linked FROM app.project_members m JOIN app.projects p ON p.id = m.project_id
                WHERE p.workspace_id = $1 AND m.principal_id = $2 LIMIT 1
                """.trimIndent(),
                workspaceId, id,
            )
            requireCondition(
                linked == null,
                409,
                "PROJECT_ACCESS_REMAINS",
                "Сначала удалите участника из проектов пространства.",
            )
            tx.update(
                "DELETE FROM app.workspace_members WHERE workspace_id = $1 AND principal_id = $2",
                workspaceId,
                id,
            )
            // The service accounts this person owns in the workspace stop until they get a new owner or are deleted.
            ServiceAccounts.suspendOwnedBy(tx, actor, workspaceId, id)
        } else {
            tx.update(
                """
                UPDATE app.workspace_members SET role = $3, revision = revision + 1 WHERE workspace_id = $1 AND principal_id = $2
                """.trimIndent(),
                workspaceId, id, input.role,
            )
        }
        audit(tx, actor, workspaceId, "workspace.member.updated", id, input.baseRevision + 1)
        return linkedMapOf("id" to id, "role" to input.role, "revision" to input.baseRevision + 1)
    }

    private fun audit(tx: Transaction, actor: Actor, workspaceId: String, action: String, id: String, revision: Long) {
        tx.update(
            """
            INSERT INTO app.workspace_audit(id, workspace_id, actor_id, action, resource_id, revision) VALUES ($1, $2, $3, $4, $5, $6)
            """.trimIndent(),
            UUID.randomUUID().toString(), workspaceId, actor.id, action, id, revision,
        )
    }

    private const val CATALOG_LIMIT = 500
}
