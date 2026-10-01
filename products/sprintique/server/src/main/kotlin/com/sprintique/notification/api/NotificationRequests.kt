package com.sprintique.notification.api

import com.sprintique.contract.IsoDateTime
import com.sprintique.contract.MAX_SAFE_INTEGER
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
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

@Schema(name = "TelegramKinds")
data class TelegramKindsRequest(
    val assigned: Boolean,
    val mention: Boolean,
    val request: Boolean,
    val deadline: Boolean,
)

@Schema(name = "NotificationPreferences")
data class NotificationPreferencesRequest(
    @field:Valid
    val telegram: TelegramKindsRequest,
)

/** Takes an empty object: a link carries no options. */
@Schema(name = "StartTelegramLink")
class StartTelegramLinkRequest

@Schema(name = "ProjectTelegram")
data class ProjectTelegramRequest(
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
)
