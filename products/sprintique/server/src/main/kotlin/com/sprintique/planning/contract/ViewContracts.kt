package com.sprintique.planning.contract

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.UUID
import com.sprintique.task.contract.TaskInputRequest
import com.sprintique.task.domain.TaskEstimate
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.JsonNode
import tools.jackson.databind.annotation.JsonDeserialize
import java.util.Optional

/*
 * The planning view: the projection the planning screen reads, and the intents it sends. An intent becomes a planning
 * command on the server; the screen never builds commands itself.
 */

private const val REVISION = "^\\d+$"
private const val DAY_RANGE = 36_500L
private const val SELECTION_LIMIT = 200

enum class ViewSort(@get:JsonValue val wire: String) { PLANNED("planned"), PRIORITY("priority"), DATE("date") }

enum class ViewHistory(@get:JsonValue val wire: String) { CURRENT("current"), CLOSED("closed") }

/** The filters shared by every view query. */
interface ViewFiltering {
    val query: String
    val preparation: PreparationFilter
    val sort: ViewSort
    val history: ViewHistory
    val owner: String
    val releaseId: String
    val tagIds: List<String>
    val tagMode: TagMode

    /** Only the filters, for binding cursors: paging fields excluded. */
    fun filters(): ViewFilters = ViewFilters(query, preparation, sort, history, owner, releaseId, tagIds, tagMode)
}

data class ViewFilters(
    @field:Size(max = 240) override val query: String = "",
    override val preparation: PreparationFilter = PreparationFilter.ALL,
    override val sort: ViewSort = ViewSort.PLANNED,
    override val history: ViewHistory = ViewHistory.CURRENT,
    @field:Size(max = 120) override val owner: String = "",
    @field:Size(max = 100) override val releaseId: String = "",
    @field:Size(max = 30) @field:ResourceIds override val tagIds: List<String> = emptyList(),
    override val tagMode: TagMode = TagMode.ANY,
) : ViewFiltering

@Schema(name = "ViewQuery")
data class ViewQuery(
    @field:Size(max = 240) override val query: String = "",
    override val preparation: PreparationFilter = PreparationFilter.ALL,
    override val sort: ViewSort = ViewSort.PLANNED,
    override val history: ViewHistory = ViewHistory.CURRENT,
    @field:Size(max = 120) override val owner: String = "",
    @field:Size(max = 100) override val releaseId: String = "",
    @field:Size(max = 30) @field:ResourceIds override val tagIds: List<String> = emptyList(),
    override val tagMode: TagMode = TagMode.ANY,
    @field:Size(max = 240) val cursor: String? = null,
) : ViewFiltering

@Schema(name = "ViewRowsQuery")
data class ViewRowsQuery(
    @field:Size(max = 240) override val query: String = "",
    override val preparation: PreparationFilter = PreparationFilter.ALL,
    override val sort: ViewSort = ViewSort.PLANNED,
    override val history: ViewHistory = ViewHistory.CURRENT,
    @field:Size(max = 120) override val owner: String = "",
    @field:Size(max = 100) override val releaseId: String = "",
    @field:Size(max = 30) @field:ResourceIds override val tagIds: List<String> = emptyList(),
    override val tagMode: TagMode = TagMode.ANY,
    @field:Size(max = 240) val cursor: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val groupId: String,
    @field:Pattern(regexp = REVISION) val revision: String,
    @field:Size(max = 1000) @field:ResourceIds val collapsedTaskIds: List<String> = emptyList(),
) : ViewFiltering

@Schema(name = "ViewSelectQuery")
data class ViewSelectQuery(
    @field:Size(max = 240) override val query: String = "",
    override val preparation: PreparationFilter = PreparationFilter.ALL,
    override val sort: ViewSort = ViewSort.PLANNED,
    override val history: ViewHistory = ViewHistory.CURRENT,
    @field:Size(max = 120) override val owner: String = "",
    @field:Size(max = 100) override val releaseId: String = "",
    @field:Size(max = 30) @field:ResourceIds override val tagIds: List<String> = emptyList(),
    override val tagMode: TagMode = TagMode.ANY,
    @field:Size(min = 1, max = SELECTION_LIMIT) @field:ResourceIds val taskIds: List<String>? = null,
) : ViewFiltering

enum class OptionKind(@get:JsonValue val wire: String) {
    DESTINATIONS("destinations"),
    TASKS("tasks"),
    OWNER("owner"),
    TAGS("tags"),
    POSITIONS("positions"),
}

