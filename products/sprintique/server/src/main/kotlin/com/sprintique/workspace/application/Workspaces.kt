package com.sprintique.workspace.application

import com.sprintique.access.application.MemberAccess
import com.sprintique.access.application.Presets
import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.SystemPreset
import com.sprintique.command.AuditTrail
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.util.UUID

/**
 * Workspaces and projects: only people create them. The creator of a workspace becomes its owner and the workspace
 * gets its system presets; the creator of a project becomes its administrator (preset Администратор).
 */
object Workspaces {
    fun create(tx: Transaction, actor: Actor, name: String, timezone: String): Map<String, Any> {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", "Пространство создаёт человек.")
        val id = UUID.randomUUID().toString()
        tx.update(
            "INSERT INTO app.workspaces(id, name, created_by, timezone) VALUES ($1, $2, $3, $4)",
            id,
            name,
            actor.id,
            timezone,
        )
        tx.update(
            "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1, $2, 'owner')",
            id,
            actor.id,
        )
        return linkedMapOf("id" to id, "name" to name, "timezone" to timezone)
    }

    fun list(tx: Transaction, actor: Actor): List<Row> = tx.rows(
        """
        SELECT w.id, w.name, m.role, m.permissions FROM app.workspaces w
        JOIN app.workspace_members m ON m.workspace_id = w.id AND m.principal_id = $1 ORDER BY w.name, w.id LIMIT 500
        """.trimIndent(),
        actor.id,
    )

    data class NewProject(
        val workspaceId: String,
        val name: String,
        val slug: String,
        val key: String,
        val timezone: String?,
    )

    fun createProject(tx: Transaction, actor: Actor, input: NewProject): Map<String, Any?> {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", "Проект создаёт человек.")
        WorkspaceAccess.lock(tx, actor, input.workspaceId, Permission.PROJECTS_CREATE)
        val id = UUID.randomUUID().toString()
        tx.update(
            "INSERT INTO app.projects(id, workspace_id, name, slug, key, timezone) VALUES ($1, $2, $3, $4, $5, $6)",
            id,
            input.workspaceId,
            input.name,
            input.slug,
            input.key,
            input.timezone,
        )
        val admin = Presets.system(tx, input.workspaceId, SystemPreset.ADMIN)
        MemberAccess.insertMember(tx, id, input.workspaceId, actor.id, admin.id, actor.id)
        TaskSettings.provision(tx, id, actor.id)
        AuditTrail.record(tx, actor, id, "project.created", id, 1)
        return linkedMapOf(
            "id" to id,
            "workspaceId" to input.workspaceId,
            "name" to input.name,
            "slug" to input.slug,
            "key" to input.key,
            "timezone" to input.timezone,
        )
    }

    /** The caller's view of a workspace; people only. */
    fun profile(tx: Transaction, actor: Actor, id: String): Row {
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Пространством управляет человек.")
        val row = tx.row(
            """
            SELECT w.id, w.name, w.timezone, w.revision, m.role, m.permissions,
                   w.projects_created_by AS "projectsCreatedBy" FROM app.workspaces w
            JOIN app.workspace_members m ON m.workspace_id = w.id AND m.principal_id = $2 WHERE w.id = $1
            """.trimIndent(),
            id,
            actor.id,
        )
        return requirePresent(row, 404, "NOT_FOUND", "Пространство недоступно.")
    }
}
