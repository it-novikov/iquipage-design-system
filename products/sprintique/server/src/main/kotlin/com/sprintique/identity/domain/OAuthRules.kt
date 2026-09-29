package com.sprintique.identity.domain

import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest
import java.util.Base64

/**
 * The rules of the OAuth 2.1 authorization server that need no storage: which redirect addresses a client may
 * register, how a PKCE verifier proves its challenge, which scopes and resources a request may name.
 */
object OAuthRules {
    const val MAX_REDIRECT_URIS = 10
    private const val MAX_URI_LENGTH = 2000
    private const val MAX_STATE_LENGTH = 1000
    private val LOOPBACK = setOf("127.0.0.1", "[::1]", "localhost")
    private val VERIFIER = Regex("^[A-Za-z0-9._~-]{43,128}$")
    private val CHALLENGE = Regex("^[A-Za-z0-9_-]{43}$")
    private val STATE = Regex("^[\\x20-\\x7E]{1,$MAX_STATE_LENGTH}$")

    /**
     * An address a client may register: absolute, `https`, or `http` on the loopback interface for native apps
     * (RFC 8252), without userinfo or fragment. Compared later by exact string, so no normalization happens here.
     */
    fun isAllowedRedirect(value: String): Boolean {
        if (value.length > MAX_URI_LENGTH || value.any { it.isWhitespace() || it.isISOControl() }) return false
        val uri = try {
            URI(value)
        } catch (@Suppress("SwallowedException") error: URISyntaxException) {
            return false
        }
        val host = uri.host?.lowercase() ?: return false
        return uri.isAbsolute && !uri.isOpaque && uri.rawUserInfo == null && uri.rawFragment == null &&
            (uri.scheme == "https" || (uri.scheme == "http" && host in LOOPBACK))
    }

    /**
     * Whether the redirect address of an authorization request matches a registered one: the exact string, or, for
     * an `http` loopback address of a native app, the same address on another port (RFC 8252 §7.3), because the app
     * listens on whichever port is free at the time. Scheme, host, path and query must still be identical.
     */
    fun matchesRegistered(requested: String, registered: String): Boolean {
        if (requested == registered) return true
        if (!isAllowedRedirect(requested) || !isAllowedRedirect(registered)) return false
        val asked = URI(requested)
        val known = URI(registered)
        return known.scheme == "http" && asked.scheme == "http" && known.host.lowercase() in LOOPBACK &&
            asked.host.lowercase() == known.host.lowercase() && asked.rawPath == known.rawPath &&
            asked.rawQuery == known.rawQuery
    }

    /** A code challenge of method S256: the base64url SHA-256 of a verifier, 43 characters. */
    fun isChallenge(value: String): Boolean = CHALLENGE.matches(value)

    /** RFC 7636: the verifier, 43–128 unreserved characters, hashes to the challenge. Compared in constant time. */
    fun verifies(verifier: String, challenge: String): Boolean {
        if (!VERIFIER.matches(verifier) || !isChallenge(challenge)) return false
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        val computed = Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
        return MessageDigest.isEqual(computed.toByteArray(), challenge.toByteArray())
    }

    /** `state` is echoed to the client unchanged: printable ASCII of bounded length. */
    fun isState(value: String): Boolean = STATE.matches(value)

    /**
     * The scopes a request names, space separated. No scope means `read`; `write` always comes with `read`; an
     * unknown scope makes the whole request invalid (null).
     */
    fun scopes(value: String?): Set<Scope>? {
        if (value.isNullOrBlank()) return setOf(Scope.READ)
        val names = value.trim().split(' ').filter(String::isNotEmpty)
        val scopes = names.map { Scope.fromWire(it) ?: return null }.toSet()
        return scopes + Scope.READ
    }

    fun wire(scopes: Set<Scope>): String = Scope.entries.filter { it in scopes }.joinToString(" ") { it.wire }

    /**
     * RFC 8707: the resource a token is for. Absent means the MCP server; otherwise it must be one of this server's
     * resources, compared without a single trailing slash. Null when it names anything else.
     */
    fun resource(value: String?, api: String, mcp: String): String? {
        if (value == null) return mcp
        val trimmed = value.removeSuffix("/")
        return trimmed.takeIf { it == api || it == mcp }
    }

    /** Appends parameters to a registered redirect address, keeping its own query. */
    fun redirect(base: String, parameters: Map<String, String>): String {
        val query = parameters.entries.joinToString("&") { (name, value) ->
            "$name=" + java.net.URLEncoder.encode(value, Charsets.UTF_8).replace("+", "%20")
        }
        return base + (if (URI(base).rawQuery == null) "?" else "&") + query
    }
}
