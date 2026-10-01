package com.sprintique.notification.api

import com.sprintique.contract.IsoDate
import com.sprintique.contract.IsoDateTime
import com.sprintique.contract.MAX_SAFE_INTEGER
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.JsonNode

// Request contracts of notifications, field for field the Zod schemas in contracts/notifications.ts.

@Schema(name = "MarkNotificationsRead")
data class MarkNotificationsReadRequest(
    // Checked one by one as UUIDs by the operation.
    @field:Size(max = 100)
    val ids: List<String> = emptyList(),
    /** Everything up to this moment: the newest notification the person saw when they chose «Прочитать все». */
    @field:IsoDateTime
    val before: String? = null,
)

@Schema(name = "NotificationChannels")
data class NotificationChannelsRequest(val email: Boolean, val telegram: Boolean)

@Schema(name = "NotificationKinds")
data class NotificationKindsRequest(
    val assigned: Boolean,
    val mention: Boolean,
    val request: Boolean,
    val deadline: Boolean,
)

@Schema(name = "NotificationPreferences")
data class NotificationPreferencesRequest(
    @field:Valid
    val channels: NotificationChannelsRequest,
    @field:Valid
    val kinds: NotificationKindsRequest,
)

/** A one-click answer to a notification: its name, a reply's text, or the date a deadline moves to. */
@Schema(name = "NotificationAction")
data class NotificationActionRequest(
    @field:Pattern(regexp = "^(take|accept|return|postpone|reply)$")
    val action: String,
    @field:Size(min = 1, max = 20_000)
    val text: String? = null,
    @field:IsoDate
    val due: String? = null,
)

/** Takes an empty object: a link carries no options. */
@Schema(name = "StartTelegramLink")
class StartTelegramLinkRequest

/** «Внешние уведомления» of a project: e-mail and Telegram together. */
@Schema(name = "ProjectNotifications")
data class ProjectNotificationsRequest(
    val enabled: Boolean,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
)

/** An update from the Bot API, as far as the webhook reads it; Telegram adds fields freely, so others are ignored. */
@Schema(name = "TelegramUpdate")
data class TelegramUpdateRequest(
    @Suppress("ConstructorParameterNaming")
    val update_id: Long,
    val message: JsonNode? = null,
    /** A press of one of the bot's buttons. */
    @Suppress("ConstructorParameterNaming")
    val callback_query: JsonNode? = null,
)
