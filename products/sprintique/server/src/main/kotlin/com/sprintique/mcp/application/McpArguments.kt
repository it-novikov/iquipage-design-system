package com.sprintique.mcp.application

import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.task.contract.TaskEstimateRequest
import com.sprintique.task.contract.TaskPriority
import com.sprintique.task.contract.TaskStatus
import com.sprintique.task.contract.TaskType
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/*
 * The arguments of the MCP tools, parsed as strictly as request bodies (unknown fields, wrong types and missing
 * required fields are refused). The JSON Schemas the tools publish are written next to the tools and are checked
 * against these classes by McpToolSchemaTest.
 */

/** A retry key: the same key with the same arguments repeats the first result instead of acting again. */
const val IDEMPOTENCY_KEY = "^[A-Za-z0-9_-]{8,120}$"

class NoArguments

data class ProjectArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
)

data class MapListArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:Size(max = 200)
    val cursor: String? = null,
)

data class SearchTasksArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String? = null,
    @field:Size(max = 200)
    val query: String? = null,
    val status: TaskStatus? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val assigneeId: String? = null,
    @field:Min(1)
    @field:Max(50)
    val limit: Int = 20,
    @field:Size(max = 200)
    val cursor: String? = null,
)

data class TaskArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val task: String,
)

data class CreateTaskArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 240)
    val title: String,
    @field:Size(max = 10_000)
    val description: String = "",
    val type: TaskType = TaskType.TASK,
    val priority: TaskPriority = TaskPriority.NORMAL,
    @field:Pattern(regexp = RESOURCE_ID)
    val assigneeId: String? = null,
    @field:IsoDate
    val dueDate: String? = null,
    @field:Valid
    val estimate: TaskEstimateRequest? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val parent: String? = null,
    @field:Pattern(regexp = IDEMPOTENCY_KEY)
    val idempotencyKey: String? = null,
)

/** Fields left out stay as they are; `assigneeId`, `dueDate` and `estimate` sent as null are cleared. */
data class UpdateTaskArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val task: String,
    @field:Min(1)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 240)
    val title: String? = null,
    @field:Size(max = 10_000)
    val description: String? = null,
    val type: TaskType? = null,
    val priority: TaskPriority? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val assigneeId: String? = null,
    @field:IsoDate
    val dueDate: String? = null,
    @field:Valid
    val estimate: TaskEstimateRequest? = null,
    @field:Pattern(regexp = IDEMPOTENCY_KEY)
    val idempotencyKey: String? = null,
)

data class ChangeStatusArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val task: String,
    @field:Min(1)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val status: TaskStatus,
    @field:Pattern(regexp = IDEMPOTENCY_KEY)
    val idempotencyKey: String? = null,
)

data class AddCommentArguments(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val task: String,
    @field:Size(min = 1, max = 20_000)
    val body: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val threadId: String? = null,
    val question: Boolean = false,
    @field:Pattern(regexp = IDEMPOTENCY_KEY)
    val idempotencyKey: String? = null,
)