@Schema(name = "ViewOptionsQuery")
data class ViewOptionsQuery(
    val kind: OptionKind,
    @field:Size(max = 240) val query: String = "",
    @field:Size(max = 240) val cursor: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val excludeId: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val taskId: String? = null,
)

@Schema(name = "ViewReleaseQuery")
data class ViewReleaseQuery(
    @field:Pattern(regexp = RESOURCE_ID) val groupId: String,
    @field:Size(max = 3000) val cursor: String? = null,
)

@Schema(name = "ViewReleaseValue")
data class ViewReleaseValue(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    val format: ReleaseFormat,
    @field:IsoDate val start: String?,
    @field:IsoDate val end: String?,
    @field:IsoDate val deadline: String?,
    /** One line about what it is for; left out keeps the current goal, null clears it. */
    val goal: Optional<String>? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isGoalValid: Boolean get() = goal == null || goal.map { it.trim().length <= GOAL_LIMIT }.orElse(true)

    fun toCommandValue() = linkedMapOf<String, Any?>(
        "name" to name,
        "format" to format.wire,
        "plannedStart" to start,
        "plannedEnd" to end,
        "deadline" to deadline,
    ).apply { if (goal != null) put("goal", goal.orElse(null)) }
}

/** The containers of the planning screen; the body is an empty object. */
@Schema(name = "ViewContainersQuery")
class ViewContainersQuery

/** One undo item of a move: where a task was, as it decided that itself, and its rank. */
data class RestoreItemValue(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Pattern(regexp = RESOURCE_ID) val containerId: String,
    val inherit: Boolean,
    val rank: Double,
    val admitted: Boolean? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isRankFinite: Boolean get() = rank.isFinite()
}

/** The undo of a move, handed back exactly as the move returned it. */
data class RestoreValue(
    val kind: RestoreKind,
    @field:Pattern(regexp = REVISION) val expectedRevision: String,
    @field:Size(min = 1, max = RESTORE_LIMIT) val items: List<@Valid RestoreItemValue>,
)

enum class RestoreKind(@get:JsonValue val wire: String) { RESTORE("restore") }

/**
 * A move of tasks into a container after a root row, or the undo of an earlier one: exactly one of the two forms.
 * People apply it directly; agents propose a `place` intent instead.
 */
@Schema(name = "ViewMoveRequest")
data class ViewMoveRequest(
    @field:Size(min = 1, max = SELECTION_LIMIT) @field:ResourceIds val ids: List<String>? = null,
    @field:Pattern(regexp = RESOURCE_ID) val containerId: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val afterId: String? = null,
    val withChildren: Boolean = true,
    @field:Pattern(regexp = REVISION) val expectedRevision: String? = null,
    @field:Valid val restore: RestoreValue? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isOneForm: Boolean get() = (restore == null) == (ids != null && containerId != null) &&
        (restore == null || (afterId == null && expectedRevision == null))
}

private const val RESTORE_LIMIT = 2000

