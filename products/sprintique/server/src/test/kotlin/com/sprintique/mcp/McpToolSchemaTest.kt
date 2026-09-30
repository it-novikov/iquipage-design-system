package com.sprintique.mcp

import com.sprintique.command.CommandLedger
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.contract.Contracts
import com.sprintique.map.application.Maps
import com.sprintique.mcp.application.McpTools
import com.sprintique.mcp.application.TaskTools
import jakarta.validation.Validation
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.SoftAssertions
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import kotlin.reflect.full.primaryConstructor

/**
 * The JSON Schema each tool publishes names exactly the fields its argument class accepts, and requires exactly the
 * ones without a default: a client that follows the schema is never refused by the parser, and the other way round.
 */
class McpToolSchemaTest {
    private val json = JsonMapper.builder().addModule(KotlinModule.Builder().build()).build()
    private val tools = McpTools(
        Contracts(json, Validation.buildDefaultValidatorFactory().validator),
        TaskTools(CommandLedger(json), SprintiqueProperties()),
        Maps(json, CommandLedger(json)),
        SprintiqueProperties(),
    )

    @Test
    fun `every tool schema matches its argument class`() {
        val soft = SoftAssertions()
        for (tool in tools.all) {
            @Suppress("UNCHECKED_CAST")
            val properties = (tool.inputSchema["properties"] as Map<String, Any?>).keys
            val parameters = tool.arguments.primaryConstructor?.parameters.orEmpty()
            soft.assertThat(properties).`as`("fields of ${tool.name}")
                .containsExactlyInAnyOrderElementsOf(parameters.mapNotNull { it.name })
            soft.assertThat(tool.inputSchema["required"] as List<*>).`as`("required fields of ${tool.name}")
                .containsExactlyInAnyOrderElementsOf(parameters.filterNot { it.isOptional }.mapNotNull { it.name })
            soft.assertThat(tool.inputSchema["additionalProperties"]).isEqualTo(false)
            soft.assertThat(tool.name).matches("^[a-z_]{1,64}$")
        }
        soft.assertAll()
    }

    @Test
    fun `only the changing tools need the write scope and there is no generic tool`() {
        assertThat(tools.all.filter { it.write }.map { it.name })
            .containsExactlyInAnyOrder("create_task", "update_task", "change_task_status", "add_task_comment")
        assertThat(tools.all.map { it.name }).noneMatch { it.contains("sql") || it.contains("execute") }
    }
}
