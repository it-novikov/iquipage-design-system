package com.sprintique.work.application

import com.sprintique.database.Row
import com.sprintique.problem.requireCondition
import com.sprintique.work.application.WorkCriterion
import com.sprintique.work.application.WorkStep
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Text-only bridge interchange; original bytes and unfamiliar sections survive an unchanged round trip. */
object WorkCard {
    data class Imported(
        val id: String,
        val goal: String,
        val scope: String,
        val risk: String,
        val criteria: List<WorkCriterion>,
        val steps: List<WorkStep>,
        val context: List<String>,
        val extraSections: List<String>,
    )

    fun parse(card: String): Imported {
        requireCondition(
            card.length <= WorkLimits.CARD_LIMIT &&
                card.startsWith("---\n"),
            422, "WORK_CARD_FORMAT", "Нужна карточка моста с заголовком YAML.",
        )
        val end = card.indexOf("\n---", WorkLimits.YAML_SEPARATOR)
        requireCondition(end > 0, 422, "WORK_CARD_FORMAT", "Заголовок карточки не завершён.")
        val meta = card.substring(WorkLimits.YAML_SEPARATOR, end).lines().mapNotNull {
            val colon = it.indexOf(':')
            if (colon > 0 &&
                !it.startsWith(' ')
            ) {
                it.take(colon) to it.substring(colon + 1).trim().removeSurrounding("\"")
            } else {
                null
            }
        }.toMap()
        requireCondition(
            meta["bridge"] == "1",
            422,
            "WORK_CARD_VERSION",
            "Версия формата моста не поддерживается.",
        )
        val id = meta["id"].orEmpty()
        requireCondition(
            Regex("^[0-9]{8}-[a-z0-9][a-z0-9-]{0,100}$").matches(id),
            422, "WORK_CARD_FORMAT", "Укажите допустимый id карточки.",
        )
        val sections = headings(card.substring(end + WorkLimits.YAML_SEPARATOR), "## ").drop(1).map { it.trimEnd() }
        val byName = sections.associate { it.substringBefore('\n') to it.substringAfter('\n', "").trim() }
        val goal = byName["Цель"].orEmpty()
        val risk = meta["risk"].orEmpty()
        requireCondition(
            goal.isNotBlank() &&
                goal.length <= WorkLimits.TEXT_LIMIT &&
                risk in setOf("low", "standard", "high"),
            422, "WORK_CARD_FORMAT", "Проверьте цель и уровень риска.",
        )
        val criteria = checks(byName["Приёмка"].orEmpty(), "accept")
        val steps = headings(byName["План"].orEmpty(), "### ").drop(1).mapIndexed { index, body ->
            val heading = body.substringBefore('\n')
            val marker = Regex("\\[(todo|active|done|blocked|dropped)]")
            val state = (marker.find(heading)?.groupValues?.get(1) ?: "todo").let {
                if (it ==
                    "active"
                ) {
                    "doing"
                } else {
                    it
                }
            }
            WorkStep(
                "step-${index + 1}",
                heading.replace(marker, "").substringAfter(". ", heading).trim().take(WorkLimits.TITLE_LIMIT),
                field(
                    body,
                    "Что",
                ),
                field(body, "Как"), field(body, "Зачем"), state, checks(body, "step-${index + 1}"),
                result = field(body, "Итог"),
            )
        }
        val unknown = sections.filter { it.substringBefore('\n') !in KNOWN }.map { "## $it" }
        requireCondition(
            criteria.size <= WorkLimits.LIST_LIMIT &&
                steps.size <= WorkLimits.LIST_LIMIT &&
                byName["Рамки"].orEmpty().length <= WorkLimits.SECTION_LIMIT &&
                unknown.size <= WorkLimits.EXTRA_SECTIONS &&
                unknown.all { it.length <= WorkLimits.SECTION_LIMIT },
            422, "WORK_CARD_LIMIT", "Карточка превышает предел полей плана.",
        )
        return Imported(
            id,
            goal, byName["Рамки"].orEmpty(), risk, criteria, steps,
            byName["Контекст"].orEmpty().lines().take(WorkLimits.LIST_LIMIT),
            unknown,
        )
    }

