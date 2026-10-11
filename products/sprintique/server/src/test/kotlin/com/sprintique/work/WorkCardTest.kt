package com.sprintique.work

import com.sprintique.database.Row
import com.sprintique.work.application.WorkCard
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

class WorkCardTest {
    private val json = JsonMapper.builder().build()

    @Test
    fun `headings in fences are task material and active bridge state survives`() {
        val card = """
            ---
            bridge: 1
            id: 20261011-example
            risk: standard
            ---
            ## Цель
            Проверить импорт.
            ## Приёмка
            - [ ] A1. Есть результат.
            ## План
            ### S1. Проверка [active]
            - **Что:** Прочитать данные.
            - **Приёмка:**
              - [ ] Не потерять текст.
            ## Контекст
            ```markdown
            ## Пример заголовка
            ### Это не шаг
            ```
            ## Неизвестный раздел
            Сохранить данные.
        """.trimIndent()
        val imported = WorkCard.parse(card)
        assertThat(imported.steps).hasSize(1)
        assertThat(imported.steps.single().state).isEqualTo("doing")
        assertThat(imported.context.joinToString("\n")).contains("## Пример заголовка")
        assertThat(imported.extraSections).containsExactly("## Неизвестный раздел\nСохранить данные.")
    }

    @Test
    fun `canonical export is readable by the bridge grammar`() {
        val doc = json.readTree(
            """{"risk":"standard","goal":"Цель","criteria":[{"id":"C1","text":"Проверка","done":false}],
               "steps":[{"id":"S1","title":"Шаг","state":"doing",
               "criteria":[{"id":"C2","text":"Итог","done":false}]}]}""",
        )
        val card = WorkCard.render("20261011-example", Row(mapOf("title" to "Задача")), doc)
        assertThat(card).contains("- [ ] A1. Проверка", "  - [ ] Итог", "### S1. Шаг [active]")
        assertThat(WorkCard.parse(card).steps.single().state).isEqualTo("doing")
    }

    @Test
    fun `canonical cards preserve working states and human answers`() {
        val task = Row(mapOf("title" to "Задача"))
        val doc = json.readTree(
            """{"status":"active","risk":"standard","goal":"Цель","questions":[
              {"id":"question-uuid","title":"Как продолжить?","state":"answered","answer":"Продолжить проверку."}]}""",
        )
        val card = WorkCard.render("20261011-example", task, doc)
        assertThat(card).contains(
            "\nstatus: active\n",
            "- **Q1** [answered] Как продолжить?",
            "  Ответ: Продолжить проверку.",
        )
            .doesNotContain("[open]")
        (doc as tools.jackson.databind.node.ObjectNode).put("status", "waiting")
        val waiting = WorkCard.render("20261011-example", task, doc)
        assertThat(waiting).contains("\nstatus: blocked\n")
        assertThat(WorkCard.parse(waiting).goal).isEqualTo("Цель")
    }
}
