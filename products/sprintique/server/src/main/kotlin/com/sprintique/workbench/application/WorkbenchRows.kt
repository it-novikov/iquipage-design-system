package com.sprintique.workbench.application

import com.sprintique.database.Row
import com.sprintique.workbench.domain.Activity
import com.sprintique.workbench.domain.Reason
import com.sprintique.workbench.domain.Reasons
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * One row of the Workbench as the interface reads it (docs/adr W4): the task's facts, its placement, the primary and
 * secondary reasons, the request, "Жду", the unseen news with its newest change, the person's private fields and
 * the actions the row offers. Rows carry references and codes, never description or comment text.
 */
internal object WorkbenchRows {
    private val json = JsonMapper.builder().build()

    private val SECTION_OF = mapOf(
        "action" to ("action" to null),
        "joined" to ("current" to "joined"),
        "active" to ("current" to "active"),
        "waiting" to ("current" to "waiting"),
        "updates" to ("updates" to null),
        "snoozed" to ("action" to "snoozed"),
        "backlog" to ("current" to "backlog"),
    )

    private fun person(id: Any?, name: Any?): Map<String, Any?>? = id?.let { linkedMapOf("id" to it, "name" to name) }

    private fun activity(row: Row): Activity? {
        val kind = row.stringOrNull("latest_kind") ?: return null
        val detail: JsonNode? = row.json("latest_detail")

        @Suppress("UNCHECKED_CAST")
        val values = detail?.let { json.treeToValue(it, Map::class.java) as Map<String, Any?> } ?: emptyMap()
        return Activity(
            kind,
            values,
            row.stringOrNull("latest_actor"),
            row.stringOrNull("latest_actor_name"),
            row.stringOrNull("unseen_latest_at"),
        )
    }

    /** One task, one row: the primary reason of its placement and the others as secondary reasons. */
    fun item(row: Row, parts: WorkbenchParts): Map<String, Any?> {
        val bucket = row.string("bucket")
        val (section, group) = SECTION_OF.getValue(bucket)
        val projectId = row.string("project_id")
        val taskId = row.string("task_id")
        val latest = activity(row)
        val reasons = reasonsOf(row, latest)
        val weights = (row["weights"] as List<*>).map { it.toString().toInt() }
        return linkedMapOf<String, Any?>(
            "resourceKind" to "task",
            "key" to "$projectId:$taskId",
            "projectId" to projectId,
            "projectName" to row["project_name"],
            "workspaceName" to row["workspace_name"],
            "taskId" to taskId,
            "displayId" to row["display_id"],
            "taskRevision" to row.long("task_revision"),
            "title" to row["title"],
            "status" to row["status"],
            // Board and calendar views group by these without another round trip.
            "statusCategory" to when {
                row.boolean("done") -> "done"
                row.string("status") == "ready" -> "todo"
                else -> "active"
            },
            // How long the task has been in its stage: the age a board card shows.
            "statusEnteredAt" to row["status_entered_at"],
            "type" to row["type"],
            "priority" to row["priority"],
            "done" to row.boolean("done"),
            "owner" to person(row["owner_id"], row["owner_name"]),
            "due" to row["due"],
            "plannedStart" to row["planned_start"],
            "plannedEnd" to row["planned_end"],
            "section" to section,
            "group" to group,
            "primaryReason" to reasons.first().let(::reasonOf),
            "secondaryReasons" to secondary(row, bucket, weights, latest).map(::reasonOf),
            "request" to requestOf(row),
            "action" to actionOf(row),
            "active" to if (bucket == "active") activeOf(row) else null,
            // The due date is shared: a writer of the project may move it from the row (the task write of the drawer).
            "canEditDue" to (row.string("project_role") in WRITERS && !row.boolean("done")),
            "waiting" to if (row.boolean("delegated")) waitingOf(row) else null,
            "updates" to row["unseen_count"]?.let {
                linkedMapOf(
                    "count" to minOf(row.long("unseen_count"), Workbench.UPDATES_CAP.toLong()),
                    "latestSequence" to row.long("unseen_latest"),
                    "latestAt" to row["unseen_latest_at"],
                    "kinds" to row.strings("unseen_kinds"),
                    "latest" to latest?.let { change(row, it) },
                )
            },
            "personal" to personalOf(row),
            "latestSequence" to (row["latest_sequence"]?.toString()?.toLong() ?: 0L),
            "blockedBy" to
                row.stringOrNull("blocker_id")?.let {
                    linkedMapOf("id" to it, "displayId" to row["blocker_display_id"])
                },
            "allowedActions" to allowedActions(row, bucket, parts),
            "canonicalUrl" to "/workbench/tasks/$projectId/$taskId",
        ).apply { if (get("workspaceName") == null) remove("workspaceName") }
    }