/** Calendar intents: alone, or several in a batch. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = ViewIntent.Schedule::class, name = "schedule"),
    JsonSubTypes.Type(value = ViewIntent.Temporal::class, name = "temporal"),
    JsonSubTypes.Type(value = ViewIntent.RemoveTemporal::class, name = "removeTemporal"),
)
sealed interface CalendarIntent : ViewIntent {
    val expectedProjectionRevision: String?
}

/** What the planning screen asks for; the server turns it into a planning command and previews it. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = ViewIntent.TaskEdit::class, name = "taskEdit"),
    JsonSubTypes.Type(value = ViewIntent.TaskCreate::class, name = "taskCreate"),
    JsonSubTypes.Type(value = ViewIntent.Prepare::class, name = "prepare"),
    JsonSubTypes.Type(value = ViewIntent.Unprepare::class, name = "unprepare"),
    JsonSubTypes.Type(value = ViewIntent.Take::class, name = "take"),
    JsonSubTypes.Type(value = ViewIntent.Move::class, name = "move"),
    JsonSubTypes.Type(value = ViewIntent.Reorder::class, name = "reorder"),
    JsonSubTypes.Type(value = ViewIntent.Bulk::class, name = "bulk"),
    JsonSubTypes.Type(value = ViewIntent.Start::class, name = "start"),
    JsonSubTypes.Type(value = ViewIntent.EditRelease::class, name = "editRelease"),
    JsonSubTypes.Type(value = ViewIntent.CreateRelease::class, name = "createRelease"),
    JsonSubTypes.Type(value = ViewIntent.Close::class, name = "close"),
    JsonSubTypes.Type(value = ViewIntent.Cancel::class, name = "cancel"),
    JsonSubTypes.Type(value = ViewIntent.Schedule::class, name = "schedule"),
    JsonSubTypes.Type(value = ViewIntent.Temporal::class, name = "temporal"),
    JsonSubTypes.Type(value = ViewIntent.RemoveTemporal::class, name = "removeTemporal"),
    JsonSubTypes.Type(value = ViewIntent.Batch::class, name = "batch"),
    JsonSubTypes.Type(value = ViewIntent.Milestone::class, name = "milestone"),
    JsonSubTypes.Type(value = ViewIntent.Settings::class, name = "settings"),
    JsonSubTypes.Type(value = ViewIntent.ShiftDates::class, name = "shiftDates"),
    JsonSubTypes.Type(value = ViewIntent.Place::class, name = "place"),
)
@Schema(name = "ViewIntent")
sealed interface ViewIntent {
    /** Intents on selected tasks: explicit ids or a server-stored selection, never both. */
    interface Selecting {
        val taskIds: List<String>?
        val selectionToken: String?
        val expectedProjectionRevision: String?
    }

    data class TaskEdit(
        @field:Pattern(regexp = RESOURCE_ID) val taskId: String,
        @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
        @field:Valid val task: TaskInputRequest,
    ) : ViewIntent

    data class TaskCreate(
        @field:Pattern(regexp = RESOURCE_ID) val taskId: String,
        @field:Valid val task: TaskInputRequest,
        val createInBoard: Boolean = false,
    ) : ViewIntent

    data class Prepare(
        @field:Size(max = SELECTION_LIMIT) @field:ResourceIds override val taskIds: List<String>? = null,
        @field:Pattern(regexp = UUID) override val selectionToken: String? = null,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : ViewIntent, Selecting

    data class Unprepare(
        @field:Size(max = SELECTION_LIMIT) @field:ResourceIds override val taskIds: List<String>? = null,
        @field:Pattern(regexp = UUID) override val selectionToken: String? = null,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : ViewIntent, Selecting

    /** Admits the selected tasks to the board. */
    data class Take(
        @field:Size(max = SELECTION_LIMIT) @field:ResourceIds override val taskIds: List<String>? = null,
        @field:Pattern(regexp = UUID) override val selectionToken: String? = null,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : ViewIntent, Selecting

    data class Move(
        @field:Pattern(regexp = RESOURCE_ID) val groupId: String,
        @field:Size(max = SELECTION_LIMIT) @field:ResourceIds override val taskIds: List<String>? = null,
        @field:Pattern(regexp = UUID) override val selectionToken: String? = null,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : ViewIntent, Selecting

    /** One task placed before [beforeId] among its siblings, or at their end. */
    data class Reorder(
        @field:Size(min = 1, max = 1) @field:ResourceIds val taskIds: List<String>,
        @field:Pattern(regexp = RESOURCE_ID) val beforeId: String?,
        @field:Pattern(regexp = REVISION) val expectedProjectionRevision: String? = null,
    ) : ViewIntent

    /** Sets one field of the selected tasks: owner (member id), priority, due date, or tags to add. */
    data class Bulk(
        val field: BulkField,
        val value: JsonNode?,
        @field:Size(max = SELECTION_LIMIT) @field:ResourceIds override val taskIds: List<String>? = null,
        @field:Pattern(regexp = UUID) override val selectionToken: String? = null,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : ViewIntent, Selecting {
        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isValueValid: Boolean
            get() = value == null || value.isNull || (value.isString && value.asString().length <= OWNER_TEXT) ||
                (
                    value.isArray && value.size() <= TAG_LIMIT &&
                        value.values().all { it.isString && ID.matches(it.asString()) }
                    ) || isEstimate(value)

        /** An estimate `{value, unit}` goes only with the estimate field, and only there. */
        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isFieldValid: Boolean
            get() = (this.field == BulkField.ESTIMATE) == (value != null && value.isObject) ||
                (this.field == BulkField.ESTIMATE && (value == null || value.isNull))

        private fun isEstimate(value: JsonNode): Boolean {
            if (!value.isObject || value.size() != 2) return false
            val number = value.path("value")
            val unit = value.path("unit").asString("")
            return number.isNumber && TaskEstimate.valid(number.asDouble(), unit)
        }
    }

    enum class BulkField(@get:JsonValue val wire: String) {
        OWNER("owner"),
        PRIORITY("priority"),
        DUE("due"),
        TAGS("tags"),
        ESTIMATE("estimate"),
    }

    data class Start(@field:Pattern(regexp = RESOURCE_ID) val groupId: String) : ViewIntent

    data class EditRelease(
        @field:Pattern(regexp = RESOURCE_ID) val groupId: String,
        @field:Valid val values: ViewReleaseValue,
    ) : ViewIntent

    data class CreateRelease(@field:Valid val values: ViewReleaseValue) : ViewIntent

    /** Ends a release, sending the rest to one destination and single tasks elsewhere. */
    interface Finishing {
        val groupId: String
        val acceptAllCandidates: Boolean
        val destinationId: String?
        val newRelease: ViewReleaseValue?
        val destinations: Map<String, String>

        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isDestinationsValid: Boolean
            get() = destinations.size <= SELECTION_LIMIT &&
                destinations.all { (task, to) -> ID.matches(task) && ID.matches(to) }
    }

    data class Close(
        @field:Pattern(regexp = RESOURCE_ID) override val groupId: String,
        override val acceptAllCandidates: Boolean = false,
        @field:Pattern(regexp = RESOURCE_ID) override val destinationId: String? = null,
        @field:Valid override val newRelease: ViewReleaseValue? = null,
        override val destinations: Map<String, String> = emptyMap(),
    ) : ViewIntent, Finishing

    data class Cancel(
        @field:Pattern(regexp = RESOURCE_ID) override val groupId: String,
        override val acceptAllCandidates: Boolean = false,
        @field:Pattern(regexp = RESOURCE_ID) override val destinationId: String? = null,
        @field:Valid override val newRelease: ViewReleaseValue? = null,
        override val destinations: Map<String, String> = emptyMap(),
    ) : ViewIntent, Finishing

    data class ScheduleValues(
        @field:IsoDate val start: String?,
        @field:IsoDate val end: String?,
        val deadline: Optional<String>? = null,
    )

    data class Schedule(
        val entityKind: EntityKind,
        @field:Pattern(regexp = RESOURCE_ID) val entityId: String,
        @field:Valid val values: ScheduleValues,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : CalendarIntent

    data class TemporalValues(
        @field:Pattern(regexp = RESOURCE_ID) val fromId: String,
        @field:Pattern(regexp = RESOURCE_ID) val toId: String,
        val type: Relation,
        @field:Min(-DAY_RANGE) @field:Max(DAY_RANGE) val lagDays: Int,
    )

    data class Temporal(
        @field:Pattern(regexp = RESOURCE_ID) val entityId: String? = null,
        @field:Valid val values: TemporalValues,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : CalendarIntent

    data class RemoveTemporal(
        @field:Pattern(regexp = RESOURCE_ID) val entityId: String,
        @field:Pattern(regexp = REVISION) override val expectedProjectionRevision: String? = null,
    ) : CalendarIntent

    data class Batch(
        @field:Size(min = 1, max = 100) val actions: List<@Valid CalendarIntent>,
        @field:Pattern(regexp = REVISION) val expectedProjectionRevision: String? = null,
    ) : ViewIntent

    data class MilestoneValues(
        @field:JsonDeserialize(using = TrimmedString::class)
        @field:Size(min = 1, max = 240)
        val title: String,
        @field:IsoDate val date: String?,
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String?,
    )

    data class Milestone(
        @field:Pattern(regexp = RESOURCE_ID) val entityId: String? = null,
        @field:Valid val values: MilestoneValues,
    ) : ViewIntent

    /** Estimate settings left out keep the stored ones; changing the format never rewrites estimates. */
    data class SettingsValues(
        val format: ReleaseFormat,
        val days: Int,
        @field:Size(max = 100) val timeZone: String,
        val inheritTimeZone: Boolean? = null,
        val estimateFormat: EstimateFormat? = null,
        @field:Min(1) @field:Max(24) val hoursPerDay: Int? = null,
        @field:Min(1) @field:Max(168) val hoursPerWeek: Int? = null,
    )

    data class Settings(@field:Valid val values: SettingsValues) : ViewIntent

    data class ShiftDates(
        @field:Pattern(regexp = RESOURCE_ID) val groupId: String,
        @field:Min(-DAY_RANGE) @field:Max(DAY_RANGE) val days: Int,
    ) : ViewIntent

    /** The proposal form of a move, for agents: previewed and approved by a person like any planning change. */
    data class Place(
        @field:Size(min = 1, max = SELECTION_LIMIT) @field:ResourceIds val ids: List<String>,
        @field:Pattern(regexp = RESOURCE_ID) val containerId: String,
        @field:Pattern(regexp = RESOURCE_ID) val afterId: String? = null,
        val withChildren: Boolean = true,
    ) : ViewIntent

    companion object {
        private val ID = Regex(RESOURCE_ID)
        private const val OWNER_TEXT = 120
        private const val TAG_LIMIT = 30
    }
}
