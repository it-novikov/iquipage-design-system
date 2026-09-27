package com.sprintique.planning.application

import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import tools.jackson.databind.json.JsonMapper
import java.util.Base64

/** A page of a list that belongs to one query ([binding]) at one revision of the project. */
data class Page<T>(val items: List<T>, val total: Int, val projectRevision: Long, val nextCursor: String?)

/**
 * Offset cursors bound to their list and to the project revision: a cursor of another list is invalid, a cursor
 * from before a change is stale, so a page never silently shifts.
 */
object Pages {
    private val json = JsonMapper.builder().build()
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

    fun <T> page(items: List<T>, binding: String, revision: Long, limit: Int, cursor: String?): Page<T> {
        val start = offset(cursor, binding, revision)
        val end = minOf(items.size.toLong(), start + limit).toInt()
        val next = if (end < items.size) {
            val value = linkedMapOf("binding" to binding, "revision" to revision, "offset" to end)
            Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsBytes(value))
        } else {
            null
        }
        val slice = if (start >= items.size) emptyList() else items.subList(start.toInt(), end)
        return Page(slice, items.size, revision, next)
    }

    private fun offset(cursor: String?, binding: String, revision: Long): Long {
        if (cursor.isNullOrEmpty()) return 0
        val value = try {
            json.readTree(Base64.getUrlDecoder().decode(cursor))
        } catch (@Suppress("TooGenericExceptionCaught", "SwallowedException") _: RuntimeException) {
            throw ProblemException(400, "CURSOR_INVALID", "Некорректный курсор.")
        }
        val offset = value.path("offset")
        requireCondition(
            value.path("binding").let { it.isString && it.asString() == binding } &&
                offset.isIntegralNumber && offset.asLong() in 0..MAX_SAFE_INTEGER,
            400,
            "CURSOR_INVALID",
            "Курсор другого списка.",
        )
        requireCondition(
            value.path("revision").let { it.isNumber && it.asDouble() == revision.toDouble() },
            409,
            "CURSOR_STALE",
            "Список изменился. Загрузите его заново.",
        )
        return offset.asLong()
    }
}
