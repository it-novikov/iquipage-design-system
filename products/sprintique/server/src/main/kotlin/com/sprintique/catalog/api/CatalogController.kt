package com.sprintique.catalog.api

import com.sprintique.catalog.application.Catalog
import com.sprintique.catalog.application.Catalogs
import com.sprintique.catalog.application.ReleaseValue
import com.sprintique.catalog.application.TagValue
import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.database.Transaction
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@Profile("api")
class CatalogController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/tags")
    fun tags(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Catalogs.list(tx, actor, RequestInputs.id(projectId), Catalog.TAGS)
    }

    @GetMapping("/api/v1/projects/{projectId}/releases")
    fun releases(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        Catalogs.list(tx, actor, RequestInputs.id(projectId), Catalog.RELEASES)
    }

    @PutMapping("/api/v1/projects/{projectId}/tags/{id}")
    @Accepts(PutTagRequest::class)
    @Idempotent
    fun putTag(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        fence(tx, actor, projectId, id)
        val input = contracts.parse<PutTagRequest>(body)
        val value = TagValue(input.value.name, input.value.normalizedTone()!!, input.value.archivedAt != null)
        val change = Catalogs.Change(projectId, id, input.baseRevision, value, RequestInputs.idempotencyKey(request))
        Catalogs.putTag(tx, actor, change, ledger)
    }

    @PutMapping("/api/v1/projects/{projectId}/releases/{id}")
    @Accepts(PutReleaseRequest::class)
    @Idempotent
    fun putRelease(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        fence(tx, actor, projectId, id)
        val input = contracts.parse<PutReleaseRequest>(body)
        val release = input.value
        val value = ReleaseValue(release.name, release.status.wire, release.targetDate, release.archivedAt != null)
        val change = Catalogs.Change(projectId, id, input.baseRevision, value, RequestInputs.idempotencyKey(request))
        Catalogs.putRelease(tx, actor, change, ledger)
    }

    /** Catalog writes take the project fence before the body is read: only administrators learn its rules. */
    private fun fence(tx: Transaction, actor: Actor, projectId: String, id: String) {
        RequestInputs.id(projectId)
        RequestInputs.id(id)
        ProjectAccess.projectWriteFence(tx, actor, projectId, Capability.CATALOG_WRITE)
    }
}
