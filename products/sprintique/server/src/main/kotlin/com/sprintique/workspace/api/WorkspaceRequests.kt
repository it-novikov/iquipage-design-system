package com.sprintique.workspace.api

import com.sprintique.contract.Timezone
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

@Schema(name = "CreateWorkspace")
data class CreateWorkspaceRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Timezone
    val timezone: String = "UTC",
)

@Schema(name = "CreateProject")
data class CreateProjectRequest(
    @field:Pattern(regexp = UUID)
    val workspaceId: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Size(min = 2, max = 48)
    @field:Pattern(regexp = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
    val slug: String,
    @field:Pattern(regexp = "^[A-Z][A-Z0-9]{1,9}$")
    val key: String,
    @field:Timezone
    val timezone: String? = null,
)
