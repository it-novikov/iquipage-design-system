package com.sprintique.wiki.api

import com.sprintique.command.CommandLedger
import com.sprintique.contract.Accepts
import com.sprintique.contract.Contracts
import com.sprintique.contract.Idempotent
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.wiki.application.WikiCommands
import com.sprintique.wiki.application.WikiLinks
import com.sprintique.wiki.application.WikiReads
import com.sprintique.wiki.application.WikiSearch
import com.sprintique.wiki.contract.PutWikiPageRequest
import com.sprintique.wiki.contract.PutWikiTaskLinkRequest
import com.sprintique.wiki.contract.RestoreWikiVersionRequest
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

@RestController
@Profile("api")
class WikiController(
    private val requests: AuthenticatedRequests,
    private val contracts: Contracts,
    private val ledger: CommandLedger,
) {
    @GetMapping("/api/v1/projects/{projectId}/wiki")
    fun catalog(
        @PathVariable projectId: String,
        @RequestParam(defaultValue = "false") includeArchive: Boolean,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiReads.catalog(tx, actor, RequestInputs.id(projectId), includeArchive)
    }

    @GetMapping("/api/v1/projects/{projectId}/wiki-search")
    fun search(
        @PathVariable projectId: String,
        @RequestParam q: String,
        @RequestParam(required = false) cursor: String?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiSearch.search(tx, actor, RequestInputs.id(projectId), q, cursor)
    }

    @GetMapping("/api/v1/projects/{projectId}/wiki/{id}")
    fun read(@PathVariable projectId: String, @PathVariable id: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            WikiReads.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id))
        }

    @PutMapping("/api/v1/projects/{projectId}/wiki/{id}")
    @Accepts(PutWikiPageRequest::class)
    @Idempotent
    fun put(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiCommands.put(
            tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), contracts.parse<PutWikiPageRequest>(body),
            RequestInputs.idempotencyKey(request), ledger,
        )
    }

    @GetMapping("/api/v1/projects/{projectId}/wiki/{id}/history")
    fun history(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestParam(required = false) before: Long?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiReads.history(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), before)
    }

    @GetMapping("/api/v1/projects/{projectId}/wiki/{id}/versions/{revision}")
    fun version(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @PathVariable revision: Long,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiReads.version(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), revision)
    }

    @PostMapping("/api/v1/projects/{projectId}/wiki/{id}/restore")
    @Accepts(RestoreWikiVersionRequest::class)
    @Idempotent
    fun restore(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiCommands.restore(
            tx, actor, RequestInputs.id(projectId), RequestInputs.id(id),
            contracts.parse<RestoreWikiVersionRequest>(body),
            RequestInputs.idempotencyKey(request), ledger,
        )
    }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{task}/wiki-links")
    fun links(@PathVariable projectId: String, @PathVariable task: String, request: HttpServletRequest) =
        requests.run(request) { tx, actor ->
            WikiLinks.list(tx, actor, RequestInputs.id(projectId), RequestInputs.id(task))
        }

    @GetMapping("/api/v1/projects/{projectId}/tasks/{task}/wiki-links/{pageId}")
    fun readLink(
        @PathVariable projectId: String,
        @PathVariable task: String,
        @PathVariable pageId: String,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiLinks.read(tx, actor, RequestInputs.id(projectId), RequestInputs.id(task), RequestInputs.id(pageId))
    }

    @PutMapping("/api/v1/projects/{projectId}/tasks/{task}/wiki-links/{pageId}")
    @Accepts(PutWikiTaskLinkRequest::class)
    @Idempotent
    fun link(
        @PathVariable projectId: String,
        @PathVariable task: String,
        @PathVariable pageId: String,
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiLinks.put(
            tx, actor, RequestInputs.id(projectId), RequestInputs.id(task), RequestInputs.id(pageId),
            contracts.parse<PutWikiTaskLinkRequest>(body), RequestInputs.idempotencyKey(request), ledger,
        )
    }

    @GetMapping("/api/v1/projects/{projectId}/wiki/{id}/tasks")
    fun backlinks(
        @PathVariable projectId: String,
        @PathVariable id: String,
        @RequestParam(required = false) cursor: String?,
        request: HttpServletRequest,
    ) = requests.run(request) { tx, actor ->
        WikiLinks.backlinks(tx, actor, RequestInputs.id(projectId), RequestInputs.id(id), cursor)
    }
}
