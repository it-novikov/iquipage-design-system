package com.sprintique.workspace.application

import com.sprintique.database.Transaction
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * Starter content of a new project: an empty base template and one template per task type, taken from the product's
 * starter templates (the same file the interface ships).
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
}
