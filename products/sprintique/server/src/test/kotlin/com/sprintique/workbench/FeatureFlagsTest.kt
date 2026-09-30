package com.sprintique.workbench

import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class FeatureFlagsTest {
    @Test
    fun `nothing named means everything outside production and nothing in it`() {
        assertThat(FeatureFlags.parse("", production = false)).containsExactlyInAnyOrderElementsOf(Feature.entries)
        assertThat(FeatureFlags.parse("", production = true)).isEmpty()
        assertThat(FeatureFlags.parse(" ", production = true)).isEmpty()
    }

    @Test
    fun `all, none and an explicit list are taken as written`() {
        assertThat(FeatureFlags.parse("all", production = true)).containsExactlyInAnyOrderElementsOf(Feature.entries)
        assertThat(FeatureFlags.parse("none", production = false)).isEmpty()
        assertThat(FeatureFlags.parse("workbench_read_internal, workbench_plan_horizon", production = true))
            .containsExactlyInAnyOrder(Feature.WORKBENCH_READ_INTERNAL, Feature.WORKBENCH_PLAN_HORIZON)
    }

    @Test
    fun `a misspelt feature stops the process instead of staying silently off`() {
        assertThatThrownBy { FeatureFlags.parse("workbench_reqests", production = true) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("workbench_reqests")
    }
}
