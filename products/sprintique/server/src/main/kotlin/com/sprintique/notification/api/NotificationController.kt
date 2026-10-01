package com.sprintique.notification.api

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.notification.application.ChannelChoice
import com.sprintique.notification.application.NotificationChannels
import com.sprintique.notification.application.Notifications
import com.sprintique.notification.application.TelegramAccounts
import com.sprintique.notification.domain.DigestLinks
import com.sprintique.notification.domain.NotificationKind
import com.sprintique.notification.domain.UnsubscribeCheck
import com.sprintique.notification.domain.UnsubscribePage
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
 * A person's notifications, their channels and Telegram (docs/decisions/0006-notifications-telegram.md,
 * 0007-notification-channels.md), the project switch «Внешние уведомления», the bot's webhook and the one-click
 * unsubscribe of a letter.
 */
@RestController
@Profile("api")
class NotificationController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val telegram: TelegramAccounts,
    private val channels: NotificationChannels,
    properties: SprintiqueProperties,
) {
    private val links = DigestLinks(properties.publicOrigin)

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
    fun settings(request: HttpServletRequest) = requests.run(request) { tx, actor -> channels.settings(tx, actor) }

    @PutMapping("/api/v1/profile/notifications")
    @Accepts(NotificationPreferencesRequest::class)
    fun changeSettings(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<NotificationPreferencesRequest>(body)
            val kinds = input.kinds
            val choice = ChannelChoice(
                email = input.channels.email,
                telegram = input.channels.telegram,
                kinds = mapOf(
                    NotificationKind.ASSIGNED to kinds.assigned,
                    NotificationKind.MENTION to kinds.mention,
                    NotificationKind.REQUEST to kinds.request,
                    NotificationKind.DEADLINE to kinds.deadline,
                ),
            )
            channels.change(tx, actor, choice)
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

    @GetMapping("/api/v1/projects/{projectId}/notifications")
    fun project(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> channels.project(tx, actor, RequestInputs.id(projectId)) }

    @PutMapping("/api/v1/projects/{projectId}/notifications")
    @Accepts(ProjectNotificationsRequest::class)
    fun changeProject(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<ProjectNotificationsRequest>(body)
        channels.changeProject(tx, actor, projectId, input.enabled, input.baseRevision)
    }

    /**
     * The «Отключить письма» link of a letter, opened in a browser: a page that asks once. Opening it changes nothing,
     * because mail scanners follow links; the page's button posts to the same address.
     */
    @GetMapping("/api/v1/notifications/unsubscribe")
    fun unsubscribePage(request: HttpServletRequest): ResponseEntity<String> {
        val token = tokenOf(request)
        return when (channels.checkUnsubscribe(token)) {
            is UnsubscribeCheck.Valid -> page(OK, UnsubscribePage.confirm("$UNSUBSCRIBE?token=$token", links.settings))
            UnsubscribeCheck.Expired -> page(GONE, UnsubscribePage.expired(links.settings))
            UnsubscribeCheck.Invalid -> page(BAD_REQUEST, UnsubscribePage.invalid(links.settings))
        }
    }

    /**
     * One-click unsubscribe (RFC 8058): the mail provider posts `List-Unsubscribe=One-Click` to the link of the
     * `List-Unsubscribe` header, without cookies; the signed token alone says whose e-mail to turn off. The body is
     * not read. The same request from the page's button gets the page that confirms it.
     */
    @PostMapping("/api/v1/notifications/unsubscribe")
    fun unsubscribe(request: HttpServletRequest): ResponseEntity<String> =
        when (channels.unsubscribe(tokenOf(request))) {
            is UnsubscribeCheck.Valid -> page(OK, UnsubscribePage.done(links.settings))
            UnsubscribeCheck.Expired -> page(GONE, UnsubscribePage.expired(links.settings))
            UnsubscribeCheck.Invalid -> page(BAD_REQUEST, UnsubscribePage.invalid(links.settings))
        }

    /** The token from the query string only (never a form field), and only when the query holds nothing else. */
    private fun tokenOf(request: HttpServletRequest): String? {
        val query = request.queryString ?: return null
        if (query.length > QUERY_LIMIT || !query.startsWith("token=") || '&' in query) return null
        return query.removePrefix("token=")
    }

    private fun page(status: Int, html: String): ResponseEntity<String> = ResponseEntity.status(status)
        .contentType(MediaType("text", "html", Charsets.UTF_8))
        .header("Content-Security-Policy", PAGE_POLICY)
        .header("Referrer-Policy", "no-referrer")
        .body(html)

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
        const val UNSUBSCRIBE = "/api/v1/notifications/unsubscribe"
        const val QUERY_LIMIT = 600
        const val OK = 200
        const val BAD_REQUEST = 400
        const val GONE = 410
        const val PAGE_POLICY =
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
        const val PAGE_MAXIMUM = 50
        const val UNAUTHORIZED = 401
        const val SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"
    }
}
