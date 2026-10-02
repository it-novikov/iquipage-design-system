package com.sprintique.planning.contract

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.ResourceIds
import com.sprintique.contract.Timezone
import com.sprintique.contract.TrimmedString
import com.sprintique.contract.isIsoDate
import com.sprintique.planning.domain.Assignment
import com.sprintique.planning.domain.BulkFields
import com.sprintique.planning.domain.Destination
import com.sprintique.planning.domain.Maybe
import com.sprintique.planning.domain.MilestoneData
import com.sprintique.planning.domain.PlanningCommand
import com.sprintique.planning.domain.PlanningDefaults
import com.sprintique.planning.domain.PlanningEntity
import com.sprintique.planning.domain.RankChange
import com.sprintique.planning.domain.ReleaseData
import com.sprintique.planning.domain.ReleaseRules
import com.sprintique.planning.domain.ScheduleAction
import com.sprintique.planning.domain.TemporalValue
import com.sprintique.task.contract.TaskEstimateRequest
import com.sprintique.task.contract.TaskInputRequest
import com.sprintique.task.contract.TaskPriority
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize
import java.util.Optional

/*
 * The JSON contract of planning commands. It is also how a preview stores its command: applying the plan reads the
 * stored command back through the same classes.
 */

const val PLANNING_POLICY = "planning-r4.0"
private const val DAY_RANGE = 36_500L
private const val OVERRIDE_LIMIT = 200

enum class ReleaseFormat(@get:JsonValue val wire: String) { FLEXIBLE("flexible"), TIMEBOXED("timeboxed") }

enum class Preparation(@get:JsonValue val wire: String) { DRAFT("draft"), READY("ready") }

enum class EntityKind(@get:JsonValue val wire: String) { TASK("task"), RELEASE("release"), MILESTONE("milestone") }

enum class Relation(@get:JsonValue val wire: String) { FS("FS"), SS("SS"), FF("FF"), SF("SF") }

@Schema(name = "ReleaseValue")
data class ReleaseValueContract(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    val format: ReleaseFormat = ReleaseFormat.FLEXIBLE,
    @field:IsoDate
    val plannedStart: String? = null,
    @field:IsoDate
    val plannedEnd: String? = null,
    @field:IsoDate
    val deadline: String? = null,
    /** One line about what it is for; left out keeps the current goal, null clears it. */
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val goal: Optional<String>? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isScheduleValid: Boolean get() = ReleaseRules.valid(format.wire, plannedStart, plannedEnd)

    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isGoalValid: Boolean get() = goal == null || goal.map { it.trim().length <= GOAL_LIMIT }.orElse(true)

    fun toDomain() = ReleaseData(name, format.wire, plannedStart, plannedEnd, deadline, goalOf(goal))
}

/** A goal as given: absent keeps the current one; blank or null clears it. */
fun goalOf(goal: Optional<String>?): Maybe<String?> =
    if (goal == null) Maybe.Absent else Maybe.Given(goal.map { it.trim() }.filter { it.isNotEmpty() }.orElse(null))

const val GOAL_LIMIT = 240

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "mode")
@JsonSubTypes(
    JsonSubTypes.Type(value = AssignmentContract.Assigned::class, name = "assigned"),
    JsonSubTypes.Type(value = AssignmentContract.Inherit::class, name = "inherit"),
    JsonSubTypes.Type(value = AssignmentContract.None::class, name = "none"),
)
@Schema(name = "Assignment")
sealed interface AssignmentContract {
    fun toDomain(): Assignment

    data class Assigned(@field:Pattern(regexp = RESOURCE_ID) val releaseId: String) : AssignmentContract {
        override fun toDomain() = Assignment.Assigned(releaseId)
    }

    class Inherit : AssignmentContract {
        override fun toDomain() = Assignment.Inherit

        override fun equals(other: Any?) = other is Inherit

        override fun hashCode() = javaClass.hashCode()
    }

    class None : AssignmentContract {
        override fun toDomain() = Assignment.None

        override fun equals(other: Any?) = other is None

        override fun hashCode() = javaClass.hashCode()
    }
}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = DestinationContract.ToRelease::class, name = "release"),
    JsonSubTypes.Type(value = DestinationContract.NewRelease::class, name = "new"),
    JsonSubTypes.Type(value = DestinationContract.Backlog::class, name = "unassigned"),
)
@Schema(name = "Destination")
sealed interface DestinationContract {
    fun toDomain(): Destination

