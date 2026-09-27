package com.sprintique.contract

import jakarta.validation.Constraint
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import jakarta.validation.Payload
import tools.jackson.core.JsonParser
import tools.jackson.core.JsonToken
import tools.jackson.databind.DeserializationContext
import tools.jackson.databind.ValueDeserializer
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import kotlin.reflect.KClass

/*
 * Constraints shared by the request contracts. Each one mirrors a rule of the Zod contracts the interface validates
 * with, so the server and the browser accept the same input.
 */

/** Resource identifiers: 1–100 of `A–Z a–z 0–9 _ -`. */
const val RESOURCE_ID = "^[A-Za-z0-9_-]{1,100}$"

/** Revisions are non-negative safe integers of JavaScript clients. */
const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

/** A string field is trimmed before its length is checked and before it is stored. Only a JSON string is accepted. */
class TrimmedString : ValueDeserializer<String>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): String {
        if (parser.currentToken() !=
            JsonToken.VALUE_STRING
        ) {
            return context.handleUnexpectedToken(String::class.java, parser) as String
        }
        return parser.string.trim()
    }
}

/** A calendar date written `YYYY-MM-DD` that exists. */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER, AnnotationTarget.TYPE)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [IsoDateValidator::class])
annotation class IsoDate(
    val message: String = "must be a date",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class IsoDateValidator : ConstraintValidator<IsoDate, String?> {
    private val format = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT)

    override fun isValid(value: String?, context: ConstraintValidatorContext): Boolean =
        value == null || runCatching { LocalDate.parse(value, format) }.isSuccess
}

/** An IANA time zone: `UTC` or a `Region/City` name the runtime knows. */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [TimezoneValidator::class])
annotation class Timezone(
    val message: String = "must be a time zone",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class TimezoneValidator : ConstraintValidator<Timezone, String?> {
    override fun isValid(value: String?, context: ConstraintValidatorContext): Boolean =
        value == null ||
            (
                value.length in 1..MAX_TIMEZONE && (value == "UTC" || '/' in value) &&
                    runCatching { ZoneId.of(value) }.isSuccess
                )

    private companion object {
        const val MAX_TIMEZONE = 100
    }
}

/** A list without repeated items. */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [UniqueItemsValidator::class])
annotation class UniqueItems(
    val message: String = "must not repeat items",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class UniqueItemsValidator : ConstraintValidator<UniqueItems, Collection<*>?> {
    override fun isValid(value: Collection<*>?, context: ConstraintValidatorContext): Boolean =
        value == null || value.toSet().size == value.size
}

/** An RFC 9562 UUID of versions 1–8, as the contracts accept it. */
const val UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
