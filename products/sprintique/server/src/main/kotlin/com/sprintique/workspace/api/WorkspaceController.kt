package com.sprintique.workspace.api

import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.workspace.application.Workspaces
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@Profile("api")
class WorkspaceController(private val requests: AuthenticatedRequests, private val contracts: Contracts) {
    @PostMapping("/api/v1/workspaces")
    @Accepts(CreateWorkspaceRequest::class)
    fun create(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<CreateWorkspaceRequest>(body)
        Workspaces.create(tx, actor, input.name, input.timezone)
    }

    @GetMapping("/api/v1/workspaces")
    fun list(request: HttpServletRequest) = requests.run(request) { tx, actor -> Workspaces.list(tx, actor) }

    @PostMapping("/api/v1/projects")
    @Accepts(CreateProjectRequest::class)
    fun createProject(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val input = contracts.parse<CreateProjectRequest>(body)
        Workspaces.createProject(
            tx,
            actor,
            Workspaces.NewProject(input.workspaceId, input.name, input.slug, input.key, input.timezone),
        )
    }
}
