package com.sprintique.ai.domain

/** Where and with which key a provider is called. The key never appears in [toString], logs or errors. */
class Endpoint(val provider: AiProvider, val baseUrl: String, val apiKey: String) {
    override fun toString(): String = "Endpoint(${provider.wire}, $baseUrl)"
}

/** A tool the model may call: its name, what it does and the JSON Schema of its arguments. */
data class ToolSpec(val name: String, val description: String, val schema: Map<String, Any?>)

/** One call the model asked for; [arguments] is the JSON object it sent, as text. */
data class ToolCall(val id: String, val name: String, val arguments: String)

/** What one tool call gave back: content for the model, and whether it is an error. */
data class ToolResult(val callId: String, val name: String, val content: String, val error: Boolean)

/** The turns of a conversation after the system prompt, in each provider's own shape once sent. */
sealed interface Turn {
    data class User(val text: String) : Turn

    data class Assistant(val text: String, val calls: List<ToolCall>) : Turn

    data class Tools(val results: List<ToolResult>) : Turn
}

data class ModelRequest(
    val model: String,
    val system: String,
    val turns: List<Turn>,
    val tools: List<ToolSpec>,
    val maxOutputTokens: Int,
)

/** Tokens of one call and what it cost in millionths of a dollar, when the provider says (OpenRouter). */
data class Usage(val input: Int, val output: Int, val costMicros: Long?)

/** The model's answer: text, the tool calls it asks for (none: it is done) and the usage. */
data class ModelReply(val text: String, val calls: List<ToolCall>, val usage: Usage)
