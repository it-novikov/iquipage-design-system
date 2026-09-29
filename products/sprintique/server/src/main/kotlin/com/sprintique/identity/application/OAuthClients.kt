package com.sprintique.identity.application

import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.OAuthRules
import com.sprintique.token.Tokens
import java.time.Instant

/**
 * An OAuth protocol error as RFC 6749 names it (`invalid_grant`, `invalid_client`, …). Its description is a fixed
 * text of this server, never the client's input.
 */
class OAuthException(val error: String, description: String, val status: Int = 400) : RuntimeException(description)

/** What a client declared when it registered (RFC 7591), after the server's rules. */
data class ClientRegistration(
    val name: String,
    val redirectUris: List<String>,
    val grantTypes: List<String>,
    val authMethod: String,
)

/** A registered client as the authorization server needs it. */
data class OAuthClient(
    val id: String,
    val name: String,
    val redirectUris: List<String>,
    val grantTypes: List<String>,
    val authMethod: String,
    val secretHash: String?,
    val createdAt: Instant,
) {
    val isPublic: Boolean get() = authMethod == "none"
}

/**
 * Dynamic client registration (RFC 7591), open so that a client such as Claude registers itself. Nothing the client
 * declares is fetched or trusted: its name is shown as the client's own claim, its addresses are compared by exact
 * string. Registration is limited per address (the sign-in budget), never globally, so a flood from some addresses
 * cannot close it for everyone; clients that were never connected are collected after a week, which bounds the table.
 */
object OAuthClients {
    const val NAME_LIMIT = 100
    private const val COLLECT_BATCH = 500
    private val AUTH_METHODS = setOf("none", "client_secret_post", "client_secret_basic")
    private val GRANT_TYPES = setOf("authorization_code", "refresh_token")

    /** The metadata a client sent, as loosely typed as RFC 7591 allows; unknown fields were already dropped. */
    data class Metadata(
        val redirectUris: List<String>?,
        val clientName: String?,
        val grantTypes: List<String>?,
        val responseTypes: List<String>?,
        val authMethod: String?,
    )

    fun validate(metadata: Metadata): ClientRegistration {
        val uris = metadata.redirectUris
        if (uris.isNullOrEmpty() || uris.size > OAuthRules.MAX_REDIRECT_URIS ||
            uris.any { !OAuthRules.isAllowedRedirect(it) }
        ) {
            throw OAuthException(
                "invalid_redirect_uri",
                "Redirect URIs must be 1-10 absolute https URIs or http loopback URIs without fragment or userinfo.",
            )
        }
        val grantTypes = (metadata.grantTypes ?: listOf("authorization_code")).distinct()
        if (grantTypes.any { it !in GRANT_TYPES } || "authorization_code" !in grantTypes) {
            throw OAuthException("invalid_client_metadata", "Supported grant types: authorization_code, refresh_token.")
        }
        if (metadata.responseTypes != null && metadata.responseTypes.any { it != "code" }) {
            throw OAuthException("invalid_client_metadata", "The only supported response type is code.")
        }
        // RFC 7591: without a declared method the client authenticates with HTTP Basic.
        val method = metadata.authMethod ?: "client_secret_basic"
        if (method !in AUTH_METHODS) {
            throw OAuthException(
                "invalid_client_metadata",
                "Supported token endpoint auth methods: none, client_secret_post, client_secret_basic.",
            )
        }
        val name = metadata.clientName.orEmpty().filterNot(::isHidden).trim().take(NAME_LIMIT)
        return ClientRegistration(name.ifEmpty { "Без названия" }, uris.distinct(), grantTypes, method)
    }

    /**
     * Characters a name must not carry onto the consent screen: controls, and invisible formatting such as
     * right-to-left overrides and zero-width joiners, which could make one name look like another.
     */
    private fun isHidden(char: Char): Boolean = when (Character.getType(char).toByte()) {
        Character.CONTROL, Character.FORMAT, Character.SURROGATE, Character.PRIVATE_USE, Character.UNASSIGNED,
        Character.LINE_SEPARATOR, Character.PARAGRAPH_SEPARATOR,
        -> true

        else -> false
    }

