package com.sprintique.workbench.domain

/**
 * Why a task is on a person's Workbench: a stable code for the contract and a human sentence for the row
 * (docs/adr W1–W5). The age of a reason is a separate fact (`occurredAt`), never part of the sentence.
 */
data class Reason(
    val code: String,
    val text: String,
    val actorId: String? = null,
    val actorName: String? = null,
    val occurredAt: String? = null,
    val neededBy: String? = null,
)

/** A meaningful event as the projection sees it: its kind, detail values and who caused it. */
data class Activity(
    val kind: String,
    val detail: Map<String, Any?>,
    val actorId: String?,
    val actorName: String?,
    val at: String?,
) {
    /** A dependency added on the task's own side: something now blocks it. */
    fun isNewBlocker(): Boolean = kind == "dependency" && detail["role"] == "blocked_by" && detail["change"] == "added"
}

object Reasons {
    private val STATUS = mapOf(
        "ready" to "Готово к работе",
        "in_progress" to "В работе",
        "review" to "Ревью",
        "ready_for_testing" to "Готово к тестированию",
        "testing" to "Тестирование",
        "ready_for_release" to "Готово к релизу",
    )
    private val ASKS = mapOf(
        "answer" to "просит ответить",
        "review" to "просит проверить",
        "decision" to "просит решение",
        "approval" to "просит утвердить",
    )

    fun statusLabel(status: String): String = STATUS[status] ?: status

    @Suppress("LongParameterList")
    fun request(
        kind: String,
        requesterId: String?,
        requesterName: String?,
        at: String?,
        neededBy: String?,
    ): Reason = Reason(
        code = if (kind == "approval") "approval_to_you" else "request_to_you",
        text = "${requesterName ?: "Участник проекта"} ${ASKS[kind] ?: "просит ответить"}",
        actorId = requesterId,
        actorName = requesterName,
        occurredAt = at,
        neededBy = neededBy,
    )

    fun focus(): Reason = Reason("manual_focus", "Вы добавили в фокус")

    fun assigned(status: String, blockedBy: String?): Reason = if (blockedBy != null) {
        Reason("your_work_blocked", "Назначено вам, заблокирована задачей $blockedBy")
    } else {
        Reason("assigned_active", "Назначено вам, ${statusLabel(status).lowercase()}")
    }

    fun backlog(): Reason = Reason("assigned_backlog", "Назначено вам, ещё не начата")

    /**
     * Delegated work: completion, a new blocker, another owner or a departed one are named; otherwise the plain
     * control. The expected person is named only while they are still a member of the project.
     */
    @Suppress("LongParameterList")
    fun waiting(
        expectedName: String?,
        expectedIsMember: Boolean,
        ownerId: String?,
        expectedId: String?,
        ownerName: String?,
        done: Boolean,
        latest: Activity?,
    ): Reason {
        // Names are not declined in Russian here, so the person follows a colon: "Поручено: Анна, работа завершена".
        val who = if (expectedIsMember && expectedName != null) "Поручено: $expectedName" else "Вы ждёте результат"
        return when {
            done -> Reason(
                "delegated_completed",
                "$who, работа завершена",
                latest?.actorId,
                latest?.actorName,
                latest?.at,
            )

            !expectedIsMember && ownerId == expectedId ->
                Reason("delegated_orphaned", "Исполнитель больше не в проекте")

            ownerId != expectedId -> Reason(
                "delegated_reassigned",
                if (ownerName != null) "$who, сейчас исполняет $ownerName" else "$who, исполнитель снят",
            )

            latest?.isNewBlocker() == true ->
                Reason("delegated_blocked", "$who, появилась блокировка", latest.actorId, latest.actorName, latest.at)

            else -> Reason("delegated_by_you", who)
        }
    }

    /** News on a followed task or on a person's own request, named by its newest event. */
    fun update(latest: Activity, following: Boolean, statusNow: String): Reason {
        val prefix = if (following) "Вы следите" else "Ваш запрос"
        val (code, change) = when (latest.kind) {
            "status", "reopened" -> "followed_status_changed" to "статус «${statusLabel(statusNow)}»"

            "completed" -> "followed_status_changed" to "работа завершена"

            "owner" -> "followed_owner_changed" to "сменился исполнитель"

            "due" -> "followed_due_changed" to due(latest.detail["from"], latest.detail["to"])

            "planned" -> "followed_due_changed" to "изменился план работ"

            "dependency" -> "followed_dependency_changed" to "изменилась блокирующая зависимость"

            "thread" -> "followed_thread_changed" to "новое сообщение в обсуждении"

            "resolution" ->
                "followed_thread_changed" to
                    if (latest.detail["resolved"] ==
                        true
                    ) {
                        "вопрос в обсуждении решён"
                    } else {
                        "вопрос в обсуждении открыт снова"
                    }

            else -> request(latest.detail["change"])
        }
        return Reason(code, "$prefix: $change", latest.actorId, latest.actorName, latest.at)
    }

    private fun request(change: Any?): Pair<String, String> = when (change) {
        "resolved" -> "request_resolved" to "запрос решён"
        "cancelled" -> "request_cancelled" to "запрос отменён"
        "orphaned" -> "request_orphaned" to "адресат больше не в проекте"
        "reassigned" -> "request_reassigned" to "запрос передан другому"
        else -> "request_changed" to "запрос изменён"
    }

    private fun due(from: Any?, to: Any?): String = when {
        from == null && to != null -> "назначен срок ${day(to)}"
        to == null -> "срок снят"
        else -> "срок перенесён с ${day(from)} на ${day(to)}"
    }

    /** `2026-10-02` → `02.10`. */
    fun day(value: Any?): String {
        val text = value?.toString() ?: return ""
        val match = DATE.find(text) ?: return text
        val (_, month, day) = match.destructured
        return "$day.$month"
    }

    private val DATE = Regex("^(\\d{4})-(\\d{2})-(\\d{2})")
}
