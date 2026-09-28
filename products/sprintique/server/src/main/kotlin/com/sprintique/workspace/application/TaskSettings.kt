package com.sprintique.workspace.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.PlanningStates
import com.sprintique.problem.requireCondition
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * Starter content of a new project: an empty base template and one template per task type, taken from the product's
 * starter templates (the same file the interface ships). Every saved version is kept.
 */
object TaskSettings {
    private val json = JsonMapper.builder().build()
    private val starters: JsonNode by lazy {
        json.readTree(
            TaskSettings::class.java.getResourceAsStream("/starter-task-templates.json")
                ?: error("Starter templates missing"),
        )
    }

    fun defaults(): Map<String, Any> {
        fun type(id: String) = linkedMapOf(
            "description" to starters.values().first { it.path("id").asString() == id }.path("description").asString(),
            "descriptionMode" to "replace",
            "checklists" to emptyList<Any>(),
            "contentVersion" to 2,
        )
        return linkedMapOf(
            "base" to
                linkedMapOf(
                    "description" to "",
                    "priority" to "normal",
                    "checklists" to emptyList<Any>(),
                    "contentVersion" to 2,
                ),
            "types" to linkedMapOf("task" to type("task"), "bug" to type("bug"), "epic" to type("epic")),
        )
    }

    fun provision(tx: Transaction, projectId: String, actorId: String) {
        val value = defaults()
        tx.update(
            "INSERT INTO app.task_settings(project_id, id, revision, value) VALUES ($1, $2, 1, $3)",
            projectId,
            "task-settings-$projectId",
            value,
        )
        tx.update(
            "INSERT INTO app.task_settings_versions(project_id, revision, value, actor_id) VALUES ($1, 1, $2, $3)",
            projectId,
            value,
            actorId,
        )
    }

    /** The project's templates; a project older than templates has none stored and reads the defaults at revision 0. */
    fun read(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val row = tx.row("SELECT id, revision, value FROM app.task_settings WHERE project_id = $1", projectId)
        val result = linkedMapOf<String, Any?>(
            "id" to (row?.string("id") ?: "task-settings-$projectId"),
            "projectId" to projectId,
            "revision" to (row?.int("revision") ?: 0),
        )
        if (row != null) {
            row.json("value")!!.properties().forEach { (name, value) -> result[name] = value }
        } else {
            result.putAll(defaults())
        }
        return result
    }

    /** Replaces the templates; [value] is the validated document with its defaults filled in. */
    fun write(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        baseRevision: Long,
        value: JsonNode,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        ProjectAccess.authorize(tx, actor, projectId, Capability.CATALOG_WRITE)
        val request = mapOf("baseRevision" to baseRevision, "value" to value)
        return ledger.idempotent(tx, actor, projectId, "task-settings.put", key, request) {
            val previous = read(tx, actor, projectId)
            val revision = (previous["revision"] as Int).toLong()
            requireCondition(revision == baseRevision, 409, "CONFLICT", "Шаблоны уже изменены. Обновите настройки.")
            val id = previous["id"] as String
            tx.update(
                """
                INSERT INTO app.task_settings(project_id, id, revision, value) VALUES ($1, $2, $3, $4)
                ON CONFLICT(project_id) DO UPDATE SET revision = $3, value = $4, updated_at = clock_timestamp()
                """.trimIndent(),
                projectId,
                id,
                revision + 1,
                value,
            )
            tx.update(
                "INSERT INTO app.task_settings_versions(project_id, revision, value, actor_id) VALUES ($1, $2, $3, $4)",
                projectId,
                revision + 1,
                value,
                actor.id,
            )
            AuditTrail.record(tx, actor, projectId, "task-settings.updated", id, revision + 1)
            read(tx, actor, projectId)
        }
    }
}
