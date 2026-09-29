package com.sprintique.workbench.application

import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import tools.jackson.databind.json.JsonMapper

/** The effect of a personal command as it was applied: which field, its revision after the command, its value. */
data class PrivateEffect(val resourceId: String, val revision: Long, val result: Map<String, Any?>)

/**
 * The retry ledger of personal commands (docs/adr W2). Like [CommandLedger], but principal-scoped: a person's
 * focus, follow, seen, snooze and waiting commands never reach the project-visible `app.idempotency`. A replay
 * returns the original effect marked `replayed`; the current state is read separately.
 */
object PrivateLedger {
    private val KEY = Regex("^[A-Za-z0-9_-]{8,120}$")
    private val json = JsonMapper.builder().build()

    @Suppress("LongParameterList")
    fun once(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operation: String,
        key: String,
        input: Any,
        effect: () -> PrivateEffect,
    ): Map<String, Any?> {
        requireCondition(KEY.matches(key), 400, "IDEMPOTENCY_KEY", "Передайте корректный Idempotency-Key.")
        val requestHash = Tokens.sha256Hex(CommandLedger.canonical(json.valueToTree(input)))
        val lock = "private:${actor.id}:$projectId:$operation:$key"
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", lock)
        val previous = tx.row(
            """
            SELECT request_hash, result FROM app.private_receipts
            WHERE principal_id = $1 AND project_id = $2 AND operation = $3 AND key = $4
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
            @Suppress("UNCHECKED_CAST")
            val stored = json.treeToValue(previous.json("result"), Map::class.java) as Map<String, Any?>
            return LinkedHashMap(stored).apply { put("replayed", true) }
        }
        val applied = effect()
        val result = LinkedHashMap(applied.result).apply { put("replayed", false) }
        tx.update(
            """
            INSERT INTO app.private_receipts(principal_id, project_id, operation, key, request_hash, resource_id,
                                             effect_revision, result)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """.trimIndent(),
            actor.id,
            projectId,
            operation,
            key,
            requestHash,
            applied.resourceId,
            applied.revision,
            json.writeValueAsString(result),
        )
        return result
    }
}
