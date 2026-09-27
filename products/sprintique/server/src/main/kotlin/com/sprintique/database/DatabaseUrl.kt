package com.sprintique.database

import java.net.URI
import java.net.URLDecoder
import java.util.Properties

/**
 * A libpq-style database URL translated for JDBC. The test cluster listens on a Unix socket only, so a `host`
 * query parameter that is a directory selects the socket through junixsocket instead of opening a TCP port.
 */
data class DatabaseUrl(val jdbcUrl: String, val properties: Properties, val user: String) {
    companion object {
        private const val DEFAULT_PORT = 5432
        private val SCHEMES = setOf("postgres", "postgresql")

        fun parse(value: String): DatabaseUrl {
            require(value.isNotBlank()) { "Database URL is empty" }
            val uri = URI(value)
            require(uri.scheme in SCHEMES) { "Database URL must start with postgresql://" }
            val query = parseQuery(uri.rawQuery)
            val (user, password) = parseUserInfo(uri.rawUserInfo)
            val database = uri.rawPath.removePrefix("/").let(::decode).ifEmpty { user }
            val port = if (uri.port > 0) uri.port else query["port"]?.toInt() ?: DEFAULT_PORT
            val socketDirectory = query["host"]?.takeIf { it.startsWith("/") }
            val properties = Properties().apply {
                setProperty("user", user)
                if (password != null) setProperty("password", password)
                // Parameters travel untyped, so PostgreSQL infers each type from its use, as it does for libpq clients.
                setProperty("stringtype", "unspecified")
                setProperty("ApplicationName", "sprintique")
                query["sslmode"]?.let { setProperty("sslmode", it) }
                if (socketDirectory != null) {
                    setProperty("socketFactory", "org.newsclub.net.unix.AFUNIXSocketFactory\$FactoryArg")
                    setProperty("socketFactoryArg", "$socketDirectory/.s.PGSQL.$port")
                }
            }
            val host = if (socketDirectory != null) "localhost" else uri.host ?: query["host"] ?: "localhost"
            return DatabaseUrl("jdbc:postgresql://$host:$port/$database", properties, user)
        }

        private fun parseUserInfo(raw: String?): Pair<String, String?> {
            if (raw.isNullOrEmpty()) return System.getProperty("user.name") to null
            val separator = raw.indexOf(':')
            return if (separator < 0) {
                decode(raw) to null
            } else {
                decode(raw.substring(0, separator)) to decode(raw.substring(separator + 1))
            }
        }

        private fun parseQuery(raw: String?): Map<String, String> =
            raw.orEmpty().split('&').filter { it.isNotEmpty() }.associate { pair ->
                val separator = pair.indexOf('=')
                if (separator < 0) decode(pair) to "" else decode(pair.substring(0, separator)) to decode(pair.substring(separator + 1))
            }

        private fun decode(value: String) = URLDecoder.decode(value, Charsets.UTF_8)
    }
}