    data class ToRelease(@field:Pattern(regexp = RESOURCE_ID) val releaseId: String) : DestinationContract {
        override fun toDomain() = Destination.ToRelease(releaseId)
    }

    data class NewRelease(
        @field:Pattern(regexp = RESOURCE_ID) val id: String,
        @field:Valid val value: ReleaseValueContract,
    ) : DestinationContract {
        override fun toDomain() = Destination.NewRelease(id, value.toDomain())
    }

    class Backlog : DestinationContract {
        override fun toDomain() = Destination.Backlog

        override fun equals(other: Any?) = other is Backlog

        override fun hashCode() = javaClass.hashCode()
    }
}

@Schema(name = "EntityRef")
data class EntityRefContract(val kind: EntityKind, @field:Pattern(regexp = RESOURCE_ID) val id: String) {
    fun toDomain() = PlanningEntity(kind.wire, id)
}

@Schema(name = "TemporalValue")
data class TemporalValueContract(
    @field:Valid val source: EntityRefContract,
    @field:Valid val target: EntityRefContract,
    val relation: Relation,
    @field:Min(-DAY_RANGE) @field:Max(DAY_RANGE)
    val lagDays: Int,
) {
    fun toDomain() = TemporalValue(source.toDomain(), target.toDomain(), relation.wire, lagDays)
}

@Schema(name = "PlanningDefaults")
data class PlanningDefaultsContract(
    val format: ReleaseFormat,
    @field:Min(1) @field:Max(366)
    val days: Int,
    @field:Timezone
    val timezone: String,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val timezoneInherited: Boolean? = null,
    val estimateFormat: EstimateFormat = EstimateFormat.TIME,
    @field:Min(1) @field:Max(24)
    val hoursPerDay: Int = 8,
    @field:Min(1) @field:Max(168)
    val hoursPerWeek: Int = 40,
) {
    fun toDomain() =
        PlanningDefaults(format.wire, days, timezone, timezoneInherited, estimateFormat.wire, hoursPerDay, hoursPerWeek)
}

enum class EstimateFormat(@get:JsonValue val wire: String) { TIME("time"), POINTS("points") }

@Schema(name = "MilestoneValue")
data class MilestoneValueContract(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 240)
    val title: String,
    @field:IsoDate
    val date: String?,
    @field:Pattern(regexp = RESOURCE_ID)
    val releaseId: String?,
) {
    fun toDomain() = MilestoneData(title, date, releaseId)
}

@Schema(name = "RankChange")
data class RankChangeContract(@field:Pattern(regexp = RESOURCE_ID) val taskId: String, val rank: Double) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isRankFinite: Boolean get() = rank.isFinite()
}

/** Fields a bulk change sets; at least one is present. Nullable ones clear the field when given as null. */
@Schema(name = "BulkFields")
@JsonInclude(JsonInclude.Include.NON_NULL)
data class BulkFieldsContract(
    val ownerId: Optional<String>? = null,
    val priority: TaskPriority? = null,
    val plannedStart: Optional<String>? = null,
    val plannedEnd: Optional<String>? = null,
    val due: Optional<String>? = null,
    @field:Size(max = 30) @field:ResourceIds
    val addTagIds: List<String>? = null,
    @field:Valid
    val estimate: Optional<TaskEstimateRequest>? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isValid: Boolean
        get() = listOf(ownerId, priority, plannedStart, plannedEnd, due, addTagIds, estimate).any { it != null } &&
            validId(ownerId) && listOf(plannedStart, plannedEnd, due).all(::validDay) &&
            (estimate == null || estimate.map { it.isValueValid }.orElse(true))

    fun toDomain() = BulkFields(
        ownerId = maybe(ownerId),
        priority = priority?.let { Maybe.Given(it.wire) } ?: Maybe.Absent,
        plannedStart = maybe(plannedStart),
        plannedEnd = maybe(plannedEnd),
        due = maybe(due),
        addTagIds = addTagIds,
        estimate = if (estimate == null) Maybe.Absent else Maybe.Given(estimate.map { it.toDomain() }.orElse(null)),
    )
}

private fun validDay(value: Optional<String>?) = value == null || value.map(::isIsoDate).orElse(true)

