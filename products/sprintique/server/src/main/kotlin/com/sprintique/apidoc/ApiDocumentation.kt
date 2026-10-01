package com.sprintique.apidoc

import com.sprintique.contract.Accepts
import com.sprintique.contract.Idempotent
import com.sprintique.workbench.application.Workbench
import io.swagger.v3.oas.annotations.media.Schema
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.mvc.method.RequestMappingInfo
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import kotlin.reflect.KClass

/**
 * The OpenAPI document of the live route inventory, built from the registered handlers at startup. A command route
 * without a request contract, or a contract missing from the public schemas, stops the server from starting.
 */
@Component
@Profile("api")
class ApiDocumentation(
    @Qualifier("requestMappingHandlerMapping") private val handlers: RequestMappingHandlerMapping,
    private val contracts: PublicContracts,
) : SmartInitializingSingleton {
    @Volatile private var paths: Map<String, Map<String, Any?>> = emptyMap()

    override fun afterSingletonsInstantiated() {
        val result = sortedMapOf<String, MutableMap<String, Any?>>()
        for ((info, handler) in handlers.handlerMethods) {
            for (path in patternsOf(info).filter { it.startsWith("/api/v1/") }) {
                for (method in info.methodsCondition.methods.ifEmpty { setOf(RequestMethod.GET) }) {
                    if (method == RequestMethod.HEAD || method == RequestMethod.OPTIONS) continue
                    result.getOrPut(path, ::sortedMapOf)[method.name.lowercase()] =
                        operation(method, path, info, handler)
                }
            }
        }
        paths = result
    }

    fun document(): Map<String, Any?> = linkedMapOf(
        "openapi" to "3.1.0",
        "info" to linkedMapOf(
            "title" to "Sprintique vNext API",
            "version" to "2.0.0-alpha.0",
            "description" to DESCRIPTION,
        ),
        "servers" to listOf(mapOf("url" to "/")),
        "paths" to paths,
        "components" to linkedMapOf(
            "securitySchemes" to linkedMapOf(
                "humanSession" to linkedMapOf("type" to "apiKey", "in" to "cookie", "name" to "__Host-sprintique"),
                "agentBearer" to linkedMapOf("type" to "http", "scheme" to "bearer"),
                "serviceAccountBearer" to linkedMapOf(
                    "type" to "http",
                    "scheme" to "bearer",
                    "description" to "A service account's token (spk_) or OAuth access token (spo_): the account's " +
                        "project roles, never above its owner's, narrowed by the read/write scopes. Security actions " +
                        "(agents, members, approvals, service accounts, tokens) need a person's session. See " +
                        "/.well-known/oauth-authorization-server.",
                ),
            ),
            "schemas" to contracts.schemas,
        ),
    )

    private fun patternsOf(info: RequestMappingInfo): Set<String> =
        info.pathPatternsCondition?.patternValues ?: info.patternValues

    private fun operation(
        method: RequestMethod,
        path: String,
        info: RequestMappingInfo,
        handler: HandlerMethod,
    ): Map<String, Any?> {
        val route = path.replace(PATH_VARIABLE) { ":${it.groupValues[1]}" }
        val key = "${method.name} $route"
        val write = method != RequestMethod.GET
        val binary = MediaType.APPLICATION_OCTET_STREAM in info.consumesCondition.consumableMediaTypes
        val body = handler.getMethodAnnotation(Accepts::class.java)?.value?.let(::schemaName)
        val idempotent = handler.hasMethodAnnotation(Idempotent::class.java)
        val needsBody = write && method != RequestMethod.DELETE && route !in WITHOUT_BODY && !binary
        check(!needsBody || body != null) { "Missing request contract: $key" }
        check(body == null || contracts.schemas.has(body)) { "Request contract $body of $key is not a public schema" }
        val response = RESPONSES[key]
        val operation = linkedMapOf<String, Any?>(
            "operationId" to key.replace(Regex("[^A-Za-z0-9]+"), "_"),
            "tags" to listOf(tagOf(route)),
            "security" to
                listOf(
                    mapOf("humanSession" to emptyList<String>()),
                    mapOf("agentBearer" to emptyList<String>()),
                    mapOf("serviceAccountBearer" to emptyList<String>()),
                ),
            "parameters" to parameters(method, path, route, idempotent),
        )
        requestBody(body, binary)?.let { operation["requestBody"] = it }
        operation["responses"] = responses(route, response)
        operation["x-response-schema"] = if (response != null) "declared" else "see-resource-contract"
        operation["x-idempotency"] = when {
            idempotent -> "required"
            write -> "CAS, once-only secret, read query or naturally repeatable operation"
            else -> "read"
        }
        return operation
    }

    /** Planning routes share a tag; others take the resource after the project, or Identity. */
    private fun tagOf(route: String) =
        if ("/planning" in route) "Planning" else route.split('/').getOrNull(TAG_SEGMENT) ?: "Identity"

    private fun parameters(
        method: RequestMethod,
        path: String,
        route: String,
        idempotent: Boolean,
    ): List<Map<String, Any?>> {
        val parameters = ArrayList<Map<String, Any?>>()
        PATH_VARIABLE.findAll(path).forEach {
            parameters += linkedMapOf(
                "in" to "path",
                "name" to it.groupValues[1],
                "required" to true,
                "schema" to STRING,
            )
        }
        if (method == RequestMethod.GET) parameters += ApiQueries.of(route, contracts)
        if (idempotent) {
            parameters += linkedMapOf(
                "in" to "header",
                "name" to "Idempotency-Key",
                "required" to true,
                "schema" to linkedMapOf("type" to "string", "minLength" to KEY_MINIMUM, "maxLength" to KEY_MAXIMUM),
            )
        }
        if (method != RequestMethod.GET) {
            parameters += linkedMapOf(
                "in" to "header",
                "name" to "X-CSRF-Token",
                "required" to false,
                "description" to "Required for human session mutations together with same-origin Origin; " +
                    "not used by bearer tokens.",
                "schema" to STRING,
            )
        }
        return parameters
    }

    private fun requestBody(body: String?, binary: Boolean): Map<String, Any?>? {
        if (body == null && !binary) return null
        val content = if (binary) {
            mapOf("application/octet-stream" to mapOf("schema" to mapOf("type" to "string", "format" to "binary")))
        } else {
            mapOf("application/json" to mapOf("schema" to ref(body!!)))
        }
        return linkedMapOf("required" to true, "content" to content)
    }

    private fun responses(route: String, response: String?): Map<String, Any?> = linkedMapOf(
        "200" to linkedMapOf<String, Any?>(
            "description" to if (route.endsWith("/events")) {
                "Durable page, or text/event-stream when stream=true."
            } else {
                "Successful response."
            },
        ).apply { if (response != null) put("content", mapOf("application/json" to mapOf("schema" to ref(response)))) },
        "default" to linkedMapOf(
            "description" to "Validation, authorization, conflict, quota or unavailable error. " +
                "A rejected Planning receipt is a 200 response; inspect its status.",
            "content" to mapOf("application/json" to mapOf("schema" to ref("Problem"))),
        ),
    )

    private companion object {
        /** Commands without a JSON body: logging out, and RFC 8058's form post to an unsubscribe link. */
        val WITHOUT_BODY = setOf("/api/v1/logout", "/api/v1/notifications/unsubscribe")
        val PATH_VARIABLE = Regex("\\{([A-Za-z]+)}")
        val STRING = mapOf("type" to "string")
        const val KEY_MINIMUM = 8
        const val KEY_MAXIMUM = 120
        const val TAG_SEGMENT = 5
        const val DESCRIPTION = "Clean-start API. Dates and authors are server-owned. Custom refinements, tenant " +
            "authorization, live credential checks and action-bound approvals are enforced at runtime. " +
            "No arbitrary agent execution."
        private const val P = "/api/v1/projects/:projectId"

        fun ref(name: String) = mapOf("\$ref" to "#/components/schemas/$name")

        /** The published name of a contract class: its schema name, else its simple name. */
        fun schemaName(type: KClass<*>): String =
            type.java.getAnnotation(Schema::class.java)?.name?.takeIf(String::isNotEmpty) ?: type.java.simpleName

        val RESPONSES = mapOf(
            "GET $P/events/head" to "EventHeadResponse",
            "GET $P/planning/tasks" to "PlanningPageResponse",
            "GET $P/board/tasks" to "PlanningPageResponse",
            "GET $P/planning/releases" to "ReleasePageResponse",
            "PUT $P/planning/releases/:id" to "ReleaseResponse",
            "POST $P/planning/previews" to "PreviewResponse",
            "POST $P/planning/commands" to "ReceiptResponse",
            "GET $P/planning/commands/:id" to "ReceiptResponse",
            "GET $P/planning/previews/:id/effects" to "EffectsPageResponse",
            "GET $P/approvals/:id/effects" to "EffectsPageResponse",
            "GET $P/approvals/:id" to "ApprovalResponse",
            "POST $P/approvals/:id/decision" to "ApprovalResponse",
            "GET $P/planning/releases/:id/history" to "HistoryPageResponse",
            "GET $P/planning/capabilities" to "PlanningCapabilitiesResponse",
            "GET $P/planning/constraints" to "ConstraintPageResponse",
            "GET $P/planning/roadmap" to "RoadmapPageResponse",
            "PUT $P/planning/constraints/:id" to "ConstraintResponse",
            "PUT $P/planning/milestones/:id" to "MilestoneResponse",
            "GET $P/finance-settings" to "FinanceSettingsResponse",
            "PUT $P/finance-settings" to "FinanceSettingsResponse",
            "GET $P/finance-summary" to "FinanceSummaryResponse",
            "GET $P/finance-entries" to "FinanceEntryPageResponse",
            "GET $P/finance-entries/:id" to "FinanceEntryResponse",
            "PUT $P/finance-entries/:id" to "FinanceEntryResponse",
            "PATCH $P/finance-entries/:id/state" to "FinanceEntryResponse",
            "GET $P/finance-entries/:id/history" to "FinanceEntryHistoryResponse",
        )
    }
}

