package com.sprintique.task

import com.sprintique.task.domain.TaskMaterialRules
import com.sprintique.task.domain.TaskMaterialValue
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class TaskMaterialRulesTest {
    private fun value(url: String) = TaskMaterialValue("design", "  Макет  ", url, false)

    @Test
    fun `an external address retains query fragment and Unicode path`() {
        val address = "https://example.com/документ?version=1&x=%2F#Раздел"
        val checked = TaskMaterialRules.checked(value("  $address  "))
        assertThat(checked.url).isEqualTo(address)
        assertThat(checked.title).isEqualTo("Макет")
        val international = "https://пример.рф:443/макет?версия=2#Экран"
        assertThat(TaskMaterialRules.checked(value(international)).url).isEqualTo(international)
    }

    @Test
    fun `schemes credentials controls ambiguous hosts and invalid ports are refused`() {
        val invalid = listOf(
            "javascript:alert(1)", "data:text/html,x", "file:///tmp/a", "//example.com/a",
            "https://user:password@example.com/a", "https://@example.com/a", "https://example.com:65536/a",
            "https://example.com/a\nb", "https://example.com/a b", "https://example.com\\@other.com/a",
            "http:example.com/a", "https:///a", "https://user@пример.рф/макет", "https://пример.рф:65536/макет",
        )
        for (url in invalid) {
            assertThatThrownBy { TaskMaterialRules.checked(value(url)) }.extracting("code").isEqualTo("MATERIAL_URL")
        }
    }

    @Test
    fun `the address budget bounds UTF8 bytes rather than only characters`() {
        assertThatThrownBy { TaskMaterialRules.checked(value("https://example.com/" + "я".repeat(1100))) }
            .extracting("code").isEqualTo("MATERIAL_URL")
        assertThat(TaskMaterialRules.checked(value("https://example.com/" + "я".repeat(1000))).url).contains("я")
    }

    @Test
    fun `a blank title and an unknown category cannot enter the aggregate`() {
        assertThatThrownBy { TaskMaterialRules.checked(value("https://example.com").copy(title = "   ")) }
            .extracting("code").isEqualTo("MATERIAL_TITLE")
        assertThatThrownBy { TaskMaterialRules.checked(value("https://example.com").copy(category = "wiki")) }
            .extracting("code").isEqualTo("MATERIAL_CATEGORY")
    }
}
