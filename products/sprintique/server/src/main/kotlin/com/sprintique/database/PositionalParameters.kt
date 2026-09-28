package com.sprintique.database

/**
 * Rewrites PostgreSQL positional parameters (`$1`) into JDBC placeholders (`?`), skipping string literals, quoted
 * identifiers, dollar-quoted bodies and comments. A parameter used twice is bound twice.
 */
internal object PositionalParameters {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Pair<String, List<Int>>>()

    fun rewrite(sql: String): Pair<String, List<Int>> = cache.computeIfAbsent(sql, ::scan)

    @Suppress("CyclomaticComplexMethod", "LoopWithTooManyJumpStatements", "NestedBlockDepth")
    private fun scan(sql: String): Pair<String, List<Int>> {
        val out = StringBuilder(sql.length)
        val order = mutableListOf<Int>()
        var index = 0
        while (index < sql.length) {
            val char = sql[index]
            val next = sql.getOrNull(index + 1)
            when {
                char == '\'' || char == '"' -> {
                    val end = closingQuote(sql, index, char)
                    out.append(sql, index, end)
                    index = end
                }

                char == '-' && next == '-' -> {
                    val end = sql.indexOf('\n', index).let { if (it < 0) sql.length else it }
                    out.append(sql, index, end)
                    index = end
                }

                char == '/' && next == '*' -> {
                    val end = sql.indexOf("*/", index + 2).let { if (it < 0) sql.length else it + 2 }
                    out.append(sql, index, end)
                    index = end
                }

                char == '$' && next != null && next.isDigit() -> {
                    var end = index + 1
                    while (end < sql.length && sql[end].isDigit()) end++
                    order += sql.substring(index + 1, end).toInt()
                    out.append('?')
                    index = end
                }

                char == '$' -> {
                    val tagEnd = dollarTagEnd(sql, index)
                    if (tagEnd < 0) {
                        out.append(char)
                        index++
                    } else {
                        val tag = sql.substring(index, tagEnd + 1)
                        val close = sql.indexOf(tag, tagEnd + 1).let { if (it < 0) sql.length else it + tag.length }
                        out.append(sql, index, close)
                        index = close
                    }
                }

                char == '?' -> {
                    error("A literal ? would be read as a JDBC placeholder; use positional parameters")
                }

                else -> {
                    out.append(char)
                    index++
                }
            }
        }
        return out.toString() to order
    }

    private fun closingQuote(sql: String, start: Int, quote: Char): Int {
        var index = start + 1
        while (index < sql.length) {
            if (sql[index] == quote) {
                if (sql.getOrNull(index + 1) == quote) {
                    index += 2
                    continue
                }
                return index + 1
            }
            index++
        }
        return sql.length
    }

    /** Index of the closing `$` of a dollar-quote tag such as `$$` or `$body$`, or -1 when `$` starts no tag. */
    private fun dollarTagEnd(sql: String, start: Int): Int {
        var index = start + 1
        while (index < sql.length && (sql[index].isLetterOrDigit() || sql[index] == '_')) index++
        return if (index < sql.length && sql[index] == '$') index else -1
    }
}
