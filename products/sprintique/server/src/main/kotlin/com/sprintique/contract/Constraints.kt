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

/** A list of resource identifiers (see [RESOURCE_ID]). */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [ResourceIdsValidator::class])
annotation class ResourceIds(
    val message: String = "must be resource identifiers",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class ResourceIdsValidator : ConstraintValidator<ResourceIds, Collection<*>?> {
    private val pattern = Regex(RESOURCE_ID)

    override fun isValid(value: Collection<*>?, context: ConstraintValidatorContext): Boolean =
        value == null || value.all { it is String && pattern.matches(it) }
}

/**
 * A moment written in ISO 8601 as the contracts accept it: a real date, `HH:MM` with optional seconds and fraction,
 * and `Z` — or, with [offset], also a `±HH:MM` offset.
 */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [IsoDateTimeValidator::class])
annotation class IsoDateTime(
    val offset: Boolean = false,
    val message: String = "must be a moment",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class IsoDateTimeValidator : ConstraintValidator<IsoDateTime, String?> {
    private var pattern = shape(offset = false)

    override fun initialize(annotation: IsoDateTime) {
        pattern = shape(annotation.offset)
    }

    override fun isValid(value: String?, context: ConstraintValidatorContext): Boolean {
        if (value == null) return true
        if (!pattern.matches(value)) return false
        return runCatching { LocalDate.parse(value.substring(0, DATE_LENGTH), DATE) }.isSuccess
    }

    private companion object {
        const val DATE_LENGTH = 10
        val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT)

        fun shape(offset: Boolean): Regex {
            val zone = if (offset) "(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)" else "Z"
            return Regex("^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?$zone$")
        }
    }
}