/** The query parameters each read route accepts, for the document. */
internal object ApiQueries {
    private const val P = "/api/v1/projects/:projectId"
    private const val PAGE_SIZE = 100
    private const val CURSOR_LIMIT = 3000
    private const val THREAD_PAGE = 50
    private const val THREAD_DEFAULT = 20
    private const val SEARCH_LIMIT = 200
    private const val NOTIFICATION_PAGE = 50
    private const val NOTIFICATION_DEFAULT = 20
    private const val OAUTH_REQUEST = 4000

    private fun query(name: String, schema: Any?, required: Boolean = false) =
        linkedMapOf("in" to "query", "name" to name, "required" to required, "schema" to schema)

    private val cursor = query("cursor", mapOf("type" to "string", "maxLength" to CURSOR_LIMIT))
    private const val MAX_TIMEZONE = 100

    /** The output filter of the Workbench: comma-separated project ids, not navigation. */
    private val workbenchProjects = query(
        "projects",
        mapOf("type" to "string", "description" to "Comma-separated project ids; absent means all accessible."),
    )
    private val workbenchLimit = query(
        "limit",
        mapOf(
            "type" to "integer",
            "minimum" to 1,
            "maximum" to Workbench.MAXIMUM_LIMIT,
            "default" to Workbench.DEFAULT_LIMIT,
        ),
    )

