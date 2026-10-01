package com.sprintique.ai.application

import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.ai.domain.AddressPolicy
import com.sprintique.ai.domain.AiProvider
import com.sprintique.ai.domain.Endpoint
import com.sprintique.ai.domain.ProviderFailure
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.net.InetAddress
import java.net.URI
import java.util.UUID

/**
 * AI connections of a workspace (docs/decisions/0005-ai-agents.md): people with «Настраивать пространство» add,
 * change, check and delete them; other members (not guests) see their names and models to give a service account an
 * agent. The API key is accepted and never returned: it is sealed at once (SecretBox) and only its last four
 * characters stay readable. A check («Проверить») makes one minimal real call and records when and how it went.
 */
@Component
@Profile("api")
class AiConnections(private val box: SecretBox, properties: SprintiqueProperties) {
    private val allowedHosts =
        properties.ai.allowedHosts.split(',').map { it.trim().lowercase() }.filter(String::isNotEmpty).toSet()

    data class NewConnection(
        val name: String,
        val provider: AiProvider,
        val baseUrl: String?,
        val apiKey: String,
        val defaultModel: String?,
    )

    data class ConnectionChange(
        val baseRevision: Long,
        val name: String,
        val baseUrl: String?,
        val apiKey: String?,
        val defaultModel: String?,
    )

    /** What a check needs, read and opened in one transaction so that no key waits in memory across requests. */
    class CheckTarget(val endpoint: Endpoint, val defaultModel: String?, val revision: Long)

    fun list(tx: Transaction, actor: Actor, workspaceId: String): Map<String, Any?> {
        val member = WorkspaceAccess.require(tx, actor, workspaceId)
        requireCondition(member.role != WorkspaceRole.GUEST, 403, "FORBIDDEN", "Гостю пространства это недоступно.")
        val manager = member.has(Permission.WORKSPACE_SETTINGS)
        val items = tx.rows(
            """
            SELECT $PROJECTION FROM app.ai_connections c
            WHERE c.workspace_id = $1::uuid AND c.deleted_at IS NULL ORDER BY c.name, c.id LIMIT $2
            """.trimIndent(),
            workspaceId,
            WORKSPACE_LIMIT,
        ).map { row -> present(row, manager) }
        return linkedMapOf(
            "items" to items,
            "canManage" to manager,
            "available" to box.isConfigured,
            "providers" to AiProvider.entries.map {
                linkedMapOf("id" to it.wire, "name" to it.title, "baseUrl" to it.defaultBaseUrl)
            },
        )
    }

