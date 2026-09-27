package com.sprintique.planning.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.QueryParameters
import com.sprintique.contract.UUID
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.Approvals
import com.sprintique.planning.application.Calendar
import com.sprintique.planning.application.Planning
import com.sprintique.planning.application.PlanningFilters
import com.sprintique.planning.application.PlanningJson
import com.sprintique.planning.application.PlanningQueries
import com.sprintique.planning.application.PlanningStates
import com.sprintique.planning.application.Releases
import com.sprintique.planning.contract.MAX_EXPLICIT_SELECTION
import com.sprintique.planning.contract.PLANNING_POLICY
import com.sprintique.planning.contract.PlanningCommandContract
import com.sprintique.planning.domain.MilestoneData
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/** Planning of a project: lists, previews and their application, releases, calendar, approvals. */
@RestController
@Profile("api")
@RequestMapping("/api/v1/projects/{projectId}")
@Suppress("TooManyFunctions")
class PlanningController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
    private val planning: Planning,
    private val queries: PlanningQueries,
) {
    @GetMapping("/planning/capabilities")
    fun capabilities(
        @PathVariable projectId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val lock = PlanningStates.lock(tx, actor, RequestInputs.id(projectId))
        val role = tx.row(
            "SELECT role FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
            projectId,
            actor.id,
        )!!.string("role")
        val canWrite = role != "reader" && actor.mayRead(Capability.TASKS_WRITE)
        linkedMapOf(
            "contractVersion" to 2,
            "policyVersion" to PLANNING_POLICY,
            "timezone" to lock.timezone,
            "formats" to listOf("flexible", "timeboxed"),
            "actions" to linkedMapOf(
                "read" to mapOf("allowed" to true),
                "preview" to linkedMapOf("allowed" to canWrite, "reason" to if (canWrite) null else "READ_ONLY"),
                "commit" to linkedMapOf("allowed" to canWrite, "requiresHumanApproval" to !actor.isHuman),
                "approve" to linkedMapOf(
                    "allowed" to (canWrite && actor.isHuman),
                    "reason" to when {
                        !actor.isHuman -> "HUMAN_REQUIRED"
                        canWrite -> null
                        else -> "READ_ONLY"
                    },
                ),
            ),
            "limits" to
                linkedMapOf("pageSize" to QueryParameters.PAGE_SIZE, "explicitSelection" to MAX_EXPLICIT_SELECTION),
            "selectors" to listOf("tasks", "release", "unassigned", "project"),
        )
    }

    @GetMapping("/planning/tasks")
    fun tasks(
        @PathVariable projectId: String,
        request: HttpServletRequest,
    ) = listTasks(projectId, request, board = false)

    @GetMapping("/board/tasks")
    fun board(
        @PathVariable projectId: String,
        request: HttpServletRequest,
    ) = listTasks(projectId, request, board = true)

    private fun listTasks(projectId: String, request: HttpServletRequest, board: Boolean) = requests.run(request) {
            tx,
            actor,
        ->
        RequestInputs.id(projectId)
        val (query, page) = QueryParameters.pagination(
            request,
            "q", "releaseId", "unassigned", "parentId", "preparation", "status", "owner", "tagId", "board",
        )
        val filters = PlanningFilters(
            q = query.string("q", TEXT_LIMIT).orEmpty(),
            releaseId = query.id("releaseId"),
            unassigned = query.oneOf("unassigned", TRUE) != null,
            parentId = query.id("parentId"),
            preparation = query.oneOf("preparation", setOf("draft", "ready")),
            status = query.string("status", STATUS_LIMIT),
            owner = query.string("owner", OWNER_LIMIT),
            tagId = query.id("tagId"),
            board = board || query.oneOf("board", TRUE) != null,
        )
        queries.tasks(tx, actor, projectId, filters, page.first, page.second)
    }

    @GetMapping("/planning/releases")
    fun releases(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val (_, page) = QueryParameters.pagination(request)
        Releases.list(tx, actor, projectId, page.first, page.second)
    }

    @PutMapping("/planning/releases/{id}")
    @Accepts(ReleaseWriteRequest::class)
    fun writeRelease(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ReleaseWriteRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        Releases.write(tx, actor, projectId, id, input.baseRevision, input.value.toDomain(), input, key, ledger)
    }

    @PostMapping("/planning/previews")
    @Accepts(PlanningCommandContract::class)
    fun preview(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        planning.preview(tx, actor, projectId, contracts.parse<PlanningCommandContract>(body))
    }

    @GetMapping("/planning/previews/{id}/effects")
    fun previewEffects(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val (_, page) = QueryParameters.pagination(request)
        PlanningJson.page(planning.previewEffects(tx, actor, projectId, uuid(id), page.first, page.second))
    }

    @PostMapping("/planning/commands")
    @Accepts(CommitPlanRequest::class)
    fun commit(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val input = contracts.parse<CommitPlanRequest>(body)
        planning.commit(tx, actor, projectId, input.planId, input.token, RequestInputs.idempotencyKey(request))
    }

    @GetMapping("/planning/commands/{id}")
    fun receipt(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        planning.receipt(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
    }

    @GetMapping("/planning/releases/{id}/history")
    fun history(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val (_, page) = QueryParameters.pagination(request)
        queries.history(tx, actor, projectId, id, page.first, page.second)
    }

    @GetMapping("/approvals/{id}")
    fun approval(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        Approvals.detail(tx, actor, RequestInputs.id(projectId), uuid(id))
    }

    @GetMapping("/approvals/{id}/effects")
    fun approvalEffects(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val approval = uuid(id)
        val (_, page) = QueryParameters.pagination(request)
        Approvals.effects(tx, actor, projectId, approval, page.first, page.second)
    }

    @PostMapping("/approvals/{id}/decision")
    @Accepts(ApprovalDecisionRequest::class)
    fun decide(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val approval = uuid(id)
        val input = contracts.parse<ApprovalDecisionRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        Approvals.decide(tx, actor, projectId, approval, input.baseRevision, input.status.wire, key, ledger)
    }

    @PutMapping("/planning/milestones/{id}")
    @Accepts(MilestoneWriteRequest::class)
    fun writeMilestone(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<MilestoneWriteRequest>(body)
        val value = MilestoneData(input.value.title, input.value.date, input.value.releaseId)
        val key = RequestInputs.idempotencyKey(request)
        Calendar.writeMilestone(tx, actor, projectId, id, input.baseRevision, value, input, key, ledger)
    }

    @PutMapping("/planning/constraints/{id}")
    @Accepts(ConstraintWriteRequest::class)
    fun writeConstraint(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        val input = contracts.parse<ConstraintWriteRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        Calendar.writeConstraint(
            tx,
            actor,
            projectId,
            id,
            input.baseRevision,
            input.value.toDomain(),
            input,
            key,
            ledger,
        )
    }

    @GetMapping("/planning/constraints")
    fun constraints(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val (_, page) = QueryParameters.pagination(request)
        queries.constraints(tx, actor, projectId, page.first, page.second)
    }

    @GetMapping("/planning/roadmap")
    fun roadmap(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        RequestInputs.id(projectId)
        val (query, page) = QueryParameters.pagination(request, "from", "to", "undated")
        val range = PlanningQueries.RoadmapRange(
            from = query.date("from"),
            to = query.date("to"),
            undated = query.oneOf("undated", setOf("true", "false")) != "false",
        )
        queries.roadmap(tx, actor, projectId, range, page.first, page.second)
    }

    private companion object {
        const val TEXT_LIMIT = 240
        const val STATUS_LIMIT = 30
        const val OWNER_LIMIT = 120
        val TRUE = setOf("true")
        private val UUID_PATTERN = Regex(UUID)

        fun uuid(value: String): String = value.also {
            if (!UUID_PATTERN.matches(it)) throw RequestValidationException()
        }
    }
}
