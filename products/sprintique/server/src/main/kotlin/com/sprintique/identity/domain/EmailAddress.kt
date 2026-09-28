package com.sprintique.identity.domain

/**
 * An e-mail address in the one form accounts are matched by: trimmed and lower-cased. Nothing else is rewritten
 * (no dot or plus stripping): two spellings that a mail provider happens to deliver alike stay two addresses.
 */
@JvmInline
value class EmailAddress private constructor(val value: String) {
    /** The part before `@`, a starting name for a person who has not introduced themselves yet. */
    val localPart: String get() = value.substringBefore('@')

    override fun toString() = value

    companion object {
        private const val LIMIT = 254
        private const val LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"

        /** A local part without spaces or quoting, and a domain of ASCII labels (`xn--` for international names). */
        private val SHAPE = Regex("^[^\\s@\"<>(),;:\\\\\\[\\]]{1,64}@$LABEL(?:\\.$LABEL)+$")

        fun parse(raw: String?): EmailAddress? {
            val candidate = raw?.trim()?.lowercase() ?: return null
            return if (candidate.length <= LIMIT && SHAPE.matches(candidate)) EmailAddress(candidate) else null
        }
    }
}
