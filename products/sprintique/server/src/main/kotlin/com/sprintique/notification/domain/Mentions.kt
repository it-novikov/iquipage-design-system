package com.sprintique.notification.domain

import java.util.regex.Pattern

/** A person who can be mentioned: their id and display name. */
data class MentionCandidate(val id: String, val name: String)

/**
 * Mentions in a discussion message. The editor has no picker, so a mention is the person's name typed after `@`:
 * the full display name (`@Анна Кузнецова`) or, when no one else in the project shares it, the first name (`@Анна`).
 * Case does not matter; the name must stand alone (`@Аннабель` is not Анна), and `@` inside a word (an address) or in
 * code is not a mention.
 */
object Mentions {
    /** At most this many people are notified by one message: a list of the whole team is not a mention. */
    const val LIMIT = 20
    private val FENCED = Regex("```[\\s\\S]*?(```|$)")
    private val INLINE = Regex("`[^`\\n]*`")
    private const val NAME_END = "(?![\\p{L}\\p{N}_])"
    private const val MENTION_START = "(?<![\\p{L}\\p{N}_@.])@"

    fun find(body: String, people: List<MentionCandidate>): List<String> {
        if ('@' !in body) return emptyList()
        val text = INLINE.replace(FENCED.replace(body, " "), " ")
        val firstNames = people.groupingBy { firstName(it.name).lowercase() }.eachCount()
        return people.filter { person ->
            val full = normalized(person.name)
            val first = firstName(full)
            val unique = first.isNotEmpty() && firstNames[first.lowercase()] == 1
            listOfNotNull(full.ifEmpty { null }, first.takeIf { unique }).any { pattern(it).matcher(text).find() }
        }.map(MentionCandidate::id).distinct().take(LIMIT)
    }

    private fun normalized(name: String) = name.trim().replace(Regex("\\s+"), " ")

    private fun firstName(name: String) = normalized(name).substringBefore(' ')

    /** `@` and the name, its words separated by any whitespace, matched without regard to case. */
    private fun pattern(alias: String): Pattern = Pattern.compile(
        MENTION_START + alias.split(' ').joinToString("\\s+", transform = Pattern::quote) + NAME_END,
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE,
    )
}
