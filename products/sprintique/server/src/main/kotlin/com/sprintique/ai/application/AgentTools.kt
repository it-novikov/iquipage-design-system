package com.sprintique.ai.application

import com.sprintique.access.domain.Permission
import com.sprintique.ai.domain.ToolCall
import com.sprintique.ai.domain.ToolResult
import com.sprintique.ai.domain.ToolSpec
import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.RuntimeCredentials
import com.sprintique.identity.domain.Actor
import com.sprintique.mcp.application.McpTool
import com.sprintique.mcp.application.McpTools
import com.sprintique.problem.ProblemException
import com.sprintique.web.RequestValidationException
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode

/** A leased run: its id and the lease token that every queue function checks. */
data class RunLease(val projectId: String, val runId: String, val token: String, val accountId: String)

/**
 * The tools of an agent are the MCP server's own (McpTools), run the same way: parsed as strictly, executed as the
 * service account through the task and discussion use cases with their permission checks, row security, write
 * fence, revision check, retry ledger, audit and outbox. Only the task tools are offered, without a project to choose:
 * the run's project is put in, and row security is limited to it as well. A changing call gets a retry key derived
 * from the run and its place in the conversation, so a run taken over after a crash repeats no change.
 */
@Component
@Profile("api")
class AgentTools(
    private val mcp: McpTools,
    private val credentials: RuntimeCredentials,
    private val database: Database,
    private val json: JsonMapper,
    private val flags: FeatureFlags,
) {
    private val log = LoggerFactory.getLogger(AgentTools::class.java)

    /** The tools the account may use in the project now; a refused call is still refused when it is made. */
    fun specs(tx: Transaction, actor: Actor, projectId: String): List<ToolSpec> {
        val has = ProjectAccess.membership(tx, actor, projectId)?.permissions.orEmpty()
        return OFFERED.filter { (name, needs) ->
            needs in has &&
                (name !in WORK_TOOLS || flags.isEnabled(Feature.AGENT_WORK))
        }.mapNotNull { (name, _) -> mcp.find(name) }.map(::spec)
    }

    fun execute(lease: RunLease, credentialId: String, call: ToolCall, key: String): ToolResult {
        val tool = mcp.find(call.name)?.takeIf { it.name in OFFERED }
        val arguments = runCatching { json.readTree(call.arguments) }.getOrNull() as? ObjectNode
        val summary = arguments?.let(::summary).orEmpty()
        if (tool == null || arguments == null) {
            val code = if (tool == null) "UNKNOWN_TOOL" else "VALIDATION"
            record(lease, call.name.takeIf { TOOL_NAME.matches(it) } ?: "unknown", summary, "error", code)
            return failure(
                call, code,
                if (tool ==
                    null
                ) {
                    "Такого инструмента нет."
                } else {
                    "Аргументы должны быть объектом JSON."
                },
            )
        }
        arguments.put("projectId", lease.projectId)
        // What the agent says in the discussion follows the rule of Sprintique texts: paragraphs, no lists.
        if (tool.name == "add_task_comment" && arguments.path("body").isString) {
            arguments.put("body", AgentPrompt.plain(arguments.path("body").asString()))
        }
        arguments.remove("idempotencyKey")
        if (schemaHas(tool, "idempotencyKey")) arguments.put("idempotencyKey", key)
        return try {
            val content = credentials.run(credentialId, lease.runId) { tx, actor ->
                val parsed = try {
                    mcp.parse(tool, arguments)
                } catch (_: RequestValidationException) {
                    throw ProblemException(400, "VALIDATION", "Проверьте аргументы инструмента по его схеме.")
                }
                val result = tool.run(tx, actor, parsed, arguments)
                step(tx, lease, tool.name, summary, "ok", null)
                json.writeValueAsString(result)
            }
            ToolResult(call.id, call.name, cap(content), false)
        } catch (error: ProblemException) {
            record(
                lease, tool.name, summary,
                if (error.status == 401 ||
                    error.status == 403
                ) {
                    "denied"
                } else {
                    "error"
                },
                error.code,
            )
            failure(call, error.code, error.message.orEmpty())
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            // The class locates the failure; the message may carry data and is not logged.
            log.error("Agent tool failed run={} tool={} error={}", lease.runId, tool.name, error.javaClass.name)
            record(lease, tool.name, summary, "error", "TOOL_FAILED")
            failure(call, "TEMPORARILY_UNAVAILABLE", "Сервис временно недоступен. Повторите позже.")
        }
    }

    /** Records a step of the run outside a tool's transaction (a refused or failed call). */
    fun record(lease: RunLease, tool: String, summary: String, status: String, code: String?) {
        database.transaction { tx -> step(tx, lease, tool, summary, status, code) }
    }

    private fun step(tx: Transaction, lease: RunLease, tool: String, summary: String, status: String, code: String?) {
        tx.row(
            "SELECT app.ai_run_step($1::uuid, $2::uuid, 'tool', $3, $4, $5, $6, NULL, NULL, NULL) AS step",
            lease.runId,
            lease.token,
            tool,
            summary,
            status,
            code,
        )
    }

    private fun failure(call: ToolCall, code: String, message: String) =
        ToolResult(call.id, call.name, json.writeValueAsString(mapOf("error" to code, "message" to message)), true)

    /** The MCP definition without the project (the run's) and the retry key (the runner's). */
    private fun spec(tool: McpTool): ToolSpec {
        val schema = LinkedHashMap(tool.inputSchema)

        @Suppress("UNCHECKED_CAST")
        val properties = LinkedHashMap(schema["properties"] as Map<String, Any?>)
        properties.keys.removeAll(INJECTED)
        schema["properties"] = properties
        @Suppress("UNCHECKED_CAST")
        schema["required"] = (schema["required"] as List<String>).filterNot { it in INJECTED }
        return ToolSpec(tool.name, tool.description, schema)
    }

    private fun schemaHas(tool: McpTool, name: String): Boolean =
        (tool.inputSchema["properties"] as? Map<*, *>)?.containsKey(name) == true

    /** What a step shows of the arguments: short values, and only the length of texts people will read anyway. */
    private fun summary(arguments: JsonNode): String = arguments.properties()
        .filter { (name, _) -> name !in INJECTED }
        .joinToString(", ") { (name, value) ->
            when {
                name in TEXTS && value.isString -> "$name: ${value.asString().length} симв."
                value.isString -> "$name: ${value.asString().take(VALUE_LIMIT)}"
                value.isNumber || value.isBoolean || value.isNull -> "$name: $value"
                else -> "$name: …"
            }
        }.take(SUMMARY_LIMIT)

    private fun cap(content: String) =
        if (content.length <= RESULT_LIMIT) content else content.take(RESULT_LIMIT) + "\n…(обрезано)"

    companion object {
        /** The tools an agent is offered and the permission each needs to be offered. */
        val OFFERED: Map<String, Permission> = linkedMapOf(
            "get_work_plan" to Permission.TASKS_READ,
            "get_work_brief" to Permission.TASKS_READ,
            "list_work_skills" to Permission.TASKS_READ,
            "get_work_skill" to Permission.TASKS_READ,
            "change_work_lease" to Permission.WORK_WRITE,
            "save_work_checkpoint" to Permission.WORK_WRITE,
            "create_work_question" to Permission.WORK_WRITE,
            "change_work_step" to Permission.WORK_WRITE,
            "handoff_work" to Permission.WORK_WRITE,
            "get_task" to Permission.TASKS_READ,
            "search_tasks" to Permission.TASKS_READ,
            "list_releases" to Permission.TASKS_READ,
            "list_milestones" to Permission.TASKS_READ,
            "add_task_comment" to Permission.THREADS_WRITE,
            "update_task" to Permission.TASKS_WRITE,
            "change_task_status" to Permission.TASKS_WRITE,
            "create_task" to Permission.TASKS_WRITE,
        )
        private val WORK_TOOLS = setOf(
            "get_work_plan", "get_work_brief", "list_work_skills", "get_work_skill",
            "change_work_lease", "save_work_checkpoint", "create_work_question", "change_work_step", "handoff_work",
        )
        private val INJECTED = setOf("projectId", "idempotencyKey")
        private val TEXTS = setOf("body", "description", "title", "query")
        private val TOOL_NAME = Regex("^[a-z_]{1,64}$")
        private const val VALUE_LIMIT = 60
        private const val SUMMARY_LIMIT = 300
        private const val RESULT_LIMIT = 16_000
    }
}
