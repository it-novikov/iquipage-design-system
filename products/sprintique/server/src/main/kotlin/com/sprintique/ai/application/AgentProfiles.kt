package com.sprintique.ai.application

import com.sprintique.access.application.WorkspaceAccess
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * The agent of a service account (docs/decisions/0005-ai-agents.md): the connection and model it thinks with, its
 * owner's instructions, whether a task assigned to it starts it, its limits and the switch. Those who manage the
 * account (its owner, people with «Управлять людьми» in its workspace) see and change it, with their own session. The
 * agent never gets more than the account: its rights stay the account's permissions in each project.
 */
@Component
@Profile("api")
class AgentProfiles(private val box: SecretBox) {
    data class Settings(
        val baseRevision: Long,
        val enabled: Boolean,
        val connectionId: String?,
        val model: String,
        val instructions: String,
        val onAssignment: Boolean,
        val maxSteps: Int,
        val maxOutputTokens: Int,
        val runsPerHour: Int,
    )

    fun read(tx: Transaction, actor: Actor, accountId: String): Map<String, Any?> {
        val account = manage(tx, actor, accountId)
        val connections = tx.rows(
            """
            SELECT c.id, c.name, c.provider, c.default_model AS "defaultModel", c.models, c.last_test_state AS "lastTestState"
            FROM app.ai_connections c WHERE c.workspace_id = $1::uuid AND c.deleted_at IS NULL ORDER BY c.name, c.id LIMIT 50
            """.trimIndent(),
            account.string("workspaceId"),
        )
        return linkedMapOf(
            "accountId" to accountId,
            "profile" to profile(tx, accountId),
            "connections" to connections,
            "available" to box.isConfigured,
            "defaults" to linkedMapOf(
                "maxSteps" to DEFAULT_STEPS,
                "maxOutputTokens" to DEFAULT_OUTPUT,
                "runsPerHour" to DEFAULT_RUNS,
            ),
        )
    }

    fun save(tx: Transaction, actor: Actor, accountId: String, input: Settings): Map<String, Any?> {
        val account = manage(tx, actor, accountId)
        val workspaceId = account.string("workspaceId")
        if (input.connectionId != null) {
            val connection = tx.row(
                """
                SELECT 1 AS found FROM app.ai_connections
                WHERE id = $1::uuid AND workspace_id = $2::uuid AND deleted_at IS NULL
                """.trimIndent(),
                input.connectionId,
                workspaceId,
            )
            requireCondition(connection != null, 422, "AI_CONNECTION", "Выберите ИИ-подключение этого пространства.")
        }
        requireCondition(
            !input.enabled || input.connectionId != null,
            422,
            "AI_CONNECTION",
            "Чтобы включить агента, выберите ИИ-подключение.",
        )
        val current = tx.row(
            "SELECT revision FROM app.ai_agent_profiles WHERE principal_id = $1 FOR UPDATE",
            accountId,
        )
        requireCondition(
            (current?.long("revision") ?: 0L) == input.baseRevision,
            409,
            "CONFLICT",
            "Настройки агента уже изменены. Обновите страницу.",
        )
        tx.update(
            """
            INSERT INTO app.ai_agent_profiles(principal_id, workspace_id, connection_id, enabled, model, instructions,
              on_assignment, max_steps, max_output_tokens, runs_per_hour, updated_by)
            VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (principal_id) DO UPDATE SET connection_id = excluded.connection_id, enabled = excluded.enabled,
              model = excluded.model, instructions = excluded.instructions, on_assignment = excluded.on_assignment,
              max_steps = excluded.max_steps, max_output_tokens = excluded.max_output_tokens,
              runs_per_hour = excluded.runs_per_hour, updated_by = excluded.updated_by, updated_at = clock_timestamp(),
              revision = app.ai_agent_profiles.revision + 1
            """.trimIndent(),
            accountId, workspaceId, input.connectionId, input.enabled, input.model, input.instructions,
            input.onAssignment, input.maxSteps, input.maxOutputTokens, input.runsPerHour, actor.id,
        )
        WorkspaceAccess.audit(
            tx,
            actor,
            workspaceId,
            "ai.agent.changed",
            accountId,
            input.baseRevision + 1,
            mapOf("enabled" to input.enabled, "connectionId" to input.connectionId),
        )
        return read(tx, actor, accountId)
    }

    private fun profile(tx: Transaction, accountId: String): Row? = tx.row(
        """
        SELECT p.enabled, p.connection_id AS "connectionId", p.model, p.instructions, p.on_assignment AS "onAssignment",
               p.max_steps AS "maxSteps", p.max_output_tokens AS "maxOutputTokens", p.runs_per_hour AS "runsPerHour",
               p.revision, p.updated_at AS "updatedAt",
               (SELECT count(*)::int FROM app.ai_agent_runs r WHERE r.account_id = p.principal_id
                  AND r.created_at > clock_timestamp() - interval '1 hour' AND r.error_code IS DISTINCT FROM 'RUN_LIMIT')
                 AS "runsLastHour"
        FROM app.ai_agent_profiles p WHERE p.principal_id = $1
        """.trimIndent(),
        accountId,
    )

    /** The account, when the caller manages it: its owner (not suspended) or a people manager of its workspace. */
    private fun manage(tx: Transaction, actor: Actor, accountId: String): Row {
        ProjectAccess.requireInteractive(actor)
        requireCondition(actor.isHuman, 403, "HUMAN_REQUIRED", "Сервисными аккаунтами управляет человек.")
        val row = tx.row(
            """
            SELECT s.principal_id AS id, s.workspace_id::text AS "workspaceId",
                   (s.owner_id = $2 AND s.suspended_at IS NULL AND EXISTS (SELECT 1 FROM app.workspace_members w
                     WHERE w.workspace_id = s.workspace_id AND w.principal_id = $2)) OR EXISTS (
                     SELECT 1 FROM app.workspace_members w WHERE w.workspace_id = s.workspace_id
                       AND w.principal_id = $2 AND 'workspace.people' = ANY(w.permissions)) AS manages
            FROM auth.service_accounts s WHERE s.principal_id = $1 AND s.deleted_at IS NULL FOR UPDATE OF s
            """.trimIndent(),
            accountId,
            actor.id,
        )
        val found =
            requirePresent(row?.takeIf { it.boolean("manages") }, 404, "NOT_FOUND", "Сервисный аккаунт недоступен.")
        ProjectAccess.requireActiveCredential(tx, actor)
        return found
    }

    companion object {
        const val DEFAULT_STEPS = 12
        const val DEFAULT_OUTPUT = 2048
        const val DEFAULT_RUNS = 20
        const val INSTRUCTIONS_LIMIT = 8000
    }
}
