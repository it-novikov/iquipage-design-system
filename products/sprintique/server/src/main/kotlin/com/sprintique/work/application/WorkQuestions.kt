package com.sprintique.work.application

import com.sprintique.database.Transaction
import com.sprintique.discussion.application.Discussions
import com.sprintique.discussion.application.NewThread
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.work.application.AnswerWorkQuestionRequest
import com.sprintique.work.application.CreateWorkQuestionRequest
import com.sprintique.work.application.WorkDecisionRequest
import tools.jackson.databind.node.ObjectNode
import java.time.Instant
import java.util.UUID

fun TaskWork.question(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: CreateWorkQuestionRequest,
    key: String,
): Any =
    change(
        tx,
        actor, project, task, input.baseRevision, "question.created", input, key,
        "Задан вопрос по работе.", input.title,
    ) {
            doc,
            row,
            id,
        ->
        if (!actor.isHuman) holder(row, actor, input.leaseToken)
        thread(tx, project, id, input.threadId)
        unique(input.options.map { it.id })
        requireCondition(
            input.options.count { it.recommended } <= 1,
            422,
            "WORK_OPTIONS",
            "Укажите одну рекомендацию.",
        )
        val questions = doc.withArray("questions")
        requireCondition(
            questions.size() < WorkLimits.LIST_LIMIT && questions.values().none {
                it.path("id").asString() == input.id
            },
            409, "WORK_QUESTION_LIMIT", "Вопрос уже существует или достигнут предел.",
        )
        val threadId = input.threadId ?: UUID.randomUUID().toString().also { linked ->
            val body = listOf(input.title, input.context, input.options.joinToString("\n") { it.label })
                .filter(String::isNotBlank).joinToString("\n\n")
            Discussions.create(
                tx, actor, project, id, NewThread(linked, UUID.randomUUID().toString(), body, true),
                "$key-thread", ledger,
            )
        }
        questions.add(
            json.valueToTree<ObjectNode>(input).also {
                it.remove("baseRevision")
                it.remove("leaseToken")
                it.put("threadId", threadId)
                it.put("state", "open")
                it.put("status", "open")
                it.put("revision", 1)
                it.put("authorId", actor.id)
            },
        )
    }

fun TaskWork.answer(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    questionId: String,
    input: AnswerWorkQuestionRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project,
        task,
        input.baseRevision,
        "question.answered:$questionId", input, key, "Получен ответ на вопрос.",
        input.answer, Capability.APPROVALS_DECIDE,
    ) {
            doc,
            _,
            _,
        ->
        person(actor)
        val question = child(doc, "questions", questionId)
        requireCondition(
            question.path("state").asString() == "open",
            409,
            "WORK_QUESTION_CLOSED",
            "Вопрос уже решён.",
        )
        requireCondition(
            input.selectedOptionId == null ||
                question.path("options").values().any {
                    it.path("id").asString() == input.selectedOptionId
                },
            422, "WORK_OPTION", "Выберите вариант этого вопроса.",
        )
        question.path("threadId").takeIf { it.isString }?.asString()?.let { linked ->
            val current = Discussions.read(tx, project, linked)["revision"] as Number
            val body = listOf(input.answer, input.decision).map(String::trim)
                .filter(String::isNotBlank).distinct().joinToString("\n\n")
            Discussions.append(
                tx, actor, project, linked,
                Discussions.NewMessage(UUID.randomUUID().toString(), body, current.toLong()), "$key-answer", ledger,
            )
            val after = Discussions.read(tx, project, linked)
            if (after["requiresResolution"] == true && after["resolved"] != true) {
                Discussions.resolve(
                    tx, actor, project, linked, true, (after["revision"] as Number).toLong(), "$key-resolve", ledger,
                )
            }
        }
        question.put("answer", input.answer)
        question.put("selectedOptionId", input.selectedOptionId)
        question.put("decision", input.decision)
        question.put("answeredBy", actor.id)
        question.put("state", "answered")
        question.put("status", "answered")
        question.put("revision", question.path("revision").asLong() + 1)
        if (input.decision.isNotBlank()) {
            doc.withArray("decisions").add(
                json.valueToTree(
                    mapOf(
                        "id" to "decision-$questionId", "text" to input.decision, "questionId" to questionId,
                        "authorId" to actor.id,
                        "at" to Instant.now().toString(),
                    ),
                ),
            )
        }
    }

fun TaskWork.decision(
    tx: Transaction,
    actor: Actor,
    project: String,
    task: String,
    input: WorkDecisionRequest,
    key: String,
): Any =
    change(
        tx,
        actor,
        project,
        task,
        input.baseRevision,
        "decision.created", input, key, "Зафиксировано решение.", input.text, Capability.APPROVALS_DECIDE,
    ) {
            doc,
            _,
            _,
        ->
        person(actor)
        input.questionId?.let { child(doc, "questions", it) }
        val decisions = doc.withArray("decisions")
        requireCondition(
            decisions.size() < WorkLimits.DECISION_LIMIT && decisions.values().none {
                it.path("id").asString() == input.id
            },
            409, "WORK_DECISION_LIMIT", "Решение уже существует или достигнут предел.",
        )
        decisions.add(
            json.valueToTree(
                mapOf(
                    "id" to input.id, "text" to input.text, "questionId" to input.questionId,
                    "authorId" to actor.id, "at" to Instant.now().toString(),
                ),
            ),
        )
    }
