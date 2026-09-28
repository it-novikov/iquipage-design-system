package com.sprintique.apidoc

import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * The public request and response schemas of the API, exported from the Zod contracts that the web client validates
 * with (`npm run contracts`); the test runner fails when the export is stale.
 */
@Component
@Profile("api")
class PublicContracts(json: JsonMapper) {
    private val document: JsonNode = PublicContracts::class.java.getResourceAsStream(RESOURCE)
        ?.use(json::readTree) ?: error("Public contract schemas missing: $RESOURCE")

    val schemas: JsonNode get() = document.path("schemas")

    val planningPolicy: String get() = document.path("planningPolicy").asString()

    private companion object {
        const val RESOURCE = "/contracts/public-schemas.json"
    }
}