/** Calendar actions: alone as a command, or in a batch. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = PlanningCommandContract.Schedule::class, name = "schedule"),
    JsonSubTypes.Type(value = PlanningCommandContract.Constraint::class, name = "constraint"),
    JsonSubTypes.Type(value = PlanningCommandContract.RemoveConstraint::class, name = "constraint.remove"),
)
@Schema(name = "ScheduleAction")
sealed interface ScheduleActionContract : PlanningCommandContract {
    override fun toDomain(): ScheduleAction
}

/** Every change planning previews before it is applied, keyed by `kind`. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes(
    JsonSubTypes.Type(value = PlanningCommandContract.TaskEdit::class, name = "task.edit"),
    JsonSubTypes.Type(value = PlanningCommandContract.TaskCreate::class, name = "task.create"),
    JsonSubTypes.Type(value = PlanningCommandContract.Prepare::class, name = "prepare"),
    JsonSubTypes.Type(value = PlanningCommandContract.Admission::class, name = "admission"),
    JsonSubTypes.Type(value = PlanningCommandContract.Assign::class, name = "assign"),
    JsonSubTypes.Type(value = PlanningCommandContract.Reparent::class, name = "reparent"),
    JsonSubTypes.Type(value = PlanningCommandContract.Rank::class, name = "rank"),
    JsonSubTypes.Type(value = PlanningCommandContract.Bulk::class, name = "bulk"),
    JsonSubTypes.Type(value = PlanningCommandContract.Start::class, name = "start"),
    JsonSubTypes.Type(value = PlanningCommandContract.ReleaseEdit::class, name = "release.edit"),
    JsonSubTypes.Type(value = PlanningCommandContract.ReleaseCreate::class, name = "release.create"),
    JsonSubTypes.Type(value = PlanningCommandContract.Close::class, name = "close"),
    JsonSubTypes.Type(value = PlanningCommandContract.Cancel::class, name = "cancel"),
    JsonSubTypes.Type(value = PlanningCommandContract.Schedule::class, name = "schedule"),
    JsonSubTypes.Type(value = PlanningCommandContract.Constraint::class, name = "constraint"),
    JsonSubTypes.Type(value = PlanningCommandContract.RemoveConstraint::class, name = "constraint.remove"),
    JsonSubTypes.Type(value = PlanningCommandContract.Milestone::class, name = "milestone"),
    JsonSubTypes.Type(value = PlanningCommandContract.Settings::class, name = "settings"),
    JsonSubTypes.Type(value = PlanningCommandContract.Shift::class, name = "shift"),
    JsonSubTypes.Type(value = PlanningCommandContract.ScheduleBatch::class, name = "schedule.batch"),
    JsonSubTypes.Type(value = PlanningCommandContract.Place::class, name = "place"),
)
@Schema(name = "PlanningCommand")
sealed interface PlanningCommandContract {
    fun toDomain(): PlanningCommand

    data class TaskEdit(
        @field:Pattern(regexp = RESOURCE_ID) val taskId: String,
        @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
        @field:Valid val task: TaskInputRequest,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.TaskEdit(taskId, baseRevision, task.toContent())
    }

    data class TaskCreate(
        @field:Pattern(regexp = RESOURCE_ID) val taskId: String,
        @field:Valid val task: TaskInputRequest,
        val createInBoard: Boolean = false,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.TaskCreate(taskId, task.toContent(), createInBoard)
    }

    data class Prepare(@field:Valid val selection: SelectionContract, val preparation: Preparation) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Prepare(selection.toDomain(), preparation.wire)
    }

    data class Admission(@field:Valid val selection: SelectionContract, val admitted: Boolean) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Admission(selection.toDomain(), admitted)
    }

    data class Assign(@field:Valid val selection: SelectionContract, @field:Valid val assignment: AssignmentContract) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Assign(selection.toDomain(), assignment.toDomain())
    }

    data class Reparent(
        @field:Pattern(regexp = RESOURCE_ID) val taskId: String,
        @field:Pattern(regexp = RESOURCE_ID) val parentId: String?,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Reparent(taskId, parentId)
    }

    /** Manual order among siblings: only the ranks change. */
    data class Rank(@field:Size(min = 1, max = 1000) val ranks: List<@Valid RankChangeContract>) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Rank(ranks.map { RankChange(it.taskId, it.rank) })
    }

    data class Bulk(@field:Valid val selection: SelectionContract, @field:Valid val fields: BulkFieldsContract) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Bulk(selection.toDomain(), fields.toDomain())
    }

    data class Start(@field:Pattern(regexp = RESOURCE_ID) val releaseId: String) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Start(releaseId)
    }

    data class ReleaseEdit(
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String,
        @field:Valid val value: ReleaseValueContract,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.ReleaseEdit(releaseId, value.toDomain())
    }

    data class ReleaseCreate(
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String,
        @field:Pattern(regexp = RESOURCE_ID) val projectId: String,
        @field:Valid val value: ReleaseValueContract,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.ReleaseCreate(releaseId, projectId, value.toDomain())
    }

    data class Close(
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String,
        @field:Valid val accepted: SelectionContract,
        @field:Valid val destination: DestinationContract,
        @field:JsonInclude(JsonInclude.Include.NON_NULL)
        val overrides: Map<String, String?>? = null,
    ) : PlanningCommandContract {
        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isOverridesValid: Boolean get() = validOverrides(overrides)

        override fun toDomain() =
            PlanningCommand.Close(releaseId, accepted.toDomain(), destination.toDomain(), overrides)
    }

    data class Cancel(
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String,
        @field:Valid val destination: DestinationContract,
        @field:JsonInclude(JsonInclude.Include.NON_NULL)
        val overrides: Map<String, String?>? = null,
    ) : PlanningCommandContract {
        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isOverridesValid: Boolean get() = validOverrides(overrides)

        override fun toDomain() = PlanningCommand.Cancel(releaseId, destination.toDomain(), overrides)
    }

    /** New dates of a task, release or milestone; a deadline left out keeps the current one. */
    data class Schedule(
        @field:Valid val entity: EntityRefContract,
        @field:IsoDate val plannedStart: String?,
        @field:IsoDate val plannedEnd: String?,
        @field:JsonInclude(JsonInclude.Include.NON_NULL)
        val deadline: Optional<String>? = null,
    ) : ScheduleActionContract {
        @get:JsonIgnore
        @get:Schema(hidden = true)
        @get:AssertTrue
        val isDeadlineValid: Boolean get() = validDay(deadline)

        override fun toDomain() =
            PlanningCommand.Schedule(entity.toDomain(), plannedStart, plannedEnd, maybe(deadline))
    }

    data class Constraint(
        @field:Pattern(regexp = RESOURCE_ID) val id: String,
        @field:Valid val value: TemporalValueContract,
    ) : ScheduleActionContract {
        override fun toDomain() = PlanningCommand.Constraint(id, value.toDomain())
    }

    data class RemoveConstraint(@field:Pattern(regexp = RESOURCE_ID) val id: String) : ScheduleActionContract {
        override fun toDomain() = PlanningCommand.RemoveConstraint(id)
    }

    data class Milestone(
        @field:Pattern(regexp = RESOURCE_ID) val id: String,
        @field:Valid val value: MilestoneValueContract,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.MilestoneChange(id, value.toDomain())
    }

    data class Settings(@field:Valid val value: PlanningDefaultsContract) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Settings(value.toDomain())
    }

    data class Shift(
        @field:Pattern(regexp = RESOURCE_ID) val releaseId: String,
        @field:Min(-DAY_RANGE) @field:Max(DAY_RANGE) val days: Int,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Shift(releaseId, days)
    }

    data class ScheduleBatch(@field:Size(min = 1, max = 100) val actions: List<@Valid ScheduleActionContract>) :
        PlanningCommandContract {
        override fun toDomain() = PlanningCommand.ScheduleBatch(actions.map { it.toDomain() })
    }

    /** Tasks put into a container after a root row, an epic with its descendants from the same container. */
    data class Place(
        @field:Size(min = 1, max = PLACE_LIMIT) @field:ResourceIds val ids: List<String>,
        @field:Pattern(regexp = RESOURCE_ID) val containerId: String,
        @field:Pattern(regexp = RESOURCE_ID) val afterId: String?,
        val withChildren: Boolean = true,
    ) : PlanningCommandContract {
        override fun toDomain() = PlanningCommand.Place(ids.distinct(), containerId, afterId, withChildren)
    }
}

const val PLACE_LIMIT = 200

private fun validOverrides(overrides: Map<String, String?>?): Boolean {
    if (overrides == null) return true
    val id = Regex(RESOURCE_ID)
    return overrides.size <= OVERRIDE_LIMIT &&
        overrides.all { (key, value) -> id.matches(key) && (value == null || id.matches(value)) }
}
