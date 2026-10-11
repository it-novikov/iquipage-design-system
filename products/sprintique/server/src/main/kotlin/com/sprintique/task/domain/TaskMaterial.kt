package com.sprintique.task.domain

import com.sprintique.problem.requireCondition
import java.net.IDN
import java.net.URI

/** An external reference belongs to one task; archiving removes only that reference. */
data class TaskMaterialValue(val category: String, val title: String, val url: String, val archived: Boolean)

object TaskMaterialRules {
    const val ACTIVE_LIMIT = 100
    const val TITLE_LIMIT = 200
    const val URL_LIMIT = 2048
    private const val MAX_PORT = 65535

    /** Preserve the trimmed address, including query, fragment and Unicode path; never fetch the destination. */
    fun checked(value: TaskMaterialValue): TaskMaterialValue {
        requireCondition(
            value.category in setOf("design", "documentation"), 422, "MATERIAL_CATEGORY", "Выберите раздел материала.",
        )
        val title = value.title.trim()
        requireCondition(
            title.isNotEmpty() && title.length <= TITLE_LIMIT,
            422, "MATERIAL_TITLE", "Введите название материала до 200 знаков.",
        )
        val raw = value.url.trim()
        val uri = runCatching { URI(raw) }.getOrNull()
        val valid = raw.length <= URL_LIMIT && raw.none { it.isWhitespace() || it.isISOControl() || it == '\\' } &&
            uri != null && uri.scheme?.lowercase() in setOf("http", "https") && validAuthority(uri)
        requireCondition(
            valid, 422, "MATERIAL_URL", "Введите ссылку с http:// или https:// без логина и пароля.",
        )
        requireCondition(
            raw.toByteArray(Charsets.UTF_8).size <= URL_LIMIT, 422, "MATERIAL_URL", "Ссылка слишком длинная.",
        )
        return value.copy(title = title, url = raw)
    }

    /** Validate Unicode hostnames without rewriting the stored address. */
    private fun validAuthority(uri: URI): Boolean {
        val authority = uri.rawAuthority ?: return false
        if ('@' in authority || uri.rawUserInfo != null) return false
        if (!uri.host.isNullOrEmpty()) return uri.port in -1..MAX_PORT
        return runCatching {
            val parts = authority.split(':')
            if (parts.size > 2 || parts.first().isEmpty()) return false
            val host = IDN.toASCII(parts.first(), IDN.USE_STD3_ASCII_RULES)
            val suffix = if (parts.size == 2) ":${parts[1]}" else ""
            val parsed = URI("https://$host$suffix")
            !parsed.host.isNullOrEmpty() && parsed.port in -1..MAX_PORT
        }.getOrDefault(false)
    }
}
