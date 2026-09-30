package com.sprintique.workspace.application

import com.sprintique.command.AuditTrail
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.util.UUID

/** Workspaces and projects: only people create them, and the creator becomes their administrator. */
object Workspaces {
    fun create(tx: Transaction, actor: Actor, name: String, timezone: String): Map<String, Any> {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", "Пространство создаёт человек.")
        ProjectAccess.requireInteractive(actor)
        val id = UUID.randomUUID().toString()
        tx.update(
            "INSERT INTO app.workspaces(id, name, created_by, timezone) VALUES ($1, $2, $3, $4)",
            id,
            name,
            actor.id,
            timezone,
        )
        tx.update(
            "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1, $2, 'admin')",
            id,
            actor.id,
        )
        return linkedMapOf("id" to id, "name" to name, "timezone" to timezone)
    }

    fun list(tx: Transaction, actor: Actor): List<Row> = tx.rows(
        """
        SELECT w.id, w.name, m.role FROM app.workspaces w
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
        lockAsAdministrator(tx, actor, input.workspaceId)
        val admin = tx.row(
            """
            SELECT 1 AS admin FROM app.workspace_members WHERE workspace_id = $1 AND principal_id = $2 AND role = 'admin'
            """.trimIndent(),
            input.workspaceId,
            actor.id,
        )
        requireCondition(admin != null, 403, "FORBIDDEN", "Нужны права администратора пространства.")
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
        tx.update(
            "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, 'admin')",
            id,
            actor.id,
        )
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
            SELECT w.id, w.name, w.timezone, w.revision, m.role FROM app.workspaces w
            JOIN app.workspace_members m ON m.workspace_id = w.id AND m.principal_id = $2 WHERE w.id = $1
            """.trimIndent(),
            id,
            actor.id,
        )
        return requirePresent(row, 404, "NOT_FOUND", "Пространство недоступно.")
    }

    /** Locks the workspace row, revalidates the credential and requires the administrator role after the wait. */
    fun lockAsAdministrator(tx: Transaction, actor: Actor, id: String): Row {
        ProjectAccess.requireInteractive(actor)
        profile(tx, actor, id)
        tx.update("SELECT id FROM app.workspaces WHERE id = $1 FOR UPDATE", id)
        ProjectAccess.requireActiveCredential(tx, actor)
        val workspace = profile(tx, actor, id)
        requireCondition(
            workspace.string("role") == "admin",
            403,
            "FORBIDDEN",
            "Нужны права администратора пространства.",
        )
        return workspace
    }
}
