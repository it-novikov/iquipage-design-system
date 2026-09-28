package com.sprintique.apidoc

import com.sprintique.identity.api.AuthenticatedRequests
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/** The OpenAPI document (public) and the contract schemas for signed-in clients and agents. */
@RestController
@Profile("api")
class ApiDocumentationController(
    private val documentation: ApiDocumentation,
    private val contracts: PublicContracts,
    private val requests: AuthenticatedRequests,
) {
    @GetMapping("/openapi.json")
    fun openApi() = documentation.document()

    @GetMapping("/api/v1/contracts")
    fun contracts(request: HttpServletRequest) = requests.run(request) { _, _ ->
        linkedMapOf("version" to 2, "planningPolicy" to contracts.planningPolicy, "schemas" to contracts.schemas)
    }
}
