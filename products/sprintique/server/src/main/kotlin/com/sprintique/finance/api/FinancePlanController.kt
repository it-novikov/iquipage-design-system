package com.sprintique.finance.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.contract.QueryParameters
import com.sprintique.database.Transaction
import com.sprintique.finance.application.FinanceCategories
import com.sprintique.finance.application.FinanceOverview
import com.sprintique.finance.application.FinancePlans
import com.sprintique.finance.application.FinanceVarianceNotes
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * The project budget (docs/decisions/0009-finance-plan.md): categories, plans and their versions, the overview
 * against the plan and explanations of variances. Read with finance.read, changed with finance.write; a task for a
 * variance also needs tasks.write. There are no finance MCP tools.
 */
@RestController
@Profile("api")
class FinancePlanController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("$P/finance-categories")
    fun categories(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        QueryParameters(request, emptySet())
        FinanceCategories.list(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("$P/finance-categories/{id}")
    @Accepts(PutFinanceCategoryRequest::class)
    @Idempotent
    fun putCategory(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinanceCategoryRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinanceCategories.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-category.put:$id", key, input, receipt) {
            FinanceCategories.put(tx, actor, projectId, id, input.baseRevision, input.value.toContent())
        }
    }

    @GetMapping("$P/finance-plans")
    fun plans(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        QueryParameters(request, emptySet())
        FinancePlans.list(tx, actor, RequestInputs.id(projectId))
    }

    @GetMapping("$P/finance-plans/{id}")
    fun plan(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val version = version(QueryParameters(request, setOf("version")))
        FinancePlans.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), version)
    }

    @PutMapping("$P/finance-plans/{id}")
    @Accepts(PutFinancePlanRequest::class)
    @Idempotent
    fun putPlan(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinancePlanRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinancePlans.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-plan.put:$id", key, input, receipt) {
            FinancePlans.putHeader(tx, actor, projectId, id, input.baseRevision, input.value.toHeader())
        }
    }

    @PutMapping("$P/finance-plans/{id}/draft")
    @Accepts(PutFinancePlanDraftRequest::class)
    @Idempotent
    fun putDraft(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinancePlanDraftRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinancePlans.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-plan.draft:$id", key, input, receipt) {
            FinancePlans.putDraft(
                tx,
                actor,
                projectId,
                id,
                input.version,
                input.baseRevision,
                input.value.note,
                input.value.lines.map { it.toLine() },
            )
        }
    }

    @PostMapping("$P/finance-plans/{id}/approve")
    @Accepts(ApproveFinancePlanRequest::class)
    @Idempotent
    fun approve(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<ApproveFinancePlanRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinancePlans.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-plan.approve:$id", key, input, receipt) {
            FinancePlans.approve(tx, actor, projectId, id, input.version, input.baseRevision)
        }
    }

    @PostMapping("$P/finance-plans/{id}/revise")
    @Accepts(ReviseFinancePlanRequest::class)
    @Idempotent
    fun revise(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<ReviseFinancePlanRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinancePlans.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-plan.revise:$id", key, input, receipt) {
            FinancePlans.revise(tx, actor, projectId, id, input.version, input.baseRevision, input.note)
        }
    }

    @GetMapping("$P/finance-overview")
    fun overview(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        val query = QueryParameters(request, setOf("plan", "version"))
        FinanceOverview.read(tx, actor, RequestInputs.id(projectId), query.id("plan"), version(query))
    }

    @PutMapping("$P/finance-variance-notes/{id}")
    @Accepts(PutFinanceVarianceNoteRequest::class)
    @Idempotent
    fun putVarianceNote(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinanceVarianceNoteRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinanceVarianceNotes.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-variance.put:$id", key, input, receipt) {
            FinanceVarianceNotes.put(
                tx,
                actor,
                projectId,
                id,
                input.baseRevision,
                input.value.toContent(),
                input.createTask?.toTask(),
            )
        }
    }

    /** Finance writes take the project fence before the body is read: only writers learn its rules. */
    private fun fence(tx: Transaction, actor: Actor, projectId: String) {
        RequestInputs.id(projectId)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.FINANCE_WRITE)
    }

    private fun version(query: QueryParameters): Int? =
        if (query.string("version", VERSION_DIGITS) == null) null else query.int("version", 1..VERSION_LIMIT, 1)

    private companion object {
        const val P = "/api/v1/projects/{projectId}"
        const val VERSION_DIGITS = 3
        const val VERSION_LIMIT = 100
    }
}
