package com.sprintique.work.application

import com.sprintique.command.CommandLedger
import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.token.Tokens
import com.sprintique.work.application.ChangeWorkStepRequest
import com.sprintique.work.application.CreateWorkStepRequest
import com.sprintique.work.application.SaveWorkPlanRequest
import com.sprintique.work.application.WorkCheckpointRequest
import com.sprintique.work.application.WorkCriterion
import com.sprintique.work.application.WorkLeaseRequest
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

fun TaskWork.save(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: SaveWorkPlanRequest,
    key: String,
): Any =
    change(tx, actor, project, task, input.baseRevision, "plan.saved", input, key, "План работы сохранён.") {
            doc,
            row,
            _,
        ->
        requireCondition(
            row == null ||
                doc.path("status").asString() == "draft",
            409, "WORK_PLAN_ACTIVE", "План уже используется. Меняйте отдельные шаги.",
        )
        requireCondition(
            actor.isHuman ||
                row == null,
            403, "HUMAN_REQUIRED", "Цель и рамки действующего плана меняет человек.",
        )
        requireCondition(
            input.criteria.none { it.done } &&
                input.steps.all {
                    it.state == "todo" &&
                        it.result.isEmpty() &&
                        it.criteria.none(WorkCriterion::done)
                },
            422, "WORK_INITIAL_STATE", "Новый план начинается с непроверенных критериев и шагов.",
        )
        unique(input.criteria.map { it.id })
        unique(input.steps.map { it.id })
        WorkDependencies.validate(input.steps)
        doc.put("goal", input.goal)
        doc.put("scope", input.scope)
        doc.put("risk", input.risk)
        doc.put("authorId", actor.id)
        doc.put("status", "draft")
        doc.set("criteria", json.valueToTree(input.criteria))
        doc.set("steps", json.valueToTree(input.steps.map { step -> authored(step, actor) }))
        doc.set("context", json.valueToTree(input.context))
        doc.set("extraSections", json.valueToTree(input.extraSections))
    }

fun TaskWork.lease(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: WorkLeaseRequest,
    key: String,
): Any =
    change(
        tx, actor, project, task, input.baseRevision, "lease.${input.action}", input, key,
        if (input.action ==
            "claim"
        ) {
            "Работа над планом принята."
        } else {
            "План освобождён для следующего участника."
        },
    ) { _, row, id ->
        requirePresent(row, 409, "WORK_PLAN_REQUIRED", "Сначала создайте план работы.")
        if (input.action == "release") {
            holder(row, actor, input.leaseToken)
            tx.update(
                """
UPDATE app.task_work_plan SET holder_id=NULL,lease_token=NULL,lease_until=NULL WHERE project_id=$1
AND task_id=$2
""",
                project, id,
            )
        } else {
            val live = row.instantOrNull("lease_until")?.isAfter(Instant.now()) == true
            if (live) holder(row, actor, input.leaseToken)
            val token = if (live) row.string("lease_token") else UUID.randomUUID().toString()
            tx.update(
                """
                    UPDATE app.task_work_plan SET holder_id=$3,lease_token=$4::uuid,
                lease_until=clock_timestamp()+make_interval(secs=>$5::int) WHERE project_id=$1 AND task_id=$2
                """,
                project, id, actor.id, token, input.seconds,
            )
        }
    }

fun TaskWork.checkpoint(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: WorkCheckpointRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project, task, input.baseRevision, "checkpoint.saved", input, key, "Сохранена контрольная точка.",
        input.summary,
    ) {
            doc,
            row,
            id,
        ->
        holder(row, actor, input.leaseToken)
        input.sessionId?.let { session(tx, project, id, it) }
        doc.set(
            "checkpoint",
            json.valueToTree(
                mapOf(
                    "summary" to input.summary, "nextStep" to input.nextStep,
                    "authorId" to actor.id, "at" to Instant.now().toString(), "sessionId" to input.sessionId,
                ),
            ),
        )
        doc.put("status", "active")
        tx.update(
            """
UPDATE app.task_work_plan SET lease_until=clock_timestamp()+interval '5 minutes' WHERE project_id=$1
AND task_id=$2
""",
            project, id,
        )
    }