    private val pagination = listOf(
        cursor,
        query("limit", mapOf("type" to "integer", "minimum" to 1, "maximum" to PAGE_SIZE, "default" to 50)),
    )

    /** An inclusive range of entry dates. */
    private val period = listOf(
        query("from", mapOf("type" to "string", "format" to "date")),
        query("to", mapOf("type" to "string", "format" to "date")),
    )

    fun of(route: String, contracts: PublicContracts): List<Map<String, Any?>> = when (route) {
        "/api/v1/search" ->
            listOf(query("q", mapOf("type" to "string", "minLength" to 1, "maxLength" to SEARCH_LIMIT), true), cursor)

        "$P/tasks" -> listOf(query("cursor", mapOf("type" to "integer", "minimum" to 0, "default" to 0)))

        "/api/v1/notifications" -> listOf(
            cursor,
            query(
                "limit",
                mapOf(
                    "type" to "integer", "minimum" to 1, "maximum" to NOTIFICATION_PAGE,
                    "default" to NOTIFICATION_DEFAULT,
                ),
            ),
        )

        "/api/v1/workbench" -> listOf(
            query("mode", mapOf("type" to "string", "enum" to listOf("now"))),
            workbenchProjects,
            workbenchLimit,
        )

        "/api/v1/workbench/list" -> listOf(
            query("section", mapOf("type" to "string", "enum" to Workbench.SECTIONS), true),
            workbenchProjects,
            cursor,
            workbenchLimit,
        )

        "/api/v1/workbench/plan" -> listOf(
            query("horizon", mapOf("type" to "string", "enum" to listOf("today", "7d"), "default" to "today")),
            workbenchProjects,
            query("timezone", mapOf("type" to "string", "maxLength" to MAX_TIMEZONE)),
            query(
                "undated",
                mapOf(
                    "type" to "string",
                    "enum" to listOf("list", "count"),
                    "default" to "list",
                    "description" to "count: only summary.undatedCount, for the overview's week.",
                ),
            ),
        )

        "/api/v1/oauth/authorization" ->
            listOf(query("request", mapOf("type" to "string", "minLength" to 1, "maxLength" to OAUTH_REQUEST), true))

        "$P/maps", "$P/agent-runs", "$P/approvals" -> listOf(cursor)

        "$P/maps/:id/history" -> listOf(
            query(
                "before",
                mapOf(
                    "type" to "integer", "minimum" to 1,
                    "maximum" to Int.MAX_VALUE,
                ),
            ),
        )

        "$P/tasks/:id/threads" ->
            listOf(
                cursor,
                query(
                    "limit",
                    mapOf(
                        "type" to "integer", "minimum" to 1, "maximum" to THREAD_PAGE,
                        "default" to THREAD_DEFAULT,
                    ),
                ),
            )

        "$P/events" -> listOf(cursor, query("stream", mapOf("type" to "string", "enum" to listOf("true"))))

        "/api/v1/people/:id/avatar" -> listOf(
            query(
                "v",
                mapOf(
                    "type" to "integer",
                    "minimum" to 1,
                    "description" to "Photo revision; a matching URL may be cached for good.",
                ),
            ),
        )

        "$P/planning/releases", "$P/planning/previews/:id/effects", "$P/planning/releases/:id/history",
        "$P/approvals/:id/effects", "$P/planning/constraints",
        -> pagination

        "$P/planning/tasks", "$P/board/tasks" ->
            contracts.schemas.path("PlanningQuery").path("properties").properties().map { (name, schema) ->
                query(name, schema)
            }

        "$P/finance-entries" -> pagination + listOf(
            query("state", mapOf("type" to "string", "enum" to listOf("planned", "posted", "voided"))),
            query("direction", mapOf("type" to "string", "enum" to listOf("income", "expense"))),
        ) + period

        "$P/finance-summary" -> period

        "$P/finance-entries/:id/history" -> listOf(
            query("before", mapOf("type" to "integer", "minimum" to 1, "maximum" to Int.MAX_VALUE)),
        )

        "$P/planning/roadmap" -> pagination + listOf(
            query("from", mapOf("type" to "string", "format" to "date")),
            query("to", mapOf("type" to "string", "format" to "date")),
            query("undated", mapOf("type" to "string", "enum" to listOf("true", "false"))),
        )

        else -> emptyList()
    }
}
