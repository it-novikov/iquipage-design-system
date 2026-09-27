package com.sprintique.task

import com.sprintique.task.domain.TaskRules
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class TaskRulesTest {
    @Test
    fun `depth counts from the root and a chain at the limit is accepted`() {
        val chain = (0..TaskRules.MAX_DEPTH).associate { "t$it" to if (it == 0) null else "t${it - 1}" }
        val depths = TaskRules.validateHierarchy(chain)
        assertThat(depths["t0"]).isZero()
        assertThat(depths["t${TaskRules.MAX_DEPTH}"]).isEqualTo(TaskRules.MAX_DEPTH)
    }

    @Test
    fun `a chain deeper than the limit, a cycle and a missing parent are refused`() {
        val tooDeep = (0..TaskRules.MAX_DEPTH + 1).associate { "t$it" to if (it == 0) null else "t${it - 1}" }
        assertThatThrownBy { TaskRules.validateHierarchy(tooDeep) }.extracting("code").isEqualTo("HIERARCHY_DEPTH")
        assertThatThrownBy { TaskRules.validateHierarchy(mapOf("a" to "b", "b" to "a")) }
            .extracting("code").isEqualTo("TASK_CYCLE")
        assertThatThrownBy { TaskRules.validateHierarchy(mapOf("a" to "missing")) }
            .extracting("code").isEqualTo("TASK_PARENT")
    }

    @Test
    fun `an accepted result is pinned`() {
        TaskRules.requireOpen("open")
        assertThatThrownBy { TaskRules.requireOpen("accepted") }.extracting("code").isEqualTo("RESULT_PINNED")
    }
}