    private fun requestOf(row: Row): Map<String, Any?>? = row.stringOrNull("request_id")?.let {
        linkedMapOf(
            "id" to it,
            "kind" to row["request_kind"],
            "revision" to row.long("request_revision"),
            "neededBy" to row["needed_by"],
            "requestedBy" to person(row["requested_by"], row["requested_by_name"]),
            "createdAt" to row["requested_at"],
            "openCount" to row.long("open_requests"),
            "approvalId" to row["request_approval_id"],
            "threadId" to row["request_thread_id"],
        )
    }

    // What the row's verb does (design-v2 §11.3): review, approve and do resolve in the row; a question or a
    // decision opens the drawer to answer.

    private fun actionOf(row: Row): Map<String, Any?>? = row.stringOrNull("request_kind")?.let { kind ->
        val action = ACTION_OF[kind] ?: "question"
        linkedMapOf("kind" to action, "inline" to (action in INLINE))
    }

    private fun personalOf(row: Row): Map<String, Any?> = linkedMapOf(
        "participating" to (row["participating"] ?: false),
        "participationRevision" to (row["participation_revision"]?.toString()?.toLong() ?: 0L),
        "rank" to row["rank"]?.toString()?.toLong(),
        "rankRevision" to (row["rank_revision"]?.toString()?.toLong() ?: 0L),
        "lastSeenSequence" to row["last_seen_sequence"]?.toString()?.toLong(),
        "seenRevision" to (row["seen_revision"]?.toString()?.toLong() ?: 0L),
        "snoozedUntil" to row["snoozed_until"],
        "snoozeRevision" to (row["snooze_revision"]?.toString()?.toLong() ?: 0L),
        "checkBackAt" to row["check_back_at"],
        "checkBackRevision" to (row["check_back_revision"]?.toString()?.toLong() ?: 0L),
        "acceptRevision" to (row["accept_revision"]?.toString()?.toLong() ?: 0L),
    )

    /**
     * "Жду" on the row (docs/adr W5): whom the person assigned the task to (named while still a member), who owns it
     * now (null: the owner was removed), the private check-back date and whether the work is done.
     */
    private fun waitingOf(row: Row): Map<String, Any?> = linkedMapOf(
        "expectedAssignee" to if (row.boolean("expected_is_member")) {
            person(row["expected_assignee_id"], row["expected_name"])
        } else {
            null
        },
        "expectedAssigneeLeft" to !row.boolean("expected_is_member"),
        "ownerNow" to person(row["owner_id"], row["owner_name"]),
        "checkBackAt" to row["check_back_at"],
        "done" to row.boolean("done"),
        "doneAt" to row["done_at"],
        "assignedAt" to row["assigned_at"],
    )

