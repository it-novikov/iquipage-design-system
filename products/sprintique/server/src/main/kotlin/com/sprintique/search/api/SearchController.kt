package com.sprintique.search.api

import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.search.application.Search
import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Profile("api")
class SearchController(private val requests: AuthenticatedRequests) {
    @GetMapping("/api/v1/search")
    fun search(request: HttpServletRequest) = requests.run(request) { tx, actor ->
        val parameters = request.parameterMap
        // The query takes exactly `q` and an optional `cursor`, each once.
        if (!parameters.keys.all { it in PARAMETERS } || parameters.values.any { it.size != 1 }) {
            throw RequestValidationException()
        }
        val query = parameters["q"]?.single()?.trim() ?: throw RequestValidationException()
        val cursor = parameters["cursor"]?.single()
        if (query.length !in 1..QUERY_LIMIT || (cursor != null && cursor.length > CURSOR_LIMIT)) {
            throw RequestValidationException()
        }
        Search.search(tx, actor, query, cursor)
    }

    private companion object {
        val PARAMETERS = setOf("q", "cursor")
        const val QUERY_LIMIT = 200
        const val CURSOR_LIMIT = 1000
    }
}
