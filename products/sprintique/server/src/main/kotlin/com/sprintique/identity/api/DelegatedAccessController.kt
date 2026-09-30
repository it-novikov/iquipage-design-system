package com.sprintique.identity.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.contract.UniqueItems
import com.sprintique.identity.application.AuthorizationRequest
import com.sprintique.identity.application.OAuthAuthorizations
import com.sprintique.identity.application.ServiceAccounts
import com.sprintique.identity.domain.Scope
import com.sprintique.problem.ProblemException
import com.sprintique.web.RequestValidationException
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
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

/** A new service account made on the consent screen. */
@Schema(name = "NewServiceAccount")
data class NewServiceAccountRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Pattern(regexp = UUID)
    val workspaceId: String,
    @field:Size(min = 1, max = 100)
    @field:UniqueItems
    val projectIds: List<
        @Pattern(regexp = RESOURCE_ID)
        String,
        >,
)

/**
 * The person's answer on the consent screen, with the authorization request exactly as the client sent it. An approval
 * names the service account the app will act as: one of the person's own or a new one, exactly one of them.
 */
@Schema(name = "OAuthDecision")
data class OAuthDecisionRequest(
    @field:Size(min = 1, max = 4000)
    val request: String,
    val approve: Boolean,
    @field:Size(min = 1, max = 2)
    @field:UniqueItems
    val scopes: List<TokenScope>,
    @field:Pattern(regexp = RESOURCE_ID)
    val serviceAccountId: String? = null,
    @field:Valid
    val newServiceAccount: NewServiceAccountRequest? = null,
)

enum class ServiceAccountRoleName(@get:JsonValue val wire: String, val role: ServiceAccounts.Role) {
    READER("reader", ServiceAccounts.Role.READER),
    EDITOR("editor", ServiceAccounts.Role.EDITOR),
}

/** An explicit grant beyond the role, by the permission catalog's name; finance is never given by default. */
enum class ServiceAccountGrantName(@get:JsonValue val wire: String, val grant: ServiceAccounts.Grant) {
    FINANCE_READ("finance.read", ServiceAccounts.Grant.FINANCE_READ),
    FINANCE_WRITE("finance.write", ServiceAccounts.Grant.FINANCE_WRITE),
}

@Schema(name = "ServiceAccountProject")
data class ServiceAccountProjectRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val projectId: String,
    val role: ServiceAccountRoleName,
    @field:Size(max = 2)
    @field:UniqueItems
    val granted: List<ServiceAccountGrantName> = emptyList(),
) {
    fun toGrant() = ServiceAccounts.ProjectGrant(projectId, role.role, granted.map { it.grant }.toSet())
}

@Schema(name = "CreateServiceAccount")
data class CreateServiceAccountRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Pattern(regexp = UUID)
    val workspaceId: String,
    @field:Size(max = 100)
    @field:Valid
    val projects: List<ServiceAccountProjectRequest>,
)

@Schema(name = "RenameServiceAccount")
data class RenameServiceAccountRequest(
    @field:Min(0)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
)

@Schema(name = "ReassignServiceAccount")
data class ReassignServiceAccountRequest(
    @field:Min(0)
    @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Pattern(regexp = RESOURCE_ID)
    val ownerId: String,
)

@Schema(name = "SetServiceAccountProject")
data class SetServiceAccountProjectRequest(
    val role: ServiceAccountRoleName,
    @field:Size(max = 2)
    @field:UniqueItems
    val granted: List<ServiceAccountGrantName> = emptyList(),
)

@Schema(name = "ServiceToken")
data class ServiceTokenRequest(
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
 * The person's side of programmatic access, for the interface only (a session is required throughout): the consent
 * screen of the OAuth flow and the service accounts with their projects, tokens and connected apps.
 */
@RestController
@Profile("api")
class DelegatedAccessController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val authorizations: OAuthAuthorizations,
    private val accounts: ServiceAccounts,
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
            val choice = when {
                input.serviceAccountId != null && input.newServiceAccount != null -> throw RequestValidationException()

                input.serviceAccountId != null -> OAuthAuthorizations.AccountChoice.Existing(input.serviceAccountId)

                input.newServiceAccount != null -> input.newServiceAccount.let {
                    OAuthAuthorizations.AccountChoice.New(it.name, it.workspaceId, it.projectIds)
                }

                else -> null
            }
            authorizations.decide(
                tx,
                actor,
                authorizationRequest(input.request),
                input.approve,
                input.scopes.map(TokenScope::scope).toSet(),
                choice,
            )
        }

    @GetMapping("/api/v1/service-accounts")
    fun serviceAccounts(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        mapOf("items" to accounts.list(tx, actor))
    }

    @PostMapping("/api/v1/service-accounts")
    @Accepts(CreateServiceAccountRequest::class)
    fun create(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateServiceAccountRequest>(body)
            accounts.create(
                tx,
                actor,
                ServiceAccounts.NewAccount(
                    input.name,
                    input.workspaceId,
                    input.projects.map(ServiceAccountProjectRequest::toGrant),
                ),
            )
        }

    @PatchMapping("/api/v1/service-accounts/{id}")
    @Accepts(RenameServiceAccountRequest::class)
    fun rename(@PathVariable id: String, @RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<RenameServiceAccountRequest>(body)
            accounts.rename(tx, actor, RequestInputs.id(id), input.baseRevision, input.name)
        }

    @PostMapping("/api/v1/service-accounts/{id}/owner")
    @Accepts(ReassignServiceAccountRequest::class)
    fun reassign(
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<ReassignServiceAccountRequest>(body)
            accounts.reassign(tx, actor, RequestInputs.id(id), input.baseRevision, input.ownerId)
        }

    @DeleteMapping("/api/v1/service-accounts/{id}")
    fun delete(@PathVariable id: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        accounts.delete(tx, actor, RequestInputs.id(id))
    }

    @PutMapping("/api/v1/service-accounts/{id}/projects/{projectId}")
    @Accepts(SetServiceAccountProjectRequest::class)
    fun setProject(
        @PathVariable id: String,
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<SetServiceAccountProjectRequest>(body)
        val grant = ServiceAccounts.ProjectGrant(projectId, input.role.role, input.granted.map { it.grant }.toSet())
        accounts.setProject(tx, actor, RequestInputs.id(id), RequestInputs.id(projectId), grant)
    }

    @DeleteMapping("/api/v1/service-accounts/{id}/projects/{projectId}")
    fun removeProject(@PathVariable id: String, @PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            accounts.setProject(tx, actor, RequestInputs.id(id), RequestInputs.id(projectId), null)
        }

    /** A new token of the service account, shown once in this response. */
    @PostMapping("/api/v1/service-accounts/{id}/tokens")
    @Accepts(ServiceTokenRequest::class)
    fun createToken(
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<ServiceTokenRequest>(body)
        accounts.createToken(
            tx,
            actor,
            RequestInputs.id(id),
            ServiceAccounts.NewToken(input.name, input.scopes.map(TokenScope::scope).toSet(), input.expiresInDays),
        )
    }

    @DeleteMapping("/api/v1/service-accounts/{id}/tokens/{tokenId}")
    fun revokeToken(@PathVariable id: String, @PathVariable tokenId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            accounts.revokeToken(tx, actor, RequestInputs.id(id), RequestInputs.id(tokenId))
        }

    @DeleteMapping("/api/v1/connected-apps/{id}")
    fun revokeApp(@PathVariable id: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        accounts.revokeApp(tx, actor, RequestInputs.id(id))
    }

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
