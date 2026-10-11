package com.sprintique.task.contract

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.TrimmedString
import com.sprintique.task.domain.TaskMaterialValue
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

enum class TaskMaterialCategory(@get:JsonValue val wire: String) { DESIGN("design"), DOCUMENTATION("documentation") }

@Schema(name = "TaskMaterialInput")
data class TaskMaterialInputRequest(
    val category: TaskMaterialCategory,
    @field:Size(min = 1, max = 200)
    @field:JsonDeserialize(using = TrimmedString::class)
    val title: String,
    @field:Size(min = 1, max = 2048)
    @field:JsonDeserialize(using = TrimmedString::class)
    val url: String,
    val archived: Boolean = false,
) {
    fun toDomain() = TaskMaterialValue(category.wire, title, url, archived)
}

@Schema(name = "PutTaskMaterial")
data class PutTaskMaterialRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: TaskMaterialInputRequest,
)
