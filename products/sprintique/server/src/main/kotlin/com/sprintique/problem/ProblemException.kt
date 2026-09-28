package com.sprintique.problem

import kotlin.contracts.ExperimentalContracts
import kotlin.contracts.contract

/**
 * An expected failure with a stable machine code, an HTTP status and a message for people.
 * The code is part of the API contract; the message may change.
 */
class ProblemException(
    val status: Int,
    val code: String,
    message: String,
    val action: Map<String, Any>? = null,
) : RuntimeException(message)

@OptIn(ExperimentalContracts::class)
fun requireCondition(condition: Boolean, status: Int, code: String, message: String) {
    contract { returns() implies condition }
    if (!condition) throw ProblemException(status, code, message)
}

@OptIn(ExperimentalContracts::class)
fun <T : Any> requirePresent(value: T?, status: Int, code: String, message: String): T {
    contract { returns() implies (value != null) }
    return value ?: throw ProblemException(status, code, message)
}