fun TaskWork.addStep(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: CreateWorkStepRequest,
    key: String,
): Any =
    change(
        tx,
        actor, project, task, input.baseRevision, "step.created", input, key, "Добавлен шаг работы.",
        input.step.title,
    ) {
            doc,
            row,
            _,
        ->
        holder(row, actor, input.leaseToken)
        val steps = doc.withArray("steps")
        requireCondition(
            steps.size() < WorkLimits.LIST_LIMIT && steps.values().none {
                it.path("id").asString() == input.step.id
            },
            409, "WORK_STEP_LIMIT", "Шаг уже существует или достигнут предел.",
        )
        requireCondition(
            input.step.state == "todo" &&
                input.step.criteria.none(WorkCriterion::done),
            422, "WORK_INITIAL_STATE",
            "Новый шаг ещё не выполнен.",
        )
        steps.add(authored(input.step, actor))
        WorkDependencies.validate(steps)
    }

fun TaskWork.step(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    stepId: String,
    input: ChangeWorkStepRequest,
    key: String,
): Any =
    change(
        tx, actor, project, task, input.baseRevision, "step.changed:$stepId", input, key,
        if (input.approval == null) "Обновлён шаг работы." else "Проверен результат шага.", input.result,
        if (input.approval == null) Capability.WORK_WRITE else Capability.APPROVALS_DECIDE,
    ) { doc, row, _ ->
        val step = child(doc, "steps", stepId)
        if (input.approval != null) {
            person(actor)
            requireCondition(
                step.path("authorId").asString() != actor.id,
                403, "SELF_APPROVAL", "Автор не может подтвердить свой результат.",
            )
            requireCondition(
                step.path("state").asString() == "done" &&
                    input.state == "done",
                409, "WORK_APPROVAL", "Подтверждается только завершённый шаг.",
            )
            requireCondition(
                input.result == step.path("result").asString() &&
                    json.valueToTree<JsonNode>(input.evidence) == step.path("evidence") &&
                    json.valueToTree<JsonNode>(input.criteria) == step.path("criteria"),
                409, "WORK_APPROVAL_CHANGED", "Для одобрения передайте тот же результат и критерии.",
            )
            step.put("approval", input.approval)
            step.put("approvedBy", actor.id)
            step.put(
                "approvedDigest",
                Tokens.sha256Hex(
                    CommandLedger.canonical(step.path("result")) +
                        CommandLedger.canonical(step.path("evidence")) +
                        CommandLedger.canonical(step.path("criteria")),
                ),

            )
        } else {
            holder(row, actor, input.leaseToken)
            requireCondition(
                input.criteria.all { criterion ->
                    step.path("criteria").values().any {
                        it.path("id").asString() == criterion.id && it.path("text").asString() == criterion.text
                    }
                },
                422, "WORK_CRITERIA", "Текст утверждённых критериев менять нельзя.",
            )
            unique(input.criteria.map { it.id })
            requireCondition(
                input.criteria.map { it.id }.toSet() ==
                    step.path("criteria").values().map {
                        it.path("id").asString()
                    }.toSet(),
                422, "WORK_CRITERIA", "Критерии шага уже определены.",
            )
            requireCondition(
                input.state != "done" ||
                    (
                        input.result.isNotBlank() && input.evidence.isNotEmpty() && input.criteria.all {
                            it.done
                        }
                        ),
                422, "WORK_EVIDENCE", "Завершённому шагу нужны результат, доказательства и выполненные критерии.",
            )
            WorkDependencies.requirePredecessors(doc.path("steps"), step, input.state)
            step.put("state", input.state)
            step.put("result", input.result)
            step.set("evidence", json.valueToTree(input.evidence))
            step.set("criteria", json.valueToTree(input.criteria))
            step.put("authorId", actor.id)
            step.put(
                "approval",
                if (input.state == "done" &&
                    (doc.path("risk").asString() == "high" || !actor.isHuman)
                ) {
                    "pending"
                } else {
                    "unreviewed"
                },
            )
            step.remove("approvedBy")
            step.remove("approvedDigest")
        }
        step.put("revision", step.path("revision").asLong(0) + 1)
    }
