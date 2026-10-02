package com.sprintique.planning

import com.sprintique.planning.domain.Assignment
import com.sprintique.planning.domain.Destination
import com.sprintique.planning.domain.PlanChange
import com.sprintique.planning.domain.PlanningCommand
import com.sprintique.planning.domain.PlanningDefaults
import com.sprintique.planning.domain.PlanningEntity
import com.sprintique.planning.domain.PlanningRows
import com.sprintique.planning.domain.PlanningState
import com.sprintique.planning.domain.Release
import com.sprintique.planning.domain.Selection
import com.sprintique.planning.domain.TaskState
import com.sprintique.planning.domain.TemporalConstraint
import com.sprintique.planning.domain.TemporalRules
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class PlanningChangeTest {
    @Test
    fun `temporal relations use the right ends of both ranges and inclusive day boundaries`() {
        for ((relation, boundary) in listOf("FS" to -4, "SS" to 5, "FF" to 2, "SF" to 11)) {
            val state = state(
                releases = listOf(release("a", "2026-09-01", "2026-09-10"), release("b", "2026-09-06", "2026-09-12")),
                constraints = listOf(constraint(relation, boundary)),
            )
            assertThat(TemporalRules.validate(state)).isEmpty()
            // Under the r4 policy a broken constraint is a warning, never a refusal.
            val broken = TemporalRules.validate(state.copy(constraints = listOf(constraint(relation, boundary + 1))))
            assertThat(broken).hasSize(1)
            assertThat(broken.single()).contains("Даты противоречат зависимости")
        }
    }

    @Test
    fun `a task reaches the board once prepared and in a started release, keeping its work`() {
        var current = state(tasks = listOf(task("t1", status = "in_progress")), releases = listOf(release("r1")))
        current = applied(current, PlanningCommand.Prepare(Selection.Tasks(listOf("t1")), "ready"))
        current = applied(current, PlanningCommand.Assign(Selection.Tasks(listOf("t1")), Assignment.Assigned("r1")))
        assertThat(rows(current).single().boardEligible).isFalse()
        val started = PlanChange.plan(current, PlanningCommand.Start("r1"))
        val effect = started.effects.single()
        assertThat(effect.before!!.boardEligible).isFalse()
        assertThat(effect.after.boardEligible).isTrue()
        assertThat(effect.after.status).isEqualTo("in_progress")
        assertThat(effect.after.revision).isEqualTo(effect.before.revision + 1)
        assertThat(started.history!!.kind).isEqualTo("started")
        assertThat(started.releases.single().lifecycle).isEqualTo("active")
    }

    @Test
    fun `closing pins accepted tasks and moves the rest to a new release in one change`() {
        val initial = state(
            tasks = listOf(
                task(
                    "done",
                    status = "ready_for_release",
                    preparation = "ready",
                    assignmentMode = "assigned",
                    releaseId = "r1",
                ),
                task("open", assignmentMode = "assigned", releaseId = "r1"),
            ),
            releases = listOf(release("r1", lifecycle = "active")),
        )
        val close = PlanningCommand.Close(
            "r1",
            Selection.Tasks(listOf("done")),
            Destination.NewRelease(
                "r2",
                com.sprintique.planning.domain.ReleaseData("Next", "flexible", null, null, null),
            ),
            null,
        )
        val result = PlanChange.plan(initial, close)
        val after = result.effects.associate { it.id to it.after }
        assertThat(after.getValue("done").result).isEqualTo("accepted")
        assertThat(after.getValue("done").effectiveReleaseId).isEqualTo("r1")
        assertThat(after.getValue("open").effectiveReleaseId).isEqualTo("r2")
        assertThat(result.history!!.items.map { it.outcome }).containsExactly("accepted", "transferred")
        assertThat(result.releases.map { it.id to it.lifecycle }).containsExactly("r1" to "closed", "r2" to "planned")
        val closed = apply(initial, result)
        assertThatThrownBy {
            PlanChange.plan(closed, PlanningCommand.Assign(Selection.Tasks(listOf("done")), Assignment.None))
        }.extracting("code").isEqualTo("RESULT_PINNED")
    }

    @Test
    fun `assigning a subtree keeps inheriting children inheriting`() {
        val initial = state(
            tasks = listOf(task("parent"), task("child", parentId = "parent", assignmentMode = "inherit")),
            releases = listOf(release("r1")),
        )
        val result = PlanChange.plan(
            initial,
            PlanningCommand.Assign(Selection.Tasks(listOf("parent", "child")), Assignment.Assigned("r1")),
        )
        val after = result.effects.associate { it.id to it.after }
        assertThat(after.getValue("child").assignmentMode).isEqualTo("inherit")
        assertThat(after.getValue("child").effectiveReleaseId).isEqualTo("r1")
        assertThat(after.getValue("child").assignmentSourceId).isEqualTo("parent")
    }

    @Test
    fun `unchanged tasks are not effects and an empty selection is refused`() {
        val initial = state(tasks = listOf(task("a"), task("b")))
        val result = PlanChange.plan(initial, PlanningCommand.Prepare(Selection.Tasks(listOf("a")), "ready"))
        assertThat(result.effects.map { it.id }).containsExactly("a")
        assertThatThrownBy {
            PlanChange.plan(initial, PlanningCommand.Prepare(Selection.InRelease("missing"), "ready"))
        }.extracting("code").isEqualTo("EMPTY_SELECTION")
    }

    @Test
    fun `a settings command always reports the settings and a date shift past the calendar is refused`() {
        val defaults = PlanningDefaults("flexible", 14, "UTC", true)
        val late = task("t", releaseId = "r1", assignmentMode = "assigned", plannedStart = "9999-12-30")
        val initial = state(tasks = listOf(late), releases = listOf(release("r1"))).copy(defaults = defaults)
        assertThat(PlanChange.plan(initial, PlanningCommand.Settings(defaults)).defaults).isEqualTo(defaults)
        assertThatThrownBy { PlanChange.plan(initial, PlanningCommand.Shift("r1", 5)) }
            .isInstanceOf(ProblemException::class.java).extracting("code").isEqualTo("DATE_RANGE")
    }

    private fun applied(state: PlanningState, command: PlanningCommand) = apply(state, PlanChange.plan(state, command))

    /** The state after a result is written: changed tasks and releases replaced, new ones appended. */
    private fun apply(state: PlanningState, result: com.sprintique.planning.domain.PlanResult): PlanningState {
        val tasks = state.tasks.associateByTo(LinkedHashMap(), TaskState::id)
        result.tasks.forEach { tasks[it.id] = it }
        val releases = state.releases.associateByTo(LinkedHashMap(), Release::id)
        result.releases.forEach { releases[it.id] = it }
        return state.copy(tasks = tasks.values.toList(), releases = releases.values.toList())
    }

    private fun rows(state: PlanningState) = PlanningRows.project(state)

    private fun state(
        tasks: List<TaskState> = emptyList(),
        releases: List<Release> = emptyList(),
        constraints: List<TemporalConstraint> = emptyList(),
    ) = PlanningState(tasks = tasks, releases = releases, milestones = emptyList(), constraints = constraints)

    private fun constraint(relation: String, lagDays: Int) = TemporalConstraint(
        "edge",
        1,
        PlanningEntity("release", "a"),
        PlanningEntity("release", "b"),
        relation,
        lagDays,
    )

    private fun release(
        id: String,
        start: String? = null,
        end: String? = null,
        lifecycle: String = "planned",
    ) = Release(
        id = id,
        projectId = "test",
        name = id,
        revision = 1,
        scopeRevision = 0.0,
        lifecycle = lifecycle,
        format = "flexible",
        plannedStart = start,
        plannedEnd = end,
        deadline = null,
        archivedAt = null,
    )

    @Suppress("LongParameterList")
    private fun task(
        id: String,
        status: String = "ready",
        preparation: String = "draft",
        assignmentMode: String = "none",
        releaseId: String? = null,
        parentId: String? = null,
        plannedStart: String? = null,
    ) = TaskState(
        id = id,
        displayId = "T-$id",
        revision = 1,
        parentId = parentId,
        title = id,
        type = "task",
        status = status,
        attachmentIds = emptyList(),
        coverAttachmentId = null,
        coverCrop = null,
        ownerId = null,
        legacyOwner = "",
        priority = "normal",
        rank = 1024.0,
        statusEnteredAt = "2026-09-01T00:00:00.000Z",
        createdAt = "2026-09-01T00:00:00.000Z",
        preparation = preparation,
        result = "open",
        admitted = false,
        assignmentMode = assignmentMode,
        releaseId = releaseId,
        plannedStart = plannedStart,
        plannedEnd = null,
        due = null,
        tagIds = emptyList(),
    )
}
