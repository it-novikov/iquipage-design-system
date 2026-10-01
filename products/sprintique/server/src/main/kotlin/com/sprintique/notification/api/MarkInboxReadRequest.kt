package com.sprintique.notification.api

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Size

// Request contract of the inbox, field for field the Zod schema in contracts/inbox.ts.

@Schema(name = "MarkInboxRead")
data class MarkInboxReadRequest(
    // Checked one by one as UUIDs by the operation.
    @field:Size(max = 100)
    val ids: List<String> = emptyList(),
    /** Every unread item up to and including this one, in inbox order (oldest first). */
    @field:Size(max = 36)
    val upTo: String? = null,
)
