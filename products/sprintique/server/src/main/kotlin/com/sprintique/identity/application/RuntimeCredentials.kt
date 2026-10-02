package com.sprintique.identity.application

import com.sprintique.database.Database
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.CredentialKind
import com.sprintique.identity.domain.PrincipalKind
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * How the agent of a service account acts (docs/decisions/0005-ai-agents.md): as the account itself, through a
 * credential of its own kind issued for one run and one project. Nobody ever holds a secret for it: its hash is of a
 * random value that is thrown away, so it is never a bearer token and is reached only by its id, inside the server.
 *
 * Every use resolves the credential again in its own transaction with the same conditions as a service token (the
 * account active, its owner the one who issued it, not revoked or expired) and sets the same row-security context as
 * a request, limited to the run's project and marked as an agent run, so changes it makes start no other run.
 */
@Component
@Profile("api")
class RuntimeCredentials(private val database: Database) {
    /** Who a run's credential is for: its account, the account's owner and the person who started the run. */
    data class RunParties(val accountId: String, val ownerId: String, val onBehalfOf: String)

    /** Issues the credential of a run, in a transaction where the account is the actor. Returns its id. */
    fun issue(tx: Transaction, parties: RunParties, projectId: String, lifetimeSeconds: Int): String {
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO auth.credentials(id, principal_id, token_hash, kind, project_id, initiator_id, on_behalf_of, expires_at)
            VALUES ($1, $2, $3, 'runtime', $4, $5, $6, clock_timestamp() + make_interval(secs => $7::int))
            """.trimIndent(),
            id,
            parties.accountId,
            Tokens.sha256Hex(Tokens.random()),
            projectId,
            parties.ownerId,
            parties.onBehalfOf,
            lifetimeSeconds,
        )
        return id
    }

    /** Runs [block] as the run's service account, in one transaction; 401 when the credential can no longer act. */
    fun <T> run(credentialId: String, runId: String, block: (Transaction, Actor) -> T): T = database.transaction { tx ->
        val row = tx.row(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, c.project_id AS "projectId", s.owner_id AS "ownerId",
                   c.on_behalf_of AS "onBehalfOf"
            FROM auth.credentials c JOIN auth.principals p ON p.id = c.principal_id
            JOIN auth.service_accounts s ON s.principal_id = p.id
            WHERE c.id = $1 AND c.kind = 'runtime' AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp()
              AND p.kind = 'service' AND p.disabled_at IS NULL AND auth.service_account_active(p.id)
              AND c.initiator_id = s.owner_id
            """.trimIndent(),
            credentialId,
        )
        val found = requirePresent(row, 401, "UNAUTHENTICATED", "Запуск агента больше не действует.")
        val actor = Actor(
            id = found.string("id"),
            name = found.string("name"),
            kind = PrincipalKind.SERVICE,
            credentialId = credentialId,
            csrf = null,
            projectId = found.string("projectId"),
            capabilities = emptySet(),
            initiatorId = found.string("ownerId"),
            credentialKind = CredentialKind.RUNTIME,
            scopes = setOf(Scope.READ, Scope.WRITE),
            onBehalfOf = found.string("onBehalfOf"),
        )
        // The run acts for the person who started it: when that person is no longer active or no longer a member of
        // the project, nothing of the run goes on.
        val person = tx.row(
            "SELECT array_to_string(app.ai_initiator_permissions($1, $2), ',') AS permissions",
            actor.projectId!!,
            actor.onBehalfOf!!,
        )?.stringOrNull("permissions")
        requireCondition(
            person != null,
            401,
            INITIATOR_LOST,
            "У того, кто запустил агента, больше нет доступа к проекту.",
        )
        context(tx, actor.id, actor.projectId, actor.initiatorId, runId, Delegation(actor.onBehalfOf, person))
        block(tx, actor)
    }

    /**
     * Runs [block] with the account as the actor of row security but without a credential: what the runner reads
     * about the run before its credential exists, through the narrow queue functions.
     */
    fun <T> asAccount(accountId: String, projectId: String, runId: String, block: (Transaction) -> T): T =
        database.transaction { tx ->
            context(tx, accountId, projectId, "", runId, null)
            block(tx)
        }

    @Suppress("LongParameterList")
    private fun context(
        tx: Transaction,
        actorId: String,
        projectId: String,
        initiatorId: String,
        runId: String,
        delegation: Delegation?,
    ) {
        tx.row(
            """
            SELECT set_config('app.actor_id', $1, true), set_config('app.project_limit', $2, true),
                   set_config('app.initiator_id', $3, true), set_config('app.agent_run', $4, true),
                   set_config('app.on_behalf_of', $5, true), set_config('app.on_behalf_project', $6, true),
                   set_config('app.on_behalf_permissions', $7, true)
            """.trimIndent(),
            actorId,
            projectId,
            initiatorId,
            runId,
            delegation?.person.orEmpty(),
            if (delegation == null) "" else projectId,
            delegation?.permissions.orEmpty(),
        )
    }

    /** The person a run acts for and their permissions in its project, read once per transaction. */
    private class Delegation(val person: String, val permissions: String)

    companion object {
        /** The person a run acts for lost access to its project or was deactivated: the run stops. */
        const val INITIATOR_LOST = "INITIATOR_ACCESS_LOST"
    }
}
