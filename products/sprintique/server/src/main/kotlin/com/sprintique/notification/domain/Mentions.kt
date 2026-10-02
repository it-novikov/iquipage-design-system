package com.sprintique.notification.domain

import java.util.regex.Pattern

/**
 * A member who can be mentioned: a person or a service account, by id and display name. A service account is found by
 * its full name only: its first word never makes a person's first name ambiguous, nor stands for the account.
 */
data class MentionCandidate(val id: String, val name: String, val service: Boolean = false)

/**
 * Mentions in a discussion message (docs/decisions/0008-mentions-and-service-inbox.md). The editor's @ list writes a
 * token, `@[Имя](user:<id>)`, which names the member by id and so survives a rename; the label is only what the author
 * saw and is never trusted. A token counts only for a current member of the project. Plain text keeps working as
 * before: the full display name (`@Анна Кузнецова`) or, when no one else in the project shares it, the first name
 * (`@Анна`). Case does not matter; a name must stand alone (`@Аннабель` is not Анна), and `@` inside a word (an
 * address) or in code is not a mention. Tokens come first, then typed names, at most [LIMIT] members in all.
 */
object Mentions {
    /** At most this many members are notified by one message: a list of the whole team is not a mention. */
    const val LIMIT = 20
    private val FENCED = Regex("(?m)^ {0,3}(`{3,}|~{3,})[\\s\\S]*?(^ {0,3}\\1|\\z)")
    private val INLINE = Regex("(`+)[^`\\n]*?\\1")
    private const val NAME_END = "(?![\\p{L}\\p{N}_])"
    private const val MENTION_START = "(?<![\\p{L}\\p{N}_@.])@"

    /** The token as the DS writes it (mention-tokens.js): a one-line label without brackets, an id of [A-Za-z0-9_-]. */
    val TOKEN = Regex("$MENTION_START\\[([^\\[\\]\\\\\\n]{1,80})]\\(user:([A-Za-z0-9_-]{1,100})\\)")

    fun find(body: String, people: List<MentionCandidate>): List<String> {
        if ('@' !in body) return emptyList()
        val text = withoutCode(body)
        val members = people.associateBy(MentionCandidate::id)
        val explicit = TOKEN.findAll(text).map { it.groupValues[2] }.filter(members::containsKey).toList()
        // Typed names are read in the text around the tokens, so a token's own label never counts twice.
        val typed = TOKEN.replace(text, " ")
        val firstNames = people.filterNot(MentionCandidate::service)
            .groupingBy { firstName(it.name).lowercase() }.eachCount()
        val named = if ('@' !in typed) {
            emptyList()
        } else {
            people.filter { person ->
                val full = normalized(person.name)
                val first = firstName(full)
                val unique = !person.service && first.isNotEmpty() && firstNames[first.lowercase()] == 1
                listOfNotNull(full.ifEmpty { null }, first.takeIf { unique }).any { pattern(it).matcher(typed).find() }
            }.map(MentionCandidate::id)
        }
        return (explicit + named).distinct().take(LIMIT)
    }

    /**
     * The message as plain text for a short quote: every token outside code becomes «@» and the member's current name
     * when [names] knows the id, else its label alone, which reads as text and never as a mention.
     */
    fun plainText(body: String, names: Map<String, String>): String {
        val code = codeRanges(body)
        return TOKEN.replace(body) { match ->
            if (code.any { match.range.first in it }) {
                match.value
            } else {
                names[match.groupValues[2]]?.let { "@$it" } ?: match.groupValues[1]
            }
        }
    }

    private fun withoutCode(body: String) = INLINE.replace(FENCED.replace(body, " "), " ")

    /** Where code is in the original text (fences, then inline spans outside them), offsets kept. */
    private fun codeRanges(body: String): List<IntRange> =
        FENCED.findAll(body).map { it.range }.toList() +
            INLINE.findAll(FENCED.replace(body) { " ".repeat(it.value.length) }).map { it.range }

    private fun normalized(name: String) = name.trim().replace(Regex("\\s+"), " ")

    private fun firstName(name: String) = normalized(name).substringBefore(' ')

    /** `@` and the name, its words separated by any whitespace, matched without regard to case. */
    private fun pattern(alias: String): Pattern = Pattern.compile(
        MENTION_START + alias.split(' ').joinToString("\\s+", transform = Pattern::quote) + NAME_END,
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE,
    )
}
