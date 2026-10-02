package com.sprintique.finance.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.finance.domain.FinanceEntryContent
import com.sprintique.finance.domain.FinanceRules
import com.sprintique.finance.domain.FinanceStateChange
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/** An ISO 4217 alphabetic code, as the contracts accept it. */
const val CURRENCY_CODE = "^[A-Z]{3}$"

enum class FinanceDirection(@get:JsonValue val wire: String) { INCOME("income"), EXPENSE("expense") }

/** The states a writer creates an entry in; voiding is its own command. */
enum class FinanceEntryInputState(@get:JsonValue val wire: String) { PLANNED("planned"), POSTED("posted") }

@Schema(name = "FinanceEntryInput")
data class FinanceEntryInputRequest(
    val direction: FinanceDirection,
    val state: FinanceEntryInputState,
    @field:Min(1) @field:Max(FinanceRules.MAX_AMOUNT_MINOR)
    val amountMinor: Long,
    @field:Pattern(regexp = CURRENCY_CODE)
    val currencyCode: String,
    @field:IsoDate
    val dueDate: String? = null,
    @field:IsoDate
    val postedDate: String? = null,
    @field:Pattern(regexp = RESOURCE_ID)
    val categoryId: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = DESCRIPTION_LIMIT)
    val description: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = NAME_LIMIT)
    val counterparty: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = NAME_LIMIT)
    val reference: String? = null,
) {
    /** A planned entry expects money on its due date; a posted one records the day it happened. */
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isDated: Boolean
        get() = when (state) {
            FinanceEntryInputState.PLANNED -> dueDate != null && postedDate == null
            FinanceEntryInputState.POSTED -> postedDate != null
        }

    fun toContent() = FinanceEntryContent(
        direction = direction.wire,
        state = state.wire,
        amountMinor = amountMinor,
        currencyCode = currencyCode,
        dueDate = dueDate,
        postedDate = postedDate,
        categoryId = categoryId,
        releaseId = releaseId,
        description = description,
        counterparty = counterparty,
        reference = reference,
    )
}

@Schema(name = "PutFinanceEntry")
data class PutFinanceEntryRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: FinanceEntryInputRequest,
)

/** Posting a planned entry, or voiding an entry; the discriminator is the state it moves to. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "state")
@JsonSubTypes(
    JsonSubTypes.Type(value = ChangeFinanceEntryStateRequest.Posted::class, name = "posted"),
    JsonSubTypes.Type(value = ChangeFinanceEntryStateRequest.Voided::class, name = "voided"),
)
@Schema(name = "ChangeFinanceEntryState")
sealed interface ChangeFinanceEntryStateRequest {
    val baseRevision: Long

    fun toChange(): FinanceStateChange

    @Schema(name = "FinanceEntryPosting")
    data class Posted(
        @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
        override val baseRevision: Long,
        @field:IsoDate
        val postedDate: String,
        @field:Min(1) @field:Max(FinanceRules.MAX_AMOUNT_MINOR)
        val amountMinor: Long,
    ) : ChangeFinanceEntryStateRequest {
        override fun toChange() = FinanceStateChange.Posting(postedDate, amountMinor)
    }

    @Schema(name = "FinanceEntryVoiding")
    data class Voided(
        @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
        override val baseRevision: Long,
        @field:JsonDeserialize(using = TrimmedString::class)
        @field:Size(min = 1, max = VOID_REASON_LIMIT)
        val voidReason: String,
    ) : ChangeFinanceEntryStateRequest {
        override fun toChange() = FinanceStateChange.Voiding(voidReason)
    }
}

@Schema(name = "FinanceSettingsInput")
data class FinanceSettingsInputRequest(
    @field:Pattern(regexp = CURRENCY_CODE)
    val currencyCode: String,
)

@Schema(name = "PutFinanceSettings")
data class PutFinanceSettingsRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: FinanceSettingsInputRequest,
)

private const val DESCRIPTION_LIMIT = 500
private const val NAME_LIMIT = 160
private const val VOID_REASON_LIMIT = 300
