package com.sprintique.finance.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import com.sprintique.finance.application.FinanceCategoryContent
import com.sprintique.finance.application.FinancePlanHeader
import com.sprintique.finance.application.FinanceVarianceNoteContent
import com.sprintique.finance.application.FinanceVarianceTask
import com.sprintique.finance.domain.FinancePlanLine
import com.sprintique.finance.domain.FinanceRules
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/** Who a category is for. */
enum class FinanceCategoryDirection(@get:JsonValue val wire: String) {
    INCOME("income"),
    EXPENSE("expense"),
    BOTH("both"),
}

@Schema(name = "FinanceCategoryInput")
data class FinanceCategoryInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = CATEGORY_NAME_LIMIT)
    val name: String,
    val direction: FinanceCategoryDirection,
    val archived: Boolean = false,
) {
    fun toContent() = FinanceCategoryContent(name, direction.wire, archived)
}

@Schema(name = "PutFinanceCategory")
data class PutFinanceCategoryRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: FinanceCategoryInputRequest,
)

@Schema(name = "FinancePlanInput")
data class FinancePlanInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = PLAN_NAME_LIMIT)
    val name: String,
    @field:IsoDate
    val periodStart: String,
    @field:IsoDate
    val periodEnd: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isOrdered: Boolean get() = periodStart <= periodEnd

    fun toHeader() = FinancePlanHeader(name, periodStart, periodEnd, releaseId)
}

@Schema(name = "PutFinancePlan")
data class PutFinancePlanRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: FinancePlanInputRequest,
)

@Schema(name = "FinancePlanLineInput")
data class FinancePlanLineInputRequest(
    val direction: FinanceDirection,
    @field:Pattern(regexp = RESOURCE_ID)
    val categoryId: String,
    @field:Min(0) @field:Max(FinanceRules.MAX_AMOUNT_MINOR)
    val amountMinor: Long,
    @field:Pattern(regexp = CURRENCY_CODE)
    val currencyCode: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String? = null,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = NOTE_LIMIT)
    val note: String? = null,
) {
    fun toLine() = FinancePlanLine(direction.wire, categoryId, amountMinor, currencyCode, releaseId, note)
}

@Schema(name = "FinancePlanDraftInput")
data class FinancePlanDraftInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = NOTE_LIMIT)
    val note: String? = null,
    @field:Valid @field:Size(max = LINE_LIMIT)
    val lines: List<FinancePlanLineInputRequest>,
)

@Schema(name = "PutFinancePlanDraft")
data class PutFinancePlanDraftRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Min(1) @field:Max(VERSION_LIMIT)
    val version: Int,
    @field:Valid
    val value: FinancePlanDraftInputRequest,
)

@Schema(name = "ApproveFinancePlan")
data class ApproveFinancePlanRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Min(1) @field:Max(VERSION_LIMIT)
    val version: Int,
)

@Schema(name = "ReviseFinancePlan")
data class ReviseFinancePlanRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Min(1) @field:Max(VERSION_LIMIT)
    val version: Int,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = NOTE_LIMIT)
    val note: String? = null,
)

@Schema(name = "FinanceVarianceNoteInput")
data class FinanceVarianceNoteInputRequest(
    @field:Pattern(regexp = RESOURCE_ID)
    val planId: String,
    @field:Min(1) @field:Max(VERSION_LIMIT)
    val version: Int,
    @field:Pattern(regexp = RESOURCE_ID)
    val categoryId: String,
    val direction: FinanceDirection,
    @field:Pattern(regexp = CURRENCY_CODE)
    val currencyCode: String,
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = VARIANCE_NOTE_LIMIT)
    val text: String,
) {
    fun toContent() = FinanceVarianceNoteContent(planId, version, categoryId, direction.wire, currencyCode, text)
}

@Schema(name = "FinanceVarianceTaskInput")
data class FinanceVarianceTaskInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = TASK_TITLE_LIMIT)
    val title: String,
    @field:Pattern(regexp = RESOURCE_ID)
    val ownerId: String? = null,
    @field:IsoDate
    val due: String? = null,
) {
    fun toTask() = FinanceVarianceTask(title, ownerId, due)
}

@Schema(name = "PutFinanceVarianceNote")
data class PutFinanceVarianceNoteRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: FinanceVarianceNoteInputRequest,
    @field:Valid
    val createTask: FinanceVarianceTaskInputRequest? = null,
)

private const val CATEGORY_NAME_LIMIT = 80
private const val PLAN_NAME_LIMIT = 120
private const val NOTE_LIMIT = 300
private const val VARIANCE_NOTE_LIMIT = 500
private const val TASK_TITLE_LIMIT = 240
private const val LINE_LIMIT = 500
private const val VERSION_LIMIT = 100L
