package com.sprintique.workspace.application

import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.access.domain.Permission
import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ServiceAccounts
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import java.util.UUID

/** Project and workspace profiles: names, time zones, catalogs of projects and members. */
object ProjectProfiles {
    fun project(tx: Transaction, actor: Actor, projectId: String): Row? {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return tx.row(
            """
            SELECT id, name, slug, key, profile_revision AS revision FROM app.projects WHERE id = $1
            """.trimIndent(),
            projectId,
        )
    }

    data class ProjectChange(val baseRevision: Long, val name: String)

    fun changeProject(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        input: ProjectChange,
        key: String,
        ledger: CommandLedger,
    ): Any {
        Membership.manageProject(tx, actor, projectId, Capability.PROJECT_SETTINGS)
        return ledger.idempotent(tx, actor, projectId, "project.profile", key, input) {
            val current = project(tx, actor, projectId)
            requireCondition(
                current?.long("revision") == input.baseRevision,
                409,
                "CONFLICT",
                "Настройки проекта уже изменены.",
            )
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
        WorkspaceAccess.lock(tx, actor, id, Permission.WORKSPACE_SETTINGS)
        val current = Workspaces.profile(tx, actor, id)
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

    /** All projects for those who oversee the workspace's projects, own projects for other members. Names only. */
    fun workspaceProjects(tx: Transaction, actor: Actor, id: String): List<Row> {
        Workspaces.profile(tx, actor, id)
        val rows = tx.rows("SELECT id, name, slug, key, members, role FROM auth.workspace_projects($1)", id)
        requireCondition(rows.size <= CATALOG_LIMIT, 409, "CATALOG_LIMIT", "Каталог достиг лимита.")
        return rows
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
