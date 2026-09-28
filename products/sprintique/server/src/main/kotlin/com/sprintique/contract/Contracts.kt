package com.sprintique.contract

import com.sprintique.web.RequestValidationException
import jakarta.validation.Validator
import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import kotlin.reflect.KClass
import kotlin.reflect.full.memberProperties
import kotlin.reflect.full.primaryConstructor

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
        requireFields(value, node)
        return value
    }

    /**
     * Every field without a default must be in the body, a nullable one included: as in the Zod contracts, a field
     * is cleared only by an explicit `null`, never by leaving it out. Nested contracts are checked the same way.
     */
    private fun requireFields(value: Any?, node: JsonNode) {
        when {
            value == null -> Unit

            value is Collection<*> && node.isArray -> value.zip(node.values().toList()).forEach { (item, child) ->
                requireFields(item, child)
            }

            node.isObject && value::class.java.packageName.startsWith(CONTRACT_PACKAGES) && !value::class.isValue -> {
                val properties = value::class.memberProperties.associateBy { it.name }
                for (parameter in value::class.primaryConstructor?.parameters.orEmpty()) {
                    val child = parameter.name?.let(node::get)
                    if (child == null && !parameter.isOptional) throw RequestValidationException()
                    if (child != null) requireFields(properties[parameter.name]?.getter?.call(value), child)
                }
            }
        }
    }

    final inline fun <reified T : Any> parse(node: JsonNode?): T = parse(node, T::class)

    /** A request value built by the server from other input, held to the same contract as one from the network. */
    fun <T : Any> tree(value: Any, type: KClass<T>): T = parse(json.valueToTree(value), type)

    final inline fun <reified T : Any> tree(value: Any): T = tree(value, T::class)

    private companion object {
        const val CONTRACT_PACKAGES = "com.sprintique"
    }
}

/** Declares the request contract of a route whose body is validated inside the operation (see [Contracts]). */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Accepts(val value: KClass<*>)

/** The route is a command with a retry ledger: callers send an `Idempotency-Key` and may repeat the request safely. */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Idempotent
