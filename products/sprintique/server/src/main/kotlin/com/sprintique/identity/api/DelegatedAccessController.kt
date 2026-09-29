package com.sprintique.identity.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UniqueItems
import com.sprintique.identity.application.AuthorizationRequest
import com.sprintique.identity.application.ConnectedApps
import com.sprintique.identity.application.OAuthAuthorizations
import com.sprintique.identity.application.PersonalTokens
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.ProblemException
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import tools.jackson.databind.annotation.JsonDeserialize
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/** The scopes of a delegated credential, by their names on the wire. */
enum class TokenScope(@get:JsonValue val wire: String, val scope: Scope) {
    READ("read", Scope.READ),
    WRITE("write", Scope.WRITE),
}

/** The person's answer on the consent screen, with the authorization request exactly as the client sent it. */
@Schema(name = "OAuthDecision")
data class OAuthDecisionRequest(
    @field:Size(min = 1, max = 4000)
    val request: String,
    val approve: Boolean,
    @field:Size(min = 1, max = 2)
    @field:UniqueItems
    val scopes: List<TokenScope>,
)

@Schema(name = "PersonalToken")
data class PersonalTokenRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Size(min = 1, max = 2)
    @field:UniqueItems
    val scopes: List<TokenScope>,
    @field:Min(1)
    @field:Max(365)
    val expiresInDays: Int,
)

/**
 * The person's side of delegated access, for the interface only (a session is required throughout): the consent
 * screen of the OAuth flow, the connected apps, the personal access tokens.
 */
@RestController
@Profile("api")
class DelegatedAccessController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val authorizations: OAuthAuthorizations,
    private val personalTokens: PersonalTokens,
) {
    /** What the consent screen shows for an authorization request (`request` is its query string). */
    @GetMapping("/api/v1/oauth/authorization")
    fun authorization(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        val query = QueryParameters(request, setOf("request")).string("request", REQUEST_LIMIT)
        authorizations.describe(tx, actor, authorizationRequest(query))
    }

    @PostMapping("/api/v1/oauth/authorizations")
    @Accepts(OAuthDecisionRequest::class)
    fun decide(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<OAuthDecisionRequest>(body)
            authorizations.decide(
                tx,
                actor,
                authorizationRequest(input.request),
                input.approve,
                input.scopes.map(TokenScope::scope).toSet(),
            )
        }

    @GetMapping("/api/v1/connected-apps")
    fun connectedApps(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        mapOf("items" to ConnectedApps.list(tx, actor))
    }

    @DeleteMapping("/api/v1/connected-apps/{id}")
    fun revokeApp(@PathVariable id: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        ConnectedApps.revoke(tx, actor, RequestInputs.id(id))
    }

    @GetMapping("/api/v1/personal-tokens")
    fun personalTokens(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        mapOf("items" to personalTokens.list(tx, actor))
    }

    /** A new token, shown once in this response. */
    @PostMapping("/api/v1/personal-tokens")
    @Accepts(PersonalTokenRequest::class)
    fun createPersonalToken(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<PersonalTokenRequest>(body)
            personalTokens.create(
                tx,
                actor,
                PersonalTokens.NewToken(input.name, input.scopes.map(TokenScope::scope).toSet(), input.expiresInDays),
            )
        }

    @DeleteMapping("/api/v1/personal-tokens/{id}")
    fun revokePersonalToken(@PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> personalTokens.revoke(tx, actor, RequestInputs.id(id)) }

    private companion object {
        const val REQUEST_LIMIT = 4000

        /**
         * The parameters of an authorize address. A parameter the flow uses may appear once (RFC 6749 §3.1); others,
         * such as `prompt`, are ignored.
         */
        fun authorizationRequest(query: String?): AuthorizationRequest {
            val invalid = ProblemException(400, "OAUTH_REQUEST_INVALID", "Некорректный запрос приложения.")
            if (query == null) throw invalid
            val values = HashMap<String, String>()
            for (pair in query.removePrefix("?").split('&').filter(String::isNotEmpty)) {
                val name = decode(pair.substringBefore('=')) ?: throw invalid
                val value = decode(pair.substringAfter('=', "")) ?: throw invalid
                if (name in KNOWN && values.put(name, value) != null) throw invalid
            }
            val get = { name: String -> values[name]?.takeIf(String::isNotEmpty) }
            return AuthorizationRequest(
                clientId = get("client_id"),
                redirectUri = get("redirect_uri"),
                responseType = get("response_type"),
                codeChallenge = get("code_challenge"),
                codeChallengeMethod = get("code_challenge_method"),
                state = get("state"),
                scope = get("scope"),
                resource = get("resource"),
            )
        }

        private val KNOWN = setOf(
            "client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope",
            "resource",
        )

        private fun decode(value: String): String? =
            runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8) }.getOrNull()
    }
}
