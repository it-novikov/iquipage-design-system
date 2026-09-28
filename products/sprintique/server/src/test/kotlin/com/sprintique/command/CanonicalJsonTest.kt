package com.sprintique.command

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

/** The canonical form behind retry fingerprints and plan comparison. */
class CanonicalJsonTest {
    private val json = JsonMapper.builder().build()

    private fun canonical(text: String) = CommandLedger.canonical(json.readTree(text))

    @Test
    fun `keys are sorted at every level and arrays keep their order`() {
        assertThat(canonical("""{"b":1,"a":{"d":[3,1],"c":null}}"""))
            .isEqualTo(canonical("""{"a":{"c":null,"d":[3,1]},"b":1}"""))
            .isEqualTo("""{"a":{"c":null,"d":[3,1]},"b":1}""")
    }

    @Test
    fun `a number compares by value whatever its notation`() {
        assertThat(canonical("1024.0")).isEqualTo(canonical("1024")).isEqualTo(canonical("1.024E3")).isEqualTo("1024")
        assertThat(canonical("10240000")).isEqualTo(canonical("1.024E7"))
        assertThat(canonical("0.1")).isEqualTo("0.1")
        assertThat(canonical("0.0")).isEqualTo("0")
    }

    @Test
    fun `strings keep their escapes`() {
        assertThat(canonical("""{"text":"say \"да\"\n"}""")).isEqualTo("""{"text":"say \"да\"\n"}""")
    }
}
