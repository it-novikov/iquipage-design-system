package com.sprintique.notification.api

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.notification.application.Inbox
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * The inbox over REST (docs/decisions/0008-mentions-and-service-inbox.md): what a service account's token (or a
 * person) reads when it comes back to work. Reading needs the `read` scope, marking read `write`, as everywhere.
 */
@RestController
@Profile("api")
class InboxController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val properties: SprintiqueProperties,
) {
    @GetMapping("/api/v1/inbox")
    fun page(request: HttpServletRequest): Map<String, Any?> {
        val query = QueryParameters(request, setOf("unreadOnly", "cursor", "limit"))
        val unreadOnly = query.oneOf("unreadOnly", setOf("true", "false"))?.toBooleanStrict() ?: true
        val cursor = query.string("cursor", QueryParameters.CURSOR_LIMIT)
        val limit = query.int("limit", 1..Inbox.PAGE_MAXIMUM, Inbox.PAGE_LIMIT)
        return requests.run(request) { tx, actor ->
            Inbox.page(tx, actor, Inbox.Query(unreadOnly, cursor, limit), properties.publicOrigin)
        }
    }

    @PostMapping("/api/v1/inbox/read")
    @Accepts(MarkInboxReadRequest::class)
    fun markRead(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<MarkInboxReadRequest>(body)
            if (input.ids.isEmpty() && input.upTo == null) throw RequestValidationException()
            Inbox.markRead(tx, actor, input.ids.map(String::lowercase), input.upTo?.lowercase())
        }
}
