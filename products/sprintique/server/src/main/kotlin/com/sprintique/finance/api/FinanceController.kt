package com.sprintique.finance.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.contract.QueryParameters
import com.sprintique.database.Transaction
import com.sprintique.finance.application.FinanceEntries
import com.sprintique.finance.application.FinanceEntryFilter
import com.sprintique.finance.application.FinanceSettings
import com.sprintique.finance.application.FinanceSummary
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * The project ledger: entries, their history, the project summary and the project currency. People of the project
 * read it; project administrators change it. Agents have no finance capability.
 */
@RestController
@Profile("api")
class FinanceController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/finance-settings")
    fun settings(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        FinanceSettings.read(tx, actor, RequestInputs.id(projectId))
    }

    @PutMapping("/api/v1/projects/{projectId}/finance-settings")
    @Accepts(PutFinanceSettingsRequest::class)
    @Idempotent
    fun putSettings(
        @PathVariable projectId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinanceSettingsRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinanceSettings.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-settings.put", key, input, receipt) {
            FinanceSettings.write(tx, actor, projectId, input.baseRevision, input.value.currencyCode)
        }
    }

    @GetMapping("/api/v1/projects/{projectId}/finance-summary")
    fun summary(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        val query = QueryParameters(request, setOf("from", "to"))
        FinanceSummary.read(tx, actor, RequestInputs.id(projectId), query.date("from"), query.date("to"))
    }

    @GetMapping("/api/v1/projects/{projectId}/finance-entries")
    fun list(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        val (query, page) = QueryParameters.pagination(request, "state", "direction", "from", "to")
        val filter = FinanceEntryFilter(
            state = query.oneOf("state", STATES),
            direction = query.oneOf("direction", DIRECTIONS),
            from = query.date("from"),
            to = query.date("to"),
        )
        FinanceEntries.list(tx, actor, RequestInputs.id(projectId), filter, page.first, page.second)
    }

    @GetMapping("/api/v1/projects/{projectId}/finance-entries/{id}")
    fun read(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        FinanceEntries.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
    }

    @GetMapping("/api/v1/projects/{projectId}/finance-entries/{id}/history")
    fun history(
        @PathVariable projectId: String,
        @PathVariable id: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        val query = QueryParameters(request, setOf("before"))
        val before = if (query.string("before", REVISION_DIGITS) ==
            null
        ) {
            null
        } else {
            query.int("before", 1..Int.MAX_VALUE, 1)
        }
        FinanceEntries.history(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), before)
    }

    @PutMapping("/api/v1/projects/{projectId}/finance-entries/{id}")
    @Accepts(PutFinanceEntryRequest::class)
    @Idempotent
    fun put(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<PutFinanceEntryRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinanceEntries.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-entry.put:$id", key, input, receipt) {
            FinanceEntries.put(tx, actor, projectId, id, input.baseRevision, input.value.toContent())
        }
    }

    @PatchMapping("/api/v1/projects/{projectId}/finance-entries/{id}/state")
    @Accepts(ChangeFinanceEntryStateRequest::class)
    @Idempotent
    fun changeState(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        RequestInputs.id(id)
        fence(tx, actor, projectId)
        val input = contracts.parse<ChangeFinanceEntryStateRequest>(body)
        val key = RequestInputs.idempotencyKey(request)
        val receipt = FinanceEntries.receipt(tx, projectId)
        ledger.idempotent(tx, actor, projectId, "finance-entry.state:$id", key, input, receipt) {
            FinanceEntries.changeState(tx, actor, projectId, id, input.baseRevision, input.toChange())
        }
    }

    /** Finance writes take the project fence before the body is read: only administrators learn its rules. */
    private fun fence(tx: Transaction, actor: Actor, projectId: String) {
        RequestInputs.id(projectId)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.FINANCE_WRITE)
    }

    private companion object {
        val STATES = setOf("planned", "posted", "voided")
        val DIRECTIONS = setOf("income", "expense")
        const val REVISION_DIGITS = 10
    }
}
