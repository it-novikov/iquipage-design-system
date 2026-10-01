package com.sprintique.ai.application

import com.sprintique.ai.domain.AiProvider
import com.sprintique.ai.domain.Endpoint
import com.sprintique.ai.domain.ModelReply
import com.sprintique.ai.domain.ModelRequest
import com.sprintique.ai.domain.ProviderException
import com.sprintique.ai.domain.ToolCall
import com.sprintique.ai.domain.ToolResult
import com.sprintique.ai.domain.ToolSpec
import com.sprintique.ai.domain.Turn
import com.sprintique.database.Database
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.RuntimeCredentials
import com.sprintique.mcp.application.McpTools
import com.sprintique.mcp.application.TaskArguments
import com.sprintique.problem.ProblemException
import com.sprintique.token.Tokens
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.Base64

/**
 * Works on one run of a service account's agent at a time (docs/decisions/0005-ai-agents.md). It takes a due run
 * under a lease, opens the connection's key, issues the run's credential and then alternates: keep the lease and save
 * the conversation, ask the model, run the tool calls it asks for as the account. The model's final answer becomes
 * the account's comment in the task discussion. A provider failure, a limit, a stop or lost access ends the run with
 * a code (and, where the account can still write, a short comment that says why in words, never the provider's).
 *
 * A run taken over after a crash continues from its saved conversation; calls already made repeat nothing, since each
 * changing call carries a retry key derived from the run and its place in the conversation.
 */
