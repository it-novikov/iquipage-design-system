package com.sprintique.contract

import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest

/**
 * Query parameters read as strictly as request bodies: only the named ones, each at most once. An invalid value is a
 * validation error like an invalid field.
 */
class QueryParameters(request: HttpServletRequest, allowed: Set<String>) {
    private val values: Map<String, String>

    init {
        val parameters = request.parameterMap
        if (!allowed.containsAll(parameters.keys) || parameters.values.any { it.size != 1 }) {
            throw RequestValidationException()
        }
        values = parameters.mapValues { it.value.single() }
    }

    fun string(name: String, maximum: Int): String? = values[name]?.also { if (it.length > maximum) invalid() }

    fun id(name: String): String? = values[name]?.also { if (!ID.matches(it)) invalid() }

    fun date(name: String): String? = values[name]?.also { if (!isIsoDate(it)) invalid() }

    /** A number in `range`, written as JavaScript's `Number()` would read it for an integer. */
    fun int(name: String, range: IntRange, default: Int): Int {
        val raw = values[name] ?: return default
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) invalid()
        return trimmed.toIntOrNull()?.takeIf { it in range } ?: invalid()
    }

    fun oneOf(name: String, options: Set<String>): String? = values[name]?.also { if (it !in options) invalid() }

    private fun invalid(): Nothing = throw RequestValidationException()

    companion object {
        private val ID = Regex(RESOURCE_ID)
        const val CURSOR_LIMIT = 3000
        const val PAGE_SIZE = 100
        private const val DEFAULT_LIMIT = 50

        /** `limit` (1–100, default 50) and `cursor`. */
        fun pagination(request: HttpServletRequest, vararg more: String): Pair<QueryParameters, Pair<Int, String?>> {
            val query = QueryParameters(request, setOf("limit", "cursor", *more))
            return query to (query.int("limit", 1..PAGE_SIZE, DEFAULT_LIMIT) to query.string("cursor", CURSOR_LIMIT))
        }
    }
}
