package com.sprintique.workspace.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.web.RequestValidationException
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.JsonNodeFactory
import tools.jackson.databind.node.ObjectNode

/** How a type template combines with the base template. */
enum class TemplateMode(@get:JsonValue val wire: String) {
    INHERIT("inherit"),
    APPEND("append"),
    REPLACE("replace"),
    EXCLUDE("exclude"),
}

enum class TemplatePriority(@get:JsonValue val wire: String) {
    LOW("low"),
    NORMAL("normal"),
    HIGH("high"),
    CRITICAL("critical"),
}

@Schema(name = "TemplateSpec")
data class TemplateSpecRequest(
    @field:Size(max = DESCRIPTION_LIMIT)
    val description: String = "",
    val priority: TemplatePriority? = null,
    val descriptionMode: TemplateMode? = null,
    /** Checklists are not part of templates yet: only an empty list is accepted. */
    @field:Size(max = 0)
    val checklists: List<Any?> = emptyList(),
    val checklistsMode: TemplateMode? = null,
    @field:Min(2) @field:Max(2)
    val contentVersion: Int? = null,
)

@Schema(name = "TemplateTypes")
data class TemplateTypesRequest(
    @field:Valid val task: TemplateSpecRequest,
    @field:Valid val bug: TemplateSpecRequest,
    @field:Valid val epic: TemplateSpecRequest,
)

@Schema(name = "TaskSettingsInput")
data class TaskSettingsInputRequest(
    @field:Valid val base: TemplateSpecRequest,
    @field:Valid val types: TemplateTypesRequest,
) {
    /** An appended type template must still fit one task description together with the base. */
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isCompiledShort: Boolean
        get() = listOf(types.task, types.bug, types.epic).all { spec ->
            spec.descriptionMode != TemplateMode.APPEND ||
                listOf(base.description, spec.description).filter(String::isNotEmpty).joinToString("\n\n").length <=
                DESCRIPTION_LIMIT
        }
}

@Schema(name = "PutTaskSettings")
data class PutTaskSettingsRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: TaskSettingsInputRequest,
)

private const val DESCRIPTION_LIMIT = 10_000

/**
 * The stored document of validated templates: the fields the writer sent, with the defaults of absent ones filled
 * in. Optional modes and the version may be left out but are never null.
 */
fun storedTemplates(body: JsonNode): JsonNode {
    val value = body.path("value").deepCopy() as ObjectNode
    val specs = listOf(value.path("base")) + listOf("task", "bug", "epic").map { value.path("types").path(it) }
    for (spec in specs.map { it as ObjectNode }) {
        for (name in listOf("descriptionMode", "checklistsMode", "contentVersion")) {
            if (spec.has(name) && spec.get(name).isNull) throw RequestValidationException()
        }
        if (!spec.has("description")) spec.put("description", "")
        if (!spec.has("checklists")) spec.set("checklists", JsonNodeFactory.instance.arrayNode())
    }
    return value
}