    fun render(id: String, task: Row, doc: JsonNode): String = buildString {
        val title = task.string("title").replace('\n', ' ')
        append("---\nbridge: 1\nid: ").append(id).append("\ntitle: ").append(title)
        append("\nstatus: ").append(bridgeStatus(doc.path("status").asString("draft")))
        append("\nrisk: ").append(doc.path("risk").asString("standard"))
        append("\nowner:\nbranch:\nbase:\ncreated: ").append(LocalDate.now(ZoneOffset.UTC))
        append("\nupdated: ").append(Instant.now()).append("\nlinks:\n---\n\n# ").append(title)
        section("Цель", doc.path("goal").asString())
        section("Рамки", doc.path("scope").asString())
        section("Приёмка", "")
        renderChecks(doc.path("criteria"), this)
        section(
            "Передача",
            "- **Состояние:** " + doc.path("checkpoint").path("summary").asString("План сохранён.") +
                "\n- **Дальше:** " +
                doc.path("checkpoint").path("nextStep").asString("Прочитать план и принять работу.") +
                "\n- **Незакоммичено:** нет",
        )
        section("План", "")
        doc.path("steps").values().forEachIndexed { index, step ->
            append("\n### S")
                .append(index + 1)
                .append(". ")
                .append(step.path("title").asString())
                .append(" [")
                .append(step.path("state").asString().let { if (it == "doing") "active" else it })
                .append("]\n")
            listOf("Что" to "what", "Как" to "how", "Зачем" to "why").forEach { (label, key) ->
                append("- **").append(label).append(":** ").append(step.path(key).asString()).append('\n')
            }
            append("- **Приёмка:**\n")
            renderChecks(step.path("criteria"), this, true)
            append("- **Модель:** strong\n")
            if (step.path("result").asString().isNotEmpty()) {
                append("- **Итог:** ")
                    .append(step.path("result").asString())
                    .append('\n')
            }
        }
        section("Решения", "")
        doc.path("decisions").values().forEachIndexed { index, decision ->
            append("- **D").append(index + 1).append("** ")
                .append(decision.path("text").asString().replace('\n', ' ')).append('\n')
        }
        section("Вопросы", "")
        doc.path("questions").values().forEachIndexed { index, question ->
            append("- **Q").append(index + 1).append("** [")
                .append(if (question.path("state").asString() == "answered") "answered" else "open")
                .append("] ").append(question.path("title").asString().replace('\n', ' ')).append('\n')
            question.path("answer").asString().takeIf(String::isNotBlank)?.let {
                append("  Ответ: ").append(it.replace('\n', ' ')).append('\n')
            }
        }
        section("Контекст", "")
        doc.path("context").values().forEach { append(it.asString()).append('\n') }
        doc.path("extraSections").values().forEach { append('\n').append(it.asString()).append('\n') }
    }
    private fun bridgeStatus(status: String): String = when (status) {
        "waiting" -> "blocked"
        "completed" -> "done"
        "draft", "ready", "active", "blocked", "review", "done", "cancelled" -> status
        else -> "draft"
    }

    private fun StringBuilder.section(
        name: String,
        text: String,
    ) {
        append("\n\n## ").append(name).append("\n\n").append(text).append('\n')
    }
    private fun checks(
        text: String,
        prefix: String,
    ): List<WorkCriterion> = Regex("(?m)^\\s*- \\[([ xX])] (.+)$").findAll(text).mapIndexed { index, match ->
        WorkCriterion(
            "$prefix-${index + 1}", match.groupValues[2].take(WorkLimits.SESSION_GOAL_LIMIT),
            match.groupValues[1] != " ",
        )
    }.toList()
    private fun field(
        text: String,
        label: String,
    ): String =
        Regex("(?m)^- \\*\\*$label:\\*\\* (.*)$").find(text)?.groupValues?.get(1).orEmpty().take(WorkLimits.TEXT_LIMIT)
    private fun renderChecks(criteria: JsonNode, out: StringBuilder, step: Boolean = false) {
        criteria.values().forEachIndexed { index, item ->
            out.append(if (step) "  - [" else "- [")
                .append(if (item.path("done").asBoolean()) "x" else " ").append("] ")
            if (!step) out.append("A").append(index + 1).append(". ")
            out.append(item.path("text").asString()).append('\n')
        }
    }

    private fun headings(text: String, prefix: String): List<String> {
        val result = mutableListOf<String>()
        var section = StringBuilder()
        var fenced = false
        for (line in text.lines()) {
            if (line.trimStart().startsWith("```") || line.trimStart().startsWith("~~~")) fenced = !fenced
            if (!fenced &&
                line.startsWith(prefix)
            ) {
                result.add(section.toString())
                section =
                    StringBuilder(line.removePrefix(prefix))
            } else {
                section.append('\n').append(line)
            }
        }
        result.add(section.toString())
        return result
    }

    private val KNOWN = setOf("Цель", "Рамки", "Приёмка", "Передача", "План", "Решения", "Вопросы", "Контекст")
}
