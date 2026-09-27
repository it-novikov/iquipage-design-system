package com.sprintique.command

import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode

/**
 * How a stored receipt becomes a response again. A growing aggregate is not copied into every receipt: `store` keeps
 * identifiers and `restore` rebuilds the response from current state, so the ledger stays constant-size per command.
 */
interface Receipt<T> {
    fun store(value: T): Any

    fun restore(record: JsonNode): Any
}

/**
 * The retry ledger. The same key with the same request returns the stored response without running the effect again;
 * the same key with a different request is a conflict. Runs in the transaction of the effect itself.
 */
@Component
@Profile("api")
class CommandLedger(private val json: JsonMapper) {
    fun <T : Any> idempotent(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operation: String,
        key: String,
        input: Any,
        receipt: Receipt<T>? = null,
        execute: () -> T,
    ): Any {
        requireCondition(KEY.matches(key), 400, "IDEMPOTENCY_KEY", "Передайте корректный Idempotency-Key.")
        val requestHash = Tokens.sha256Hex(canonical(json.valueToTree(input)))
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "${actor.id}:$projectId:$operation:$key")
        val previous = tx.row(
            """
            SELECT request_hash, result FROM app.idempotency
            WHERE actor_id = $1 AND project_id = $2 AND operation = $3 AND key = $4
            """.trimIndent(),
            actor.id,
            projectId,
            operation,
            key,
        )
        if (previous != null) {
            requireCondition(
                previous.string("request_hash") == requestHash,
                409,
                "IDEMPOTENCY_CONFLICT",
                "Ключ повтора уже использован для другого запроса.",
            )
            val stored = previous.json("result") ?: json.nullNode()
            return receipt?.restore(stored) ?: stored
        }
        val result = execute()
        tx.update(
            """
            INSERT INTO app.idempotency(actor_id, project_id, operation, key, request_hash, result)
            VALUES ($1, $2, $3, $4, $5, $6)
            """.trimIndent(),
            actor.id,
            projectId,
            operation,
            key,
            requestHash,
            json.writeValueAsString(receipt?.store(result) ?: result),
        )
        return result
    }

    companion object {
        private val KEY = Regex("^[A-Za-z0-9_-]{8,120}$")

        /**
         * Keys sorted at every level, so field order does not change the hash. Numbers are written by value (`1024.0`,
         * `1024` and `1.024E3` are one number), as the database returns a stored number in its own notation.
         */
        fun canonical(node: JsonNode): String = when {
            node.isNumber -> node.decimalValue().stripTrailingZeros().toPlainString()

            node.isArray -> node.values().joinToString(",", "[", "]") { canonical(it) }

            node.isObject -> (node as ObjectNode).properties().sortedBy { it.key }
                .joinToString(",", "{", "}") { (name, value) ->
                    JsonMapper.shared().writeValueAsString(name) + ":" +
                        canonical(value)
                }

            else -> node.toString()
        }
    }
}