    /**
     * "Готово" from the row (design-v2 §11.3): the next stage of the project's workflow and its verb, or why the
     * task cannot be moved from here (no write right, an open blocker).
     */
    private fun activeOf(row: Row): Map<String, Any?> {
        val next = NEXT_STAGE[row.string("status")]
        val blocker = row.stringOrNull("blocker_display_id")
        val cannot = when {
            row.string("project_role") !in WRITERS ->
                linkedMapOf("reason" to "read_only", "text" to "Только чтение: нет права менять задачи проекта")

            blocker != null -> linkedMapOf("reason" to "blocked", "text" to "Заблокирована задачей $blocker")

            next == null -> linkedMapOf("reason" to "final", "text" to "Задача уже на последней стадии")

            else -> null
        }
        return linkedMapOf(
            "transition" to next?.let { (status, label) -> linkedMapOf("label" to label, "toStatusId" to status) },
            "cannotComplete" to cannot,
        )
    }

    private fun completable(row: Row) = row.string("project_role") in WRITERS &&
        row.stringOrNull("blocker_display_id") == null && NEXT_STAGE.containsKey(row.string("status"))

    private val WRITERS = setOf("editor", "admin")

    /** Request kinds as the row's verbs name them. */
    private val ACTION_OF = mapOf(
        "review" to "review",
        "approval" to "approve",
        "do" to "do",
        "answer" to "question",
        "decision" to "decision",
    )
    private val INLINE = setOf("review", "approve", "do")

    /** The next stage of the workflow from an active one, with the verb of the move. */
    private val NEXT_STAGE = mapOf(
        "in_progress" to ("review" to "На проверку"),
        "review" to ("ready_for_testing" to "Проверено"),
        "ready_for_testing" to ("testing" to "Взять в тест"),
        "testing" to ("ready_for_release" to "Готово"),
    )

    /**
     * The newest unseen event as a change the interface can draw: its kind, "from → to" in codes, dates or people
     * (a person who left the project is not named), who made it and when. Never titles or text.
     */
    private fun change(row: Row, latest: Activity): Map<String, Any?> = linkedMapOf(
        "kind" to latest.kind,
        "detail" to changeDetail(row, latest),
        "actor" to person(latest.actorId, latest.actorName),
        "actorName" to latest.actorName,
        "at" to latest.at,
        "sequence" to row.long("unseen_latest"),
    )

    private fun changeDetail(row: Row, latest: Activity): Map<String, Any?> {
        val detail = latest.detail
        return when (latest.kind) {
            "status", "reopened", "due" -> linkedMapOf("from" to detail["from"], "to" to detail["to"])

            "completed" -> if (detail["result"] == "accepted") {
                linkedMapOf("result" to "accepted")
            } else {
                linkedMapOf("from" to detail["from"], "to" to detail["to"])
            }

            "planned" -> linkedMapOf("from" to interval(detail["from"]), "to" to interval(detail["to"]))

            "owner" -> linkedMapOf(
                "from" to person(detail["from"], row["latest_from_name"]),
                "to" to person(detail["to"], row["latest_to_name"]),
            )

            "dependency" -> linkedMapOf("change" to detail["change"], "role" to detail["role"])

            "resolution" -> linkedMapOf("resolved" to detail["resolved"])

            "request" -> linkedMapOf("change" to detail["change"], "requestKind" to detail["kind"])

            else -> linkedMapOf()
        }
    }

    /** A planned interval `[start, end]` as the event stored it. */
    private fun interval(value: Any?): Map<String, Any?> {
        val bounds = value as? List<*>
        return linkedMapOf("start" to bounds?.getOrNull(0), "end" to bounds?.getOrNull(1))
    }

    private fun reasonOf(reason: Reason): Map<String, Any?> = linkedMapOf<String, Any?>(
        "code" to reason.code,
        "text" to reason.text,
    ).apply {
        reason.actorId?.let { put("actor", linkedMapOf("id" to it, "name" to reason.actorName)) }
        reason.occurredAt?.let { put("occurredAt", it) }
        reason.neededBy?.let { put("neededBy", it) }
    }

