package com.sprintique.workbench

import com.sprintique.workbench.domain.Activity
import com.sprintique.workbench.domain.Reasons
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ReasonsTest {
    private fun activity(kind: String, detail: Map<String, Any?> = emptyMap()) =
        Activity(kind, detail, "maria", "Мария", "2026-09-29T08:00:00.000Z")

    @Test
    fun `a reason is a sentence and its age is a separate fact`() {
        val reason = Reasons.request("review", "maria", "Мария", "2026-09-29T08:00:00.000Z", "2026-10-02")
        assertThat(reason.code).isEqualTo("request_to_you")
        assertThat(reason.text).isEqualTo("Мария просит проверить")
        assertThat(reason.occurredAt).isEqualTo("2026-09-29T08:00:00.000Z")
        assertThat(reason.neededBy).isEqualTo("2026-10-02")
        assertThat(Reasons.request("approval", null, null, null, null).code).isEqualTo("approval_to_you")
        val texts = listOf(
            reason.text,
            Reasons.focus().text,
            Reasons.assigned("in_progress", null).text,
            Reasons.update(activity("due", mapOf("from" to "2026-10-02", "to" to "2026-10-09")), true, "ready").text,
        )
        assertThat(texts).noneMatch { " · " in it }
    }

    @Test
    fun `compound reasons join with a comma or a colon`() {
        assertThat(Reasons.assigned("in_progress", null).text).isEqualTo("Назначено вам, в работе")
        assertThat(Reasons.assigned("review", "API-31").code).isEqualTo("your_work_blocked")
        val moved = activity("due", mapOf("from" to "2026-10-02", "to" to "2026-10-09"))
        assertThat(Reasons.update(moved, true, "ready").text)
            .isEqualTo("Вы следите: срок перенесён с 02.10 на 09.10")
        assertThat(Reasons.update(activity("request", mapOf("change" to "orphaned")), false, "ready").text)
            .isEqualTo("Ваш запрос: адресат больше не в проекте")
    }

    @Test
    fun `delegated work names completion, reassignment and a departed assignee without their name`() {
        val done = Reasons.waiting("Анна", true, "anna", "anna", "Анна", done = true, latest = null)
        assertThat(done.code).isEqualTo("delegated_completed")
        assertThat(done.text).isEqualTo("Вы поручили Анна: работа завершена")
        val moved = Reasons.waiting("Анна", true, "oleg", "anna", "Олег", done = false, latest = null)
        assertThat(moved.code).isEqualTo("delegated_reassigned")
        val gone = Reasons.waiting("Анна", false, "anna", "anna", "Анна", done = false, latest = null)
        assertThat(gone.code).isEqualTo("delegated_orphaned")
        assertThat(gone.text).doesNotContain("Анна")
        val blocked = Reasons.waiting(
            "Анна", true, "anna", "anna", "Анна", done = false,
            latest = activity("dependency", mapOf("role" to "blocked_by", "change" to "added")),
        )
        assertThat(blocked.code).isEqualTo("delegated_blocked")
        val plain = Reasons.waiting("Анна", true, "anna", "anna", "Анна", false, null)
        assertThat(plain.code).isEqualTo("delegated_by_you")
    }
}
