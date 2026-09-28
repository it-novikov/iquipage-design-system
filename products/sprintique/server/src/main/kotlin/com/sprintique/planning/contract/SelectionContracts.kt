package com.sprintique.planning.contract

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.UniqueItems
import com.sprintique.planning.domain.Maybe
import com.sprintique.planning.domain.Selection
import com.sprintique.planning.domain.SelectionFilter
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.util.Optional

/** Explicit selections are bounded; larger ones use a filter or a server-stored selection. */
const val MAX_EXPLICIT_SELECTION = 200

private val ID = Regex(RESOURCE_ID)

/** An optional, nullable identifier: absent, null or a valid id. */
internal fun validId(value: Optional<String>?) = value == null || value.map(ID::matches).orElse(true)

/** Absent stays absent, JSON null becomes a given null. */
internal fun <T : Any> maybe(value: Optional<T>?): Maybe<T?> =
    if (value == null) Maybe.Absent else Maybe.Given(value.orElse(null))

enum class PreparationFilter(@get:JsonValue val wire: String) { ALL("all"), DRAFT("draft"), READY("ready") }

enum class TagMode(@get:JsonValue val wire: String) { ANY("any"), ALL("all") }

@Schema(name = "SelectionFilter")
data class SelectionFilterContract(
    @field:Size(max = 240)
    val q: String = "",
    val matchReleaseNames: Boolean = false,
    val preparation: PreparationFilter = PreparationFilter.ALL,
    @field:Size(max = 120)
    val owner: String = "",
    /** Absent: any release; null: the backlog. */
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val releaseId: Optional<String>? = null,
    @field:Size(max = 30) @field:ResourceIds
    val tagIds: List<String> = emptyList(),
    val tagMode: TagMode = TagMode.ANY,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    @field:Size(max = MAX_EXPLICIT_SELECTION)
    @field:UniqueItems
    @field:ResourceIds
    val roots: List<String>? = null,
    val candidates: Boolean = false,
    val openOnly: Boolean = false,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isReleaseIdValid: Boolean get() = validId(releaseId)

    fun toDomain() = SelectionFilter(
        q = q,
        matchReleaseNames = matchReleaseNames,
        preparation = preparation.wire,
        owner = owner,
        releaseId = maybe(releaseId),
        tagIds = tagIds,
        tagMode = tagMode.wire,
        roots = roots,
        candidates = candidates,
        openOnly = openOnly,
    )
}

/** Which tasks a command applies to. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = SelectionContract.Tasks::class, name = "tasks"),
    JsonSubTypes.Type(value = SelectionContract.InRelease::class, name = "release"),
    JsonSubTypes.Type(value = SelectionContract.Unassigned::class, name = "unassigned"),
    JsonSubTypes.Type(value = SelectionContract.Project::class, name = "project"),
    JsonSubTypes.Type(value = SelectionContract.Matching::class, name = "filter"),
)
@Schema(name = "Selection")
sealed interface SelectionContract {
    fun toDomain(): Selection

    data class Tasks(
        @field:Size(max = MAX_EXPLICIT_SELECTION) @field:UniqueItems @field:ResourceIds
        val ids: List<String>,
    ) : SelectionContract {
        override fun toDomain() = Selection.Tasks(ids)
    }

    data class InRelease(@field:Pattern(regexp = RESOURCE_ID) val releaseId: String) : SelectionContract {
        override fun toDomain() = Selection.InRelease(releaseId)
    }

    /** Tasks without an effective release. */
    @Schema(name = "UnassignedSelection")
    class Unassigned : SelectionContract {
        override fun toDomain() = Selection.Unassigned

        override fun equals(other: Any?) = other is Unassigned

        override fun hashCode() = javaClass.hashCode()
    }

    /** Every task of the project. */
    @Schema(name = "ProjectSelection")
    class Project : SelectionContract {
        override fun toDomain() = Selection.Project

        override fun equals(other: Any?) = other is Project

        override fun hashCode() = javaClass.hashCode()
    }

    data class Matching(@field:Valid val filter: SelectionFilterContract) : SelectionContract {
        override fun toDomain() = Selection.Matching(filter.toDomain())
    }
}
