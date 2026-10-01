package com.sprintique.notification.api

import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.notification.application.Notifications
import com.sprintique.notification.application.TelegramAccounts
import com.sprintique.notification.application.TelegramChoice
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.time.Instant

/**
 * A person's notifications and their Telegram (docs/decisions/0006-notifications-telegram.md), the project switch
 * for Telegram, and the bot's webhook.
 */
@RestController
@Profile("api")
class NotificationController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val telegram: TelegramAccounts,
) {
    private val log = LoggerFactory.getLogger(NotificationController::class.java)

    @GetMapping("/api/v1/notifications")
    fun page(request: HttpServletRequest): Map<String, Any?> {
        val query = QueryParameters(request, setOf("cursor", "limit"))
        val cursor = query.string("cursor", QueryParameters.CURSOR_LIMIT)
        val limit = query.int("limit", 1..PAGE_MAXIMUM, Notifications.PAGE_LIMIT)
        return requests.run(request) { tx, actor -> Notifications.page(tx, actor, cursor, limit) }
    }

    @GetMapping("/api/v1/notifications/unread")
    fun unread(request: HttpServletRequest) = requests.run(request) { tx, actor -> Notifications.unread(tx, actor) }

    @PostMapping("/api/v1/notifications/read")
    @Accepts(MarkNotificationsReadRequest::class)
    fun markRead(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<MarkNotificationsReadRequest>(body)
            if (input.ids.isEmpty() && input.before == null) throw RequestValidationException()
            Notifications.markRead(tx, actor, input.ids.map(String::lowercase), input.before?.let(Instant::parse))
        }

    @GetMapping("/api/v1/profile/notifications")
    fun settings(request: HttpServletRequest) = requests.run(request) { tx, actor -> telegram.settings(tx, actor) }

    @PutMapping("/api/v1/profile/notifications")
    @Accepts(NotificationPreferencesRequest::class)
    fun changeSettings(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val kinds = contracts.parse<NotificationPreferencesRequest>(body).telegram
            val choice = TelegramChoice(kinds.assigned, kinds.mention, kinds.request, kinds.deadline)
            telegram.changePreferences(tx, actor, choice)
        }

    /** Takes an empty object. The answer holds the only copy of the one-time link. */
    @PostMapping("/api/v1/profile/telegram/link")
    @Accepts(StartTelegramLinkRequest::class)
    fun startLink(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest): ResponseEntity<Any> {
        val link = requests.run(request) { tx, actor ->
            if (body == null || !body.isObject || !body.isEmpty) throw RequestValidationException()
            telegram.startLink(tx, actor)
        }
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(link)
    }

    @DeleteMapping("/api/v1/profile/telegram")
    fun disconnect(request: HttpServletRequest) = requests.run(request) { tx, actor -> telegram.disconnect(tx, actor) }

    @GetMapping("/api/v1/projects/{projectId}/telegram")
    fun project(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> telegram.project(tx, actor, RequestInputs.id(projectId)) }

    @PutMapping("/api/v1/projects/{projectId}/telegram")
    @Accepts(ProjectTelegramRequest::class)
    fun changeProject(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<ProjectTelegramRequest>(body)
        telegram.changeProject(tx, actor, projectId, input.enabled, input.baseRevision)
    }

    /**
     * The Bot API webhook. Public, verified by the secret Telegram sends back in a header; once per update. A known
     * sender always gets 200 at once (an update it cannot use is dropped, so Telegram does not repeat it); a reply,
     * when there is one, rides on the answer as a Bot API method.
     */
    @PostMapping("/api/v1/telegram/webhook")
    @Accepts(TelegramUpdateRequest::class)
    fun webhook(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest): ResponseEntity<Any> {
        if (!telegram.isAvailable) return ResponseEntity.notFound().build()
        if (!telegram.acceptsSecret(request.getHeader(SECRET_HEADER))) {
            return ResponseEntity.status(UNAUTHORIZED).build()
        }
        val reply = try {
            body?.takeIf { it.isObject }?.let(telegram::handle)
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            log.warn("Telegram update not handled: {}", error.javaClass.name)
            null
        }
        return if (reply == null) {
            ResponseEntity.ok().build()
        } else {
            ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(reply)
        }
    }

    private companion object {
        const val PAGE_MAXIMUM = 50
        const val UNAUTHORIZED = 401
        const val SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"
    }
}
