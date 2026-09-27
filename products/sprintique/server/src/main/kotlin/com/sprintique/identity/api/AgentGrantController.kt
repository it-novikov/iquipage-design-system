package com.sprintique.identity.api

import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UniqueItems
import com.sprintique.identity.application.AgentGrants
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Capability
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import tools.jackson.databind.annotation.JsonDeserialize

/** The capabilities an administrator can grant an agent, by their names on the wire. */
enum class GrantedCapability(@get:JsonValue val wire: String, val capability: Capability) {
    TASKS_READ("tasks:read", Capability.TASKS_READ),
    TASKS_WRITE("tasks:write", Capability.TASKS_WRITE),
    THREADS_READ("threads:read", Capability.THREADS_READ),
    THREADS_WRITE("threads:write", Capability.THREADS_WRITE),
    MAPS_READ("maps:read", Capability.MAPS_READ),
    MAPS_WRITE("maps:write", Capability.MAPS_WRITE),
}

@Schema(name = "AgentGrant")
data class AgentGrantRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    @field:Size(min = 1, max = 6)
    @field:UniqueItems
    val capabilities: List<GrantedCapability>,
    @field:Min(60)
    @field:Max(86_400)
    val expiresInSeconds: Long,
)

@RestController
@Profile("api")
class AgentGrantController(private val requests: AuthenticatedRequests, private val contracts: Contracts) {
    @PostMapping("/api/v1/projects/{projectId}/agents")
    @Accepts(AgentGrantRequest::class)
    fun issue(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            RequestInputs.id(projectId)
            ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
            val input = contracts.parse<AgentGrantRequest>(body)
            val capabilities = input.capabilities.map(GrantedCapability::capability)
            AgentGrants.issue(tx, actor, projectId, AgentGrants.Grant(input.name, capabilities, input.expiresInSeconds))
        }

    @DeleteMapping("/api/v1/projects/{projectId}/agents/{id}")
    fun revoke(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
        AgentGrants.revoke(tx, actor, projectId, id)
    }
}