    private fun requestReason(row: Row) = Reasons.request(
        row.string("request_kind"),
        row.stringOrNull("requested_by"),
        row.stringOrNull("requested_by_name"),
        row.stringOrNull("requested_at"),
        row.stringOrNull("needed_by"),
    )

    private fun waitingReason(row: Row, latest: Activity?) = Reasons.waiting(
        row.stringOrNull("expected_name"),
        row.boolean("expected_is_member"),
        row.stringOrNull("owner_id"),
        row.stringOrNull("expected_assignee_id"),
        row.stringOrNull("owner_name"),
        row.boolean("done"),
        latest,
    )

    private fun activeReason(row: Row) = Reasons.assigned(row.string("status"), row.stringOrNull("blocker_display_id"))

    private fun updateReason(row: Row, latest: Activity) =
        Reasons.update(latest, row["participating"] == true, row.string("status"))

    private fun reasonsOf(row: Row, latest: Activity?): List<Reason> = listOf(
        when (row.string("bucket")) {
            "action", "snoozed" -> requestReason(row)
            "joined" -> Reasons.participating()
            "active" -> activeReason(row)
            "waiting" -> waitingReason(row, latest)
            "backlog" -> Reasons.backlog()
            else -> updateReason(row, requireNotNull(latest))
        },
    )

    private fun secondary(row: Row, bucket: String, weights: List<Int>, latest: Activity?): List<Reason> = buildList {
        if (bucket == "action" && row.long("open_requests") > 1) {
            add(Reason("request_to_you", "Ещё запросов к вам: ${row.long("open_requests") - 1}"))
        }
        for (weight in weights) {
            if (weight == WEIGHT[bucket]) continue
            when (weight) {
                ACTION_WEIGHT -> if (row.stringOrNull("request_id") != null) add(requestReason(row))
                JOINED_WEIGHT -> add(Reasons.participating())
                ACTIVE_WEIGHT -> add(activeReason(row))
                WAITING_WEIGHT -> add(waitingReason(row, latest))
                UPDATES_WEIGHT -> latest?.let { add(updateReason(row, it)) }
            }
        }
        // Participation is a quiet fact behind a stronger placement (active or delegated work, a request).
        if (row["participating"] == true && bucket in setOf("action", "active", "waiting") &&
            weights.none { it == JOINED_WEIGHT }
        ) {
            add(Reasons.participating())
        }
    }

    // The precedence of a task's placement, as the statement ranks candidates: lower wins.
    private const val ACTION_WEIGHT = 1
    private const val JOINED_WEIGHT = 2
    private const val ACTIVE_WEIGHT = 3
    private const val WAITING_WEIGHT = 4
    private const val UPDATES_WEIGHT = 5
    private val WEIGHT = mapOf(
        "action" to ACTION_WEIGHT,
        "joined" to JOINED_WEIGHT,
        "active" to ACTIVE_WEIGHT,
        "waiting" to WAITING_WEIGHT,
        "updates" to UPDATES_WEIGHT,
    )

    /** A hint for the interface only: the server checks every command again. */
    private fun allowedActions(row: Row, bucket: String, parts: WorkbenchParts): List<String> = buildList {
        add("open")
        add("openProject")
        if (parts.personal) {
            add(if (row["participating"] == true) "leave" else "participate")
            if (bucket == "joined") addAll(listOf("rankUp", "rankDown"))
        }
        if (row.stringOrNull("request_id") != null) {
            add("resolveRequest")
            if (parts.personal) add(if (bucket == "snoozed") "unsnooze" else "snooze")
        }
        if (row.boolean("delegated")) {
            add("changeCheckBack")
            if (row.boolean("done")) add("acceptResult")
        }
        if (bucket == "active" && completable(row)) add("complete")
        if (row.string("project_role") in WRITERS && !row.boolean("done")) add("changeDue")
        // Seen moves the watermark that requests count news from as well.
        if (row["unseen_count"] != null) add("markSeen")
    }
}