    fun create(tx: Transaction, actor: Actor, workspaceId: String, input: NewConnection): Map<String, Any?> {
        WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        if (!box.isConfigured) throw box.unavailable()
        val baseUrl = baseUrl(input.provider, input.baseUrl)
        val count = tx.row(
            "SELECT count(*)::int AS n FROM app.ai_connections WHERE workspace_id = $1::uuid AND deleted_at IS NULL",
            workspaceId,
        )!!.int("n")
        requireCondition(
            count < WORKSPACE_LIMIT,
            422,
            "AI_CONNECTION_LIMIT",
            "В пространстве не больше $WORKSPACE_LIMIT ИИ-подключений.",
        )
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO app.ai_connections(id, workspace_id, name, provider, base_url, default_model, key_hint, created_by, updated_by)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $8)
            """.trimIndent(),
            id, workspaceId, input.name, input.provider.wire, baseUrl, input.defaultModel, hint(input.apiKey), actor.id,
        )
        store(tx, id, input.apiKey)
        val details = mapOf("provider" to input.provider.wire)
        WorkspaceAccess.audit(tx, actor, workspaceId, "ai.connection.created", id, 1, details)
        return read(tx, workspaceId, id)
    }

    fun update(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        change: ConnectionChange,
    ): Map<String, Any?> {
        WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = row(tx, workspaceId, id, lock = true)
        requireCondition(
            current.long("revision") == change.baseRevision,
            409,
            "CONFLICT",
            "Подключение уже изменено. Обновите страницу.",
        )
        val provider = AiProvider.fromWire(current.string("provider"))!!
        val baseUrl = baseUrl(provider, change.baseUrl)
        if (change.apiKey != null) {
            if (!box.isConfigured) throw box.unavailable()
            store(tx, id, change.apiKey)
        }
        // A new address or key is not the one that was checked: its check starts afresh.
        val reset = change.apiKey != null || baseUrl != current.string("baseUrl")
        tx.update(
            """
            UPDATE app.ai_connections SET name = $2, base_url = $3, default_model = $4,
              key_hint = coalesce($5, key_hint), revision = revision + 1, updated_by = $6, updated_at = clock_timestamp(),
              last_test_state = CASE WHEN $7::boolean THEN NULL ELSE last_test_state END,
              last_test_code = CASE WHEN $7::boolean THEN NULL ELSE last_test_code END,
              last_tested_at = CASE WHEN $7::boolean THEN NULL ELSE last_tested_at END,
              models = CASE WHEN $7::boolean THEN '{}' ELSE models END
            WHERE id = $1::uuid
            """.trimIndent(),
            id, change.name, baseUrl, change.defaultModel, change.apiKey?.let(::hint), actor.id, reset,
        )
        WorkspaceAccess.audit(
            tx,
            actor,
            workspaceId,
            "ai.connection.changed",
            id,
            current.long("revision") + 1,
            mapOf("keyReplaced" to (change.apiKey != null)),
        )
        return read(tx, workspaceId, id)
    }

    /**
     * Deletes a connection: its sealed key is erased at once, agents that used it are switched off and their queued
     * runs stop when the runner reaches them.
     */
    fun delete(tx: Transaction, actor: Actor, workspaceId: String, id: String): Map<String, Any?> {
        WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = row(tx, workspaceId, id, lock = true)
        tx.row("SELECT app.ai_forget_connection_secret($1::uuid)", id)
        tx.update(
            """
            UPDATE app.ai_connections SET deleted_at = clock_timestamp(), updated_by = $2, revision = revision + 1
            WHERE id = $1::uuid
            """.trimIndent(),
            id,
            actor.id,
        )
        val stopped = tx.update(
            """
            UPDATE app.ai_agent_profiles SET enabled = false, connection_id = NULL, revision = revision + 1, updated_by = $2,
              updated_at = clock_timestamp()
            WHERE connection_id = $1::uuid
            """.trimIndent(),
            id,
            actor.id,
        )
        WorkspaceAccess.audit(tx, actor, workspaceId, "ai.connection.deleted", id, current.long("revision") + 1)
        return linkedMapOf("deleted" to true, "agentsStopped" to stopped)
    }

    /** Opens the key of a connection for a check; the caller makes the call outside any transaction. */
    fun checkTarget(tx: Transaction, actor: Actor, workspaceId: String, id: String): CheckTarget {
        WorkspaceAccess.require(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = row(tx, workspaceId, id)
        val key = openKey(tx, id)
        val endpoint = Endpoint(AiProvider.fromWire(current.string("provider"))!!, current.string("baseUrl"), key)
        return CheckTarget(endpoint, current.stringOrNull("defaultModel"), current.long("revision"))
    }

    /**
     * Records how a check went: connected (with the models the provider listed) or the failure code. A connection
     * changed while it was checked keeps no result: the check was of what it was before.
     */
    @Suppress("LongParameterList")
    fun recordCheck(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        target: CheckTarget,
        failure: ProviderFailure?,
        models: List<String>,
    ): Map<String, Any?> {
        WorkspaceAccess.require(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        row(tx, workspaceId, id, lock = true)
        tx.update(
            """
            UPDATE app.ai_connections SET last_test_state = $2, last_test_code = $3, last_tested_at = clock_timestamp(),
              models = CASE WHEN $2 = 'connected' AND cardinality($4::text[]) > 0 THEN $4::text[] ELSE models END
            WHERE id = $1::uuid AND revision = $5
            """.trimIndent(),
            id,
            if (failure == null) "connected" else "failed",
            failure?.name,
            models.filter { it.length <= MODEL_LENGTH }.take(MODEL_LIMIT),
            target.revision,
        )
        return read(tx, workspaceId, id) + ("message" to failure?.message)
    }

    private fun openKey(tx: Transaction, id: String): String {
        val secret = tx.row("SELECT sealed, key_version AS \"keyVersion\" FROM app.ai_connection_secret($1::uuid)", id)
        val sealed = requirePresent(secret, 404, "NOT_FOUND", "Подключение недоступно.")
        if (!box.isConfigured) throw box.unavailable()
        return box.open(sealed["sealed"] as ByteArray, sealed.int("keyVersion"), context(id)) ?: throw ProblemException(
            409,
            "AI_KEY_UNREADABLE",
            "Ключ этого подключения зашифрован другим ключом сервера. Введите ключ API заново.",
        )
    }

    private fun store(tx: Transaction, id: String, apiKey: String) {
        tx.row(
            "SELECT app.ai_store_connection_secret($1::uuid, $2, $3)",
            id,
            box.seal(apiKey, context(id)),
            box.version,
        )
    }

    /** The base address of a connection: given, or the provider's own; public HTTPS unless the operator allows it. */
    private fun baseUrl(provider: AiProvider, given: String?): String {
        val value = given?.takeIf(String::isNotBlank) ?: provider.defaultBaseUrl
        val normalized = requirePresent(
            value?.let(AddressPolicy::normalize),
            422,
            "AI_BASE_URL",
            "Укажите адрес API, например https://openrouter.ai/api/v1.",
        )
        val uri = URI(normalized)
        if (!AddressPolicy.allowed(uri, allowedHosts)) {
            requireCondition(uri.scheme == "https", 422, "AI_BASE_URL", ProviderFailure.PROVIDER_INSECURE_URL.message)
            // An address written as an IP is judged now; names are resolved and judged before every request.
            val literal = uri.host.removePrefix("[").removeSuffix("]")
            if (literal.all { it.isDigit() || it == '.' } || literal.contains(':')) {
                val address = runCatching { InetAddress.getByName(literal) }.getOrNull()
                requireCondition(
                    address != null && AddressPolicy.isPublic(address),
                    422,
                    "AI_BASE_URL",
                    ProviderFailure.PROVIDER_ADDRESS_BLOCKED.message,
                )
            }
        }
        return normalized
    }

    private fun row(tx: Transaction, workspaceId: String, id: String, lock: Boolean = false): Row {
        val row = tx.row(
            """
            SELECT $PROJECTION FROM app.ai_connections c
            WHERE c.workspace_id = $1::uuid AND c.id = $2::uuid AND c.deleted_at IS NULL ${if (lock) "FOR UPDATE" else ""}
            """.trimIndent(),
            workspaceId,
            id,
        )
        return requirePresent(row, 404, "NOT_FOUND", "Подключение недоступно.")
    }

    private fun read(tx: Transaction, workspaceId: String, id: String) = present(row(tx, workspaceId, id), true)

    /** A connection as people see it: never its key, only the hint. Members who do not manage see less. */
    private fun present(row: Row, manager: Boolean): Map<String, Any?> {
        val provider = AiProvider.fromWire(row.string("provider"))
        val item = linkedMapOf<String, Any?>(
            "id" to row["id"],
            "name" to row["name"],
            "provider" to row["provider"],
            "providerName" to provider?.title,
            "defaultModel" to row["defaultModel"],
            "models" to row.strings("models"),
            "lastTest" to row.stringOrNull("lastTestState")?.let { state ->
                linkedMapOf(
                    "state" to state,
                    "code" to row["lastTestCode"],
                    "message" to ProviderFailure.fromCode(row.stringOrNull("lastTestCode"))?.message,
                    "at" to row["lastTestedAt"],
                )
            },
        )
        if (manager) {
            item["baseUrl"] = row["baseUrl"]
            item["keyHint"] = row["keyHint"]
            item["revision"] = row["revision"]
            item["updatedAt"] = row["updatedAt"]
            item["agents"] = row["agents"]
        }
        return item
    }

    companion object {
        const val WORKSPACE_LIMIT = 20
        private const val MODEL_LENGTH = 200
        private const val MODEL_LIMIT = 200
        private const val HINT = 4

        private const val PROJECTION = """c.id, c.name, c.provider, c.base_url AS "baseUrl", c.default_model AS "defaultModel",
            c.key_hint AS "keyHint", c.models, c.last_test_state AS "lastTestState", c.last_test_code AS "lastTestCode",
            c.last_tested_at AS "lastTestedAt", c.revision, c.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM app.ai_agent_profiles p WHERE p.connection_id = c.id) AS agents"""

        /** The associated data that binds a sealed key to its connection. */
        fun context(connectionId: String) = "connection/$connectionId"

        private fun hint(key: String) = key.takeLast(HINT)
    }
}