@Component
@Profile("api")
class AgentRunner(
    private val database: Database,
    private val credentials: RuntimeCredentials,
    private val models: ModelPort,
    private val box: SecretBox,
    private val tools: AgentTools,
    private val mcp: McpTools,
    private val json: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(AgentRunner::class.java)

    /** Takes and works on one due run; false when there was none. */
    fun runOne(): Boolean {
        val lease = database.transaction { tx ->
            tx.row(
                """
                SELECT run_project AS "projectId", run_id AS id, run_lease AS lease, run_account AS account
                FROM app.ai_run_claim($1)
                """.trimIndent(),
                LEASE_SECONDS,
            )
        }?.let { RunLease(it.string("projectId"), it.string("id"), it.string("lease"), it.string("account")) }
            ?: return false
        try {
            Work(lease).go()
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            // The class and our own frame locate the failure; the message may carry data and is not logged.
            val site = error.stackTrace.firstOrNull { it.className.startsWith("com.sprintique.") }
            log.error(
                "Agent run failed run={} error={} at={}",
                lease.runId,
                error.javaClass.name,
                site?.let { "${it.className}.${it.methodName}:${it.lineNumber}" },
            )
            if (!Thread.currentThread().isInterrupted) finish(lease, "failed", "RUN_FAILED", null)
        }
        return true
    }

    private fun finish(lease: RunLease, state: String, code: String?, messageId: String?) {
        database.transaction { tx ->
            tx.row(
                "SELECT app.ai_run_finish($1::uuid, $2::uuid, $3, $4, $5) AS ok",
                lease.runId,
                lease.token,
                state,
                code,
                messageId,
            )
        }
    }

    /** One run from its lease to its end. */
    private inner class Work(private val lease: RunLease) {
        private lateinit var run: JsonNode
        private var credentialId: String? = null
        private val turns = mutableListOf<Turn>()
        private var steps = 0
        private var tokens = 0L

        @Suppress("ReturnCount")
        fun go() {
            run = credentials.asAccount(lease.accountId, lease.projectId, lease.runId) { tx ->
                tx.row("SELECT app.ai_run_load($1::uuid, $2::uuid) AS run", lease.runId, lease.token)?.json("run")
            }?.takeIf { it.isObject } ?: return finish(lease, "failed", "ACCESS_LOST", null)
            if (run.path("cancelRequested").booleanValue()) return finish(lease, "cancelled", null, null)
            if (!run.path("active").booleanValue()) return finish(lease, "failed", "AGENT_DISABLED", null)
            credentialId = text("credentialId") ?: issue() ?: return
            if (!run.path("enabled").booleanValue() || !run.path("connectionLive").booleanValue()) {
                return fail("AGENT_DISABLED")
            }
            val context = AiConnections.context(text("connectionId").orEmpty())
            val key = text("sealed")?.let { sealed ->
                box.open(Base64.getMimeDecoder().decode(sealed), run.path("keyVersion").intValue(), context)
            } ?: return fail("AI_KEY_UNREADABLE")
            val endpoint = Endpoint(AiProvider.fromWire(text("provider"))!!, text("baseUrl")!!, key)
            val (system, specs) = setup() ?: return finish(lease, "failed", "ACCESS_LOST", null)
            steps = run.path("stepsUsed").intValue()
            tokens = run.path("tokensUsed").longValue()
            loop(endpoint, system, specs)
        }

        /** Issues and binds the run's credential; null when the lease was lost meanwhile. */
        private fun issue(): String? = credentials.asAccount(lease.accountId, lease.projectId, lease.runId) { tx ->
            val id = credentials.issue(tx, lease.accountId, text("ownerId")!!, lease.projectId, CREDENTIAL_SECONDS)
            id.takeIf {
                tx.row(
                    "SELECT app.ai_run_attach($1::uuid, $2::uuid, $3) AS ok",
                    lease.runId,
                    lease.token,
                    id,
                )!!.boolean("ok")
            }
        }

        /**
         * The system prompt and the tools, from the account's permissions now; on a new run also the task as the
         * first message. Null when the account can no longer read the task.
         */
        private fun setup(): Pair<String, List<ToolSpec>>? = try {
            credentials.run(credentialId!!, lease.runId) { tx, actor ->
                val permissions = ProjectAccess.membership(tx, actor, lease.projectId)?.permissions.orEmpty()
                val system = AgentPrompt.system(
                    text("accountName").orEmpty(),
                    text("projectName").orEmpty(),
                    text("projectKey").orEmpty(),
                    text("trigger").orEmpty(),
                    permissions,
                    text("instructions").orEmpty(),
                )
                val saved = run.path("transcript")
                if (saved.isObject) {
                    turns += Transcript.read(saved)
                } else {
                    val task = TaskArguments(lease.projectId, text("taskId")!!)
                    val tool = mcp.find("get_task")!!
                    val data = json.valueToTree<JsonNode>(tool.run(tx, actor, task, json.valueToTree(task)))
                    turns += Turn.User(AgentPrompt.task(json, data, Tokens.random().take(NONCE)))
                }
                system to tools.specs(tx, actor, lease.projectId)
            }
        } catch (_: ProblemException) {
            null
        }

        @Suppress("ReturnCount", "LoopWithTooManyJumpStatements")
        private fun loop(endpoint: Endpoint, system: String, specs: List<ToolSpec>) {
            val maxSteps = run.path("maxSteps").intValue()
            val maxTokens = run.path("maxRunTokens").longValue()
            while (true) {
                if (Thread.currentThread().isInterrupted) return
                when (heartbeat()) {
                    "ok" -> Unit
                    "cancelled" -> return finish(lease, "cancelled", null, null)
                    "disabled" -> return fail("AGENT_DISABLED")
                    "timeout" -> return fail("RUN_TIMEOUT")
                    else -> return
                }
                val last = turns.lastOrNull()
                if (last is Turn.Assistant && last.calls.isNotEmpty()) {
                    val position = turns.count { it is Turn.Assistant }
                    val results = last.calls.mapIndexed { index, call ->
                        tools.execute(lease, credentialId!!, call, retryKey("$position:$index"))
                    }
                    turns += Turn.Tools(results)
                    continue
                }
                if (steps >= maxSteps) return fail("STEP_LIMIT", lastText())
                // Each call sends the whole conversation again: the budget bounds what the run costs in total.
                if (tokens >= maxTokens) return fail("TOKEN_LIMIT", lastText())
                val request =
                    ModelRequest(text("model")!!, system, turns, specs, run.path("maxOutputTokens").intValue())
                val reply = try {
                    models.reply(endpoint, request)
                } catch (error: ProviderException) {
                    if (Thread.currentThread().isInterrupted) return
                    step(null, error.failure.name)
                    return fail(error.failure.name)
                }
                step(reply, null)
                steps++
                tokens += reply.usage.input.toLong() + reply.usage.output.toLong()
                val calls = reply.calls.take(CALLS_PER_STEP)
                turns += Turn.Assistant(reply.text, calls)
                if (calls.isEmpty()) return complete(reply.text)
            }
        }

        /** Keeps the lease and saves the conversation; what to do next (see app.ai_run_heartbeat). */
        private fun heartbeat(): String {
            val transcript = json.writeValueAsString(Transcript.write(turns))
            if (transcript.length > TRANSCRIPT_LIMIT) return "too-long".also { fail("CONTEXT_LIMIT") }
            return database.transaction { tx ->
                tx.row(
                    "SELECT app.ai_run_heartbeat($1::uuid, $2::uuid, $3, $4::jsonb) AS state",
                    lease.runId,
                    lease.token,
                    LEASE_SECONDS,
                    transcript,
                )!!.string("state")
            }
        }

        private fun step(reply: ModelReply?, code: String?) {
            database.transaction { tx ->
                tx.row(
                    "SELECT app.ai_run_step($1::uuid, $2::uuid, 'model', NULL, $3, $4, $5, $6, $7, $8) AS step",
                    lease.runId,
                    lease.token,
                    text("model").orEmpty().take(MODEL_SUMMARY),
                    if (code == null) "ok" else "error",
                    code,
                    reply?.usage?.input,
                    reply?.usage?.output,
                    reply?.usage?.costMicros,
                )
            }
        }

        /** Posts the answer as the account's comment and ends the run. */
        private fun complete(answer: String) {
            val body = AgentPrompt.plain(answer).trim().ifEmpty { "Готово." }
            val posted = comment(body, "final")
            if (posted.error) {
                val code = json.readTree(posted.content).path("error").takeIf { it.isString }?.asString()
                val forbidden = code in setOf("FORBIDDEN", "SERVICE_ACCOUNT_FORBIDDEN", "INSUFFICIENT_SCOPE")
                return finish(lease, "failed", if (forbidden) "COMMENT_FORBIDDEN" else "RUN_FAILED", null)
            }
            val messageId = json.readTree(posted.content).path("messageId").takeIf { it.isString }?.asString()
            finish(lease, "completed", null, messageId)
        }

        /** Ends the run with a code, telling the task why when the account can still write there. */
        private fun fail(code: String, partial: String? = null) {
            if (credentialId != null && code != "ACCESS_LOST") {
                val reason = RunErrors.message(code) ?: "Запуск не удался."
                val tail = partial?.let(AgentPrompt::plain)?.takeIf(String::isNotEmpty)?.let {
                    "\n\nПоследний ответ агента: " + it.take(PARTIAL)
                }
                comment("Не удалось выполнить задачу. $reason${tail.orEmpty()}", "failure")
            }
            finish(lease, "failed", code, null)
        }

        private fun comment(body: String, kind: String): ToolResult {
            val arguments = mapOf("task" to text("taskId"), "body" to body.take(MESSAGE_LIMIT))
            val call = ToolCall("$kind-${lease.runId}", "add_task_comment", json.writeValueAsString(arguments))
            return tools.execute(lease, credentialId!!, call, retryKey(kind))
        }

        private fun lastText(): String? = turns.filterIsInstance<Turn.Assistant>().lastOrNull()?.text

        private fun retryKey(place: String) = "ai-" + Tokens.sha256Hex("${lease.runId}:$place").take(KEY_LENGTH)

        private fun text(name: String): String? = run.path(name).takeIf { it.isString }?.asString()
    }

    /** The conversation as it is saved between steps. */
    object Transcript {
        fun write(turns: List<Turn>): Map<String, Any?> = mapOf(
            "v" to 1,
            "turns" to turns.map { turn ->
                when (turn) {
                    is Turn.User -> mapOf("role" to "user", "text" to turn.text)

                    is Turn.Assistant -> mapOf(
                        "role" to "assistant",
                        "text" to turn.text,
                        "calls" to
                            turn.calls.map { mapOf("id" to it.id, "name" to it.name, "arguments" to it.arguments) },
                    )

                    is Turn.Tools -> mapOf(
                        "role" to "tools",
                        "results" to turn.results.map {
                            mapOf("id" to it.callId, "name" to it.name, "content" to it.content, "error" to it.error)
                        },
                    )
                }
            },
        )

        fun read(node: JsonNode): List<Turn> = node.path("turns").values().mapNotNull { turn ->
            val text = { field: JsonNode, name: String ->
                field.path(name).takeIf { it.isString }?.asString().orEmpty()
            }
            when (text(turn, "role")) {
                "user" -> Turn.User(text(turn, "text"))

                "assistant" -> Turn.Assistant(
                    text(turn, "text"),
                    turn.path("calls").values().map {
                        ToolCall(text(it, "id"), text(it, "name"), text(it, "arguments"))
                    },
                )

                "tools" -> Turn.Tools(
                    turn.path("results").values().map {
                        val error = it.path("error").booleanValue()
                        ToolResult(text(it, "id"), text(it, "name"), text(it, "content"), error)
                    },
                )

                else -> null
            }
        }
    }

    private companion object {
        const val LEASE_SECONDS = 300
        const val CREDENTIAL_SECONDS = 1800
        const val CALLS_PER_STEP = 8
        const val TRANSCRIPT_LIMIT = 900_000
        const val MESSAGE_LIMIT = 20_000
        const val PARTIAL = 2000
        const val NONCE = 16
        const val KEY_LENGTH = 40
        const val MODEL_SUMMARY = 200
    }
}
