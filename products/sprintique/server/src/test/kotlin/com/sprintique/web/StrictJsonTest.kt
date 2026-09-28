package com.sprintique.web

import com.sprintique.contract.Contracts
import jakarta.validation.Validation
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

/** Request bodies are read the way the Zod contracts define them: a nullable field is still a required one. */
class StrictJsonTest {
    data class Item(val id: String, val label: String?)

    data class Change(
        val baseRevision: Int,
        val role: String?,
        val note: String? = null,
        val items: List<Item> = emptyList(),
    )

    private val json = JsonMapper.builder().also { JsonConfiguration().strictJsonMapper().customize(it) }.build()
    private val contracts = Contracts(json, Validation.buildDefaultValidatorFactory().validator)

    private fun read(body: String) = contracts.parse<Change>(json.readTree(body))

    @Test
    fun `a required field may be null but not missing, and a field with a default may be left out`() {
        assertThat(read("""{"baseRevision":1,"role":null}""")).isEqualTo(Change(1, null))
        assertThat(read("""{"baseRevision":1,"role":"admin","note":"x","items":[{"id":"a","label":null}]}"""))
            .isEqualTo(Change(1, "admin", "x", listOf(Item("a", null))))
        assertThatThrownBy { read("""{"baseRevision":1}""") }.isInstanceOf(RequestValidationException::class.java)
        assertThatThrownBy { read("""{"role":null}""") }.isInstanceOf(RequestValidationException::class.java)
        assertThatThrownBy { read("""{"baseRevision":1,"role":null,"items":[{"id":"a"}]}""") }
            .isInstanceOf(RequestValidationException::class.java)
    }
}
