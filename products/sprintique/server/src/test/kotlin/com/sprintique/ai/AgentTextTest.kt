package com.sprintique.ai

import com.sprintique.ai.application.AgentPrompt
import com.sprintique.ai.application.CheckGate
import com.sprintique.problem.ProblemException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class AgentTextTest {
    @Test
    fun `an agent's text becomes paragraphs without list markers, code stays as written`() {
        val answer = "Сделал так:\n- прочитал задачу;\n- 2) поменял статус.\n\n1. Дальше\n* проверка\n\n" +
            "```\n- a\n+ b\n```\nКонец."
        assertThat(AgentPrompt.plain(answer)).isEqualTo(
            "Сделал так: прочитал задачу; 2) поменял статус.\n\nДальше проверка\n\n```\n- a\n+ b\n```\n\nКонец.",
        )
        assertThat(AgentPrompt.plain("Один абзац.\r\nВторая строка.")).isEqualTo("Один абзац. Вторая строка.")
        assertThat(AgentPrompt.plain("  \n\n ")).isEmpty()
    }

    @Test
    fun `the preamble tells the model to write paragraphs and is written as paragraphs itself`() {
        val system = AgentPrompt.system("Бот", "Проект", "PRJ", "assigned", emptyList(), "1. Отвечай кратко.")
        assertThat(system).contains("never bulleted or numbered lists")
        // Only the owner's own instructions may carry what they wrote; the rules of Sprintique are no list.
        val rules = system.substringBefore("## Instructions")
        assertThat(rules.lines().filter { Regex("^\\s*([-*•+]|\\d+[.)])\\s").containsMatchIn(it) }).isEmpty()
    }

    @Test
    fun `a connection is checked once at a time and a workspace a few times a minute`() {
        var now = 0L
        val gate = CheckGate().apply { clock = { now } }
        val busy = { block: () -> Unit ->
            assertThatThrownBy(block).isInstanceOf(ProblemException::class.java)
                .extracting { (it as ProblemException).code }.isEqualTo("AI_CHECK_BUSY")
        }
        gate.check("w1", "c1") {
            busy { gate.check("w1", "c1") {} }
            gate.check("w1", "c2") { busy { gate.check("w1", "c3") {} } }
            assertThat(gate.check("w2", "c9") { "another workspace" }).isEqualTo("another workspace")
        }
        // Done, the same connection may be checked again at once, up to thirty checks a minute per workspace.
        repeat(28) { gate.check("w1", "c1") {} }
        busy { gate.check("w1", "c1") {} }
        now += 61_000_000_000L
        assertThat(gate.check("w1", "c1") { "ok" }).isEqualTo("ok")
    }
}
