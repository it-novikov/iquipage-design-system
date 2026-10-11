package com.sprintique.work.api

import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.work.application.AnswerWorkQuestionRequest
import com.sprintique.work.application.AssignWorkSkillsRequest
import com.sprintique.work.application.ChangeWorkSessionRequest
import com.sprintique.work.application.ChangeWorkStepRequest
import com.sprintique.work.application.CreateWorkQuestionRequest
import com.sprintique.work.application.CreateWorkRequestRequest
import com.sprintique.work.application.CreateWorkSkillRequest
import com.sprintique.work.application.CreateWorkStepRequest
import com.sprintique.work.application.PutWorkCardRequest
import com.sprintique.work.application.SaveWorkPlanRequest
import com.sprintique.work.application.StartWorkSessionRequest
import com.sprintique.work.application.TaskWork
import com.sprintique.work.application.WorkCheckpointRequest
import com.sprintique.work.application.WorkDecisionRequest
import com.sprintique.work.application.WorkHandoffRequest
import com.sprintique.work.application.WorkLeaseRequest
import com.sprintique.work.application.addStep
import com.sprintique.work.application.answer
import com.sprintique.work.application.assignSkills
import com.sprintique.work.application.brief
import com.sprintique.work.application.card
import com.sprintique.work.application.checkpoint
import com.sprintique.work.application.createSkill
import com.sprintique.work.application.decision
import com.sprintique.work.application.handoff
import com.sprintique.work.application.lease
import com.sprintique.work.application.putCard
import com.sprintique.work.application.question
import com.sprintique.work.application.request
import com.sprintique.work.application.save
import com.sprintique.work.application.sessionState
import com.sprintique.work.application.skill
import com.sprintique.work.application.skills
import com.sprintique.work.application.start
import com.sprintique.work.application.step
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Typed task work routes; the application owns live authorization, fences and retry receipts. */
@RestController
@Profile("api")
class WorkController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val work: TaskWork,
) {
    @GetMapping(
        "/api/v1/projects/{projectId}/tasks/{taskId}/work",
        "/api/v1/projects/{projectId}/tasks/{taskId}/work-plan",
    )
    fun read(@PathVariable projectId: String, @PathVariable taskId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            work.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId))
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-events")
    fun events(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "20") limit: Int,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            work.events(
                tx,
                actor, RequestInputs.id(projectId), RequestInputs.id(taskId), cursor?.let(RequestInputs::id),
                limit,
            )
        }

    @GetMapping("/api/v1/projects/{projectId}/work-agents")
    fun agents(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> work.catalog(tx, actor, RequestInputs.id(projectId)) }

    @GetMapping("/api/v1/projects/{projectId}/work-agents/{elementId}")
    fun agent(@PathVariable projectId: String, @PathVariable elementId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            work.agent(tx, actor, RequestInputs.id(projectId), RequestInputs.id(elementId))
        }

    @GetMapping("/api/v1/projects/{projectId}/work-skills")
    fun skills(@PathVariable projectId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor -> work.skills(tx, actor, RequestInputs.id(projectId)) }

    @GetMapping("/api/v1/projects/{projectId}/work-skills/{elementId}")
    fun skill(@PathVariable projectId: String, @PathVariable elementId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            work.skill(tx, actor, RequestInputs.id(projectId), RequestInputs.id(elementId))
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/card")
    fun card(@PathVariable projectId: String, @PathVariable taskId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            work.card(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId))
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/brief")
    fun brief(@PathVariable projectId: String, @PathVariable taskId: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            work.brief(tx, actor, RequestInputs.id(projectId), RequestInputs.id(taskId))
        }

    @PutMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan")
    @Accepts(SaveWorkPlanRequest::class)
    @Idempotent
    fun save(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<SaveWorkPlanRequest>(body)
            work.save(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/lease")
    @Accepts(WorkLeaseRequest::class)
    @Idempotent
    fun lease(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<WorkLeaseRequest>(body)
            work.lease(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/checkpoints")
    @Accepts(WorkCheckpointRequest::class)
    @Idempotent
    fun checkpoint(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<WorkCheckpointRequest>(body)
            work.checkpoint(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/steps")
    @Accepts(CreateWorkStepRequest::class)
    @Idempotent
    fun addStep(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateWorkStepRequest>(body)
            work.addStep(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PatchMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/steps/{elementId}")
    @Accepts(ChangeWorkStepRequest::class)
    @Idempotent
    fun step(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @PathVariable elementId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<ChangeWorkStepRequest>(body)
            work.step(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                RequestInputs.id(elementId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/questions")
    @Accepts(CreateWorkQuestionRequest::class)
    @Idempotent
    fun question(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateWorkQuestionRequest>(body)
            work.question(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PatchMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/questions/{elementId}")
    @Accepts(AnswerWorkQuestionRequest::class)
    @Idempotent
    fun answer(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @PathVariable elementId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<AnswerWorkQuestionRequest>(body)
            work.answer(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                RequestInputs.id(elementId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/decisions")
    @Accepts(WorkDecisionRequest::class)
    @Idempotent
    fun decision(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<WorkDecisionRequest>(body)
            work.decision(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/sessions")
    @Accepts(StartWorkSessionRequest::class)
    @Idempotent
    fun start(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<StartWorkSessionRequest>(body)
            work.start(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PatchMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/sessions/{elementId}")
    @Accepts(ChangeWorkSessionRequest::class)
    @Idempotent
    fun sessionState(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @PathVariable elementId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<ChangeWorkSessionRequest>(body)
            work.sessionState(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                RequestInputs.id(elementId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/handoffs")
    @Accepts(WorkHandoffRequest::class)
    @Idempotent
    fun handoff(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<WorkHandoffRequest>(body)
            work.handoff(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/requests")
    @Accepts(CreateWorkRequestRequest::class)
    @Idempotent
    fun request(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<CreateWorkRequestRequest>(body)
            work.request(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PutMapping("/api/v1/projects/{projectId}/tasks/{taskId}/work-plan/card")
    @Accepts(PutWorkCardRequest::class)
    @Idempotent
    fun putCard(
        @PathVariable projectId: String,
        @PathVariable taskId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            val input = contracts.parse<PutWorkCardRequest>(body)
            work.putCard(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(taskId),
                input,
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/work-skills")
    @Accepts(CreateWorkSkillRequest::class)
    @Idempotent
    fun createSkill(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            work.createSkill(
                tx,
                actor,
                RequestInputs.id(projectId), contracts.parse<CreateWorkSkillRequest>(body),
                RequestInputs.idempotencyKey(request),
            )
        }

    @PostMapping("/api/v1/projects/{projectId}/work-agents/{elementId}/skills")
    @Accepts(AssignWorkSkillsRequest::class)
    @Idempotent
    fun assignSkills(
        @PathVariable projectId: String,
        @PathVariable elementId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) =
        requests.run(request) { tx, actor ->
            work.assignSkills(
                tx,
                actor,
                RequestInputs.id(projectId),
                RequestInputs.id(elementId), contracts.parse<AssignWorkSkillsRequest>(body),
                RequestInputs.idempotencyKey(request),
            )
        }
}
