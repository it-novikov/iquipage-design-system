package com.sprintique.contract

import com.sprintique.web.RequestValidationException
import jakarta.validation.Validator
import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import kotlin.reflect.KClass

/**
 * Turns a parsed JSON body into a request contract and validates it. Controllers call this inside the authenticated
 * operation, so an anonymous caller gets 401 before any rule of the contract is revealed.
 */
@Component
class Contracts(private val json: JsonMapper, private val validator: Validator) {
    fun <T : Any> parse(node: JsonNode?, type: KClass<T>): T {
        if (node == null || node.isMissingNode) throw RequestValidationException()
        val value = try {
            json.treeToValue(node, type.java)
        } catch (@Suppress("SwallowedException") error: JacksonException) {
            // The client learns only that the fields are invalid, never how the parser failed.
            throw RequestValidationException()
        }
        if (validator.validate(value).isNotEmpty()) throw RequestValidationException()
        return value
    }

    final inline fun <reified T : Any> parse(node: JsonNode?): T = parse(node, T::class)

    /** A request value built by the server from other input, held to the same contract as one from the network. */
    fun <T : Any> tree(value: Any, type: KClass<T>): T = parse(json.valueToTree(value), type)

    final inline fun <reified T : Any> tree(value: Any): T = tree(value, T::class)
}

/** Declares the request contract of a route whose body is validated inside the operation (see [Contracts]). */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Accepts(val value: KClass<*>)
