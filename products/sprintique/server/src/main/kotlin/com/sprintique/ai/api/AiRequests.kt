package com.sprintique.ai.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.ai.domain.AiProvider
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/** The kinds of AI connection by their names on the wire. */
enum class AiProviderName(@get:JsonValue val wire: String, val provider: AiProvider) {
    ANTHROPIC("anthropic", AiProvider.ANTHROPIC),
    OPENAI("openai", AiProvider.OPENAI),
    OPENAI_COMPATIBLE("openai_compatible", AiProvider.OPENAI_COMPATIBLE),
}

/** Printable ASCII without spaces, as provider keys are. */
private const val API_KEY = "^[\\x21-\\x7e]+$"

@Schema(name = "CreateAiConnection")
data class CreateAiConnectionRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    val provider: AiProviderName,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 10, max = 500)
    val baseUrl: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 8, max = 4096)
    @field:Pattern(regexp = API_KEY)
    val apiKey: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 200)
    val defaultModel: String? = null,
) {
    /** The key is never part of what is printed. */
    override fun toString() = "CreateAiConnectionRequest(name=$name, provider=${provider.wire})"
}

@Schema(name = "UpdateAiConnection")
data class UpdateAiConnectionRequest(
    @field:Min(0)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 10, max = 500)
    val baseUrl: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 8, max = 4096)
    @field:Pattern(regexp = API_KEY)
    val apiKey: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 200)
    val defaultModel: String? = null,
) {
    override fun toString() = "UpdateAiConnectionRequest(name=$name, keyReplaced=${apiKey != null})"
}

@Schema(name = "AgentSettings")
data class AgentSettingsRequest(
    @field:Min(0)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    val enabled: Boolean,
    @field:Pattern(regexp = UUID)
    val connectionId: String?,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 200)
    val model: String,
    @field:Size(max = 8000)
    val instructions: String = "",
    val onAssignment: Boolean = true,
    @field:Min(1)
    @field:Max(50)
    val maxSteps: Int = 12,
    @field:Min(256)
    @field:Max(32000)
    val maxOutputTokens: Int = 2048,
    @field:Min(1)
    @field:Max(200)
    val runsPerHour: Int = 20,
)

@Schema(name = "StartTaskAgentRun")
data class StartTaskAgentRunRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val accountId: String,
)
