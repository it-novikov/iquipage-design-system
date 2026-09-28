package com.sprintique.identity.api

import com.sprintique.web.RequestValidationException
import jakarta.servlet.http.HttpServletRequest

/** Identifiers in paths and the retry key header, validated like the request contracts. */
object RequestInputs {
    private val ID = Regex("^[A-Za-z0-9_-]{1,100}$")
    private const val KEY_MINIMUM = 8
    private const val KEY_MAXIMUM = 120

    fun id(value: String): String = value.also { if (!ID.matches(it)) throw RequestValidationException() }

    fun idempotencyKey(request: HttpServletRequest): String {
        val key = request.getHeader("Idempotency-Key") ?: throw RequestValidationException()
        if (key.length !in KEY_MINIMUM..KEY_MAXIMUM) throw RequestValidationException()
        return key
    }
}
