package com.sprintique.catalog.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.IsoDate
import com.sprintique.contract.IsoDateTime
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.TrimmedString
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize
import java.text.BreakIterator
import java.util.Locale

@Schema(name = "TagInput")
data class TagInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 256)
    val name: String,
    /** A named tone, or a colour `#RRGGBB` (trimmed and upper-cased). */
    val tone: String,
    /** Any moment archives the tag; the stored time is the server's. */
    @field:IsoDateTime
    val archivedAt: String? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isNameShort: Boolean get() = graphemes(name) <= NAME_LIMIT

    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isToneKnown: Boolean get() = normalizedTone() != null

    fun normalizedTone(): String? = when {
        tone in TONES -> tone
        COLOUR.matches(tone.trim().uppercase(Locale.ROOT)) -> tone.trim().uppercase(Locale.ROOT)
        else -> null
    }

    private companion object {
        /** Tag names are counted as a person sees them: in grapheme clusters, not UTF-16 units. */
        const val NAME_LIMIT = 32
        val TONES = setOf("neutral", "blue", "purple", "green", "amber", "red")
        val COLOUR = Regex("^#[0-9A-F]{6}$")

        fun graphemes(value: String): Int {
            val iterator = BreakIterator.getCharacterInstance(Locale.forLanguageTag("ru"))
            iterator.setText(value)
            var count = 0
            while (iterator.next() != BreakIterator.DONE) count++
            return count
        }
    }
}

enum class ReleaseStatus(@get:JsonValue val wire: String) { PLANNED("planned"), RELEASED("released") }

@Schema(name = "ReleaseInput")
data class ReleaseInputRequest(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 100)
    val name: String,
    val status: ReleaseStatus,
    @field:IsoDate
    val targetDate: String? = null,
    @field:IsoDateTime
    val archivedAt: String? = null,
)

@Schema(name = "PutTag")
data class PutTagRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: TagInputRequest,
)

@Schema(name = "PutRelease")
data class PutReleaseRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER)
    val baseRevision: Long,
    @field:Valid
    val value: ReleaseInputRequest,
)