    /** Registers a client and returns the RFC 7591 response, with the secret of a confidential client shown once. */
    fun register(tx: Transaction, registration: ClientRegistration): Map<String, Any?> {
        collect(tx)
        val id = Tokens.prefixed("cl_")
        val secret = if (registration.authMethod == "none") null else Tokens.prefixed("sps_")
        val row = tx.row(
            """
            INSERT INTO auth.oauth_clients(id, name, redirect_uris, grant_types, auth_method, secret_hash)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING created_at AS "createdAt"
            """.trimIndent(),
            id,
            registration.name,
            registration.redirectUris,
            registration.grantTypes,
            registration.authMethod,
            secret?.let(Tokens::sha256Hex),
        )!!
        val response = linkedMapOf<String, Any?>(
            "client_id" to id,
            "client_id_issued_at" to row.instant("createdAt").epochSecond,
            "client_name" to registration.name,
            "redirect_uris" to registration.redirectUris,
            "grant_types" to registration.grantTypes,
            "response_types" to listOf("code"),
            "token_endpoint_auth_method" to registration.authMethod,
        )
        if (secret != null) {
            response["client_secret"] = secret
            response["client_secret_expires_at"] = 0
        }
        return response
    }

    fun find(tx: Transaction, id: String?): OAuthClient? {
        if (id == null || id.length > NAME_LIMIT * 2) return null
        return tx.row(
            """
            SELECT id, name, redirect_uris AS "redirectUris", grant_types AS "grantTypes", auth_method AS "authMethod",
                   secret_hash AS "secretHash", created_at AS "createdAt"
            FROM auth.oauth_clients WHERE id = $1
            """.trimIndent(),
            id,
        )?.let(::clientOf)
    }

    /**
     * Client authentication at the token and revocation endpoints: a public client names itself; a confidential one
     * proves its secret by the Basic header or the form, exactly one of them.
     */
    fun authenticate(tx: Transaction, credentials: ClientCredentials): OAuthClient {
        val client = find(tx, credentials.clientId)
            ?: throw OAuthException("invalid_client", "Client authentication failed.", 401)
        val valid = if (client.isPublic) {
            credentials.secret == null
        } else {
            credentials.secret != null &&
                Tokens.equalsInConstantTime(Tokens.sha256Hex(credentials.secret), client.secretHash!!)
        }
        if (!valid) throw OAuthException("invalid_client", "Client authentication failed.", 401)
        return client
    }

    /** Codes past their life and clients never connected within a week, a bounded batch at a time. */
    private fun collect(tx: Transaction) {
        tx.update(
            """
            DELETE FROM auth.oauth_codes WHERE code_hash IN (
              SELECT code_hash FROM auth.oauth_codes WHERE expires_at < clock_timestamp() - interval '1 day' LIMIT $1)
            """.trimIndent(),
            COLLECT_BATCH,
        )
        tx.update(
            """
            DELETE FROM auth.oauth_clients WHERE id IN (
              SELECT c.id FROM auth.oauth_clients c WHERE c.created_at < clock_timestamp() - interval '7 days'
                AND NOT EXISTS (SELECT 1 FROM auth.oauth_grants g WHERE g.client_id = c.id)
                AND NOT EXISTS (SELECT 1 FROM auth.oauth_codes o WHERE o.client_id = c.id)
              LIMIT $1)
            """.trimIndent(),
            COLLECT_BATCH,
        )
    }

    private fun clientOf(row: Row) = OAuthClient(
        id = row.string("id"),
        name = row.string("name"),
        redirectUris = row.strings("redirectUris"),
        grantTypes = row.strings("grantTypes"),
        authMethod = row.string("authMethod"),
        secretHash = row.stringOrNull("secretHash"),
        createdAt = row.instant("createdAt"),
    )
}

/** How a client identified itself at the token or revocation endpoint. */
data class ClientCredentials(val clientId: String?, val secret: String?)
