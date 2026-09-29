package com.sprintique.identity.api

import com.sprintique.database.Database
import com.sprintique.identity.application.ClientCredentials
import com.sprintique.identity.application.OAuthClients
import com.sprintique.identity.application.OAuthException
import com.sprintique.identity.application.OAuthTokens
import com.sprintique.web.RequestIds
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64

/**
 * The protocol endpoints of the OAuth 2.1 authorization server: dynamic client registration (RFC 7591), the token
 * endpoint and revocation (RFC 7009). Their formats are the RFCs', so they live outside the versioned `/api/v1` and
 * answer errors as `{error, error_description}`. Request bodies, codes and tokens are never logged.
 */
@RestController
@Profile("api")
class OAuthController(private val database: Database, private val tokens: OAuthTokens) {
    private val log = LoggerFactory.getLogger(OAuthController::class.java)

    @PostMapping("/api/oauth/register")
    fun register(@RequestBody(required = false) body: JsonNode?, request: HttpServletRequest): ResponseEntity<Any> {
        requireJson(request)
        if (body == null ||
            !body.isObject
        ) {
            throw OAuthException("invalid_client_metadata", "A JSON object is required.")
        }
        val metadata = OAuthClients.Metadata(
            redirectUris = strings(body, "redirect_uris"),
            clientName = body.get("client_name")?.let { if (it.isString) it.asString() else null },
            grantTypes = strings(body, "grant_types"),
            responseTypes = strings(body, "response_types"),
            authMethod = body.get("token_endpoint_auth_method")?.let {
                if (it.isString) it.asString() else throw invalidMetadata()
            },
        )
        val registration = OAuthClients.validate(metadata)
        val response = database.transaction { tx -> OAuthClients.register(tx, registration) }
        log.info(
            "oauth.client.registered request_id={} auth_method={}",
            RequestIds.of(request),
            registration.authMethod,
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(response)
    }

    @PostMapping("/api/oauth/token")
    fun token(request: HttpServletRequest): Map<String, Any?> {
        val form = form(request)
        val client = clientOf(request, form)
        val result = when (form["grant_type"]) {
            "authorization_code" -> tokens.exchangeCode(
                client,
                form["code"],
                form["redirect_uri"],
                form["code_verifier"],
                form["resource"],
            )

            "refresh_token" -> tokens.refresh(client, form["refresh_token"], form["scope"], form["resource"])

            null -> throw OAuthException("invalid_request", "grant_type is required.")

            else -> throw OAuthException("unsupported_grant_type", "Supported: authorization_code, refresh_token.")
        }
        log.info("oauth.token.issued request_id={} grant_type={}", RequestIds.of(request), form["grant_type"])
        return result
    }

    @PostMapping("/api/oauth/revoke")
    fun revoke(request: HttpServletRequest): ResponseEntity<Void> {
        val form = form(request)
        tokens.revoke(clientOf(request, form), form["token"])
        return ResponseEntity.ok().build()
    }

    /** A body that is not JSON, or JSON of another type, is invalid metadata in the words of RFC 7591. */
    @ExceptionHandler(HttpMessageNotReadableException::class, HttpMediaTypeNotSupportedException::class)
    fun unreadable(request: HttpServletRequest): ResponseEntity<Map<String, String>> =
        oauthError(OAuthException("invalid_client_metadata", "A JSON object is required."), request)

    @ExceptionHandler(OAuthException::class)
    fun oauthError(error: OAuthException, request: HttpServletRequest): ResponseEntity<Map<String, String>> {
        log.info("oauth.request.refused request_id={} error={}", RequestIds.of(request), error.error)
        val builder = ResponseEntity.status(error.status)
        if (error.status == HttpStatus.UNAUTHORIZED.value()) {
            builder.header("WWW-Authenticate", "Basic realm=\"sprintique\"")
        }
        return builder.contentType(MediaType.APPLICATION_JSON)
            .body(linkedMapOf("error" to error.error, "error_description" to error.message.orEmpty()))
    }

    /** Client authentication: HTTP Basic (RFC 6749 §2.3.1, form-encoded parts) or the form, never both. */
    private fun clientOf(request: HttpServletRequest, form: Map<String, String>): ClientCredentials {
        val header = request.getHeader("Authorization")
        if (header == null) return ClientCredentials(form["client_id"], form["client_secret"])
        val encoded = BASIC.matchEntire(header)?.groupValues?.get(1)
            ?: throw OAuthException("invalid_client", "Client authentication failed.", 401)
        val decoded = runCatching { String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8) }.getOrNull()
        val separator = decoded?.indexOf(':') ?: -1
        if (decoded == null || separator < 0 || form.containsKey("client_secret")) {
            throw OAuthException("invalid_client", "Client authentication failed.", 401)
        }
        val id = decode(decoded.substring(0, separator))
        val secret = decode(decoded.substring(separator + 1))
        if (form["client_id"] != null && form["client_id"] != id) {
            throw OAuthException("invalid_client", "Client authentication failed.", 401)
        }
        return ClientCredentials(id, secret)
    }

    private fun requireJson(request: HttpServletRequest) {
        val type = request.contentType?.substringBefore(';')?.trim()?.lowercase()
        if (type != MediaType.APPLICATION_JSON_VALUE) {
            throw OAuthException("invalid_client_metadata", "Content-Type must be application/json.")
        }
    }

    private fun invalidMetadata() = OAuthException("invalid_client_metadata", "Invalid client metadata.")

    /** A list of strings, or null when absent; any other shape is invalid metadata. */
    private fun strings(body: JsonNode, name: String): List<String>? {
        val node = body.get(name) ?: return null
        if (node.isNull) return null
        if (!node.isArray || node.size() > MAX_LIST || node.values().any { !it.isString }) throw invalidMetadata()
        return node.values().map { it.asString() }
    }

    /**
     * The form body of a token or revocation request: `application/x-www-form-urlencoded`, no parameter twice, nothing
     * in the query string (credentials never travel in a URL).
     */
    private fun form(request: HttpServletRequest): Map<String, String> {
        val type = request.contentType?.substringBefore(';')?.trim()?.lowercase()
        if (type != MediaType.APPLICATION_FORM_URLENCODED_VALUE || request.queryString != null) {
            throw OAuthException("invalid_request", "Send the parameters as an application/x-www-form-urlencoded body.")
        }
        val body = request.inputStream.readNBytes(FORM_LIMIT + 1)
        if (body.size > FORM_LIMIT) throw OAuthException("invalid_request", "The request is too large.")
        val values = LinkedHashMap<String, String>()
        for (pair in String(body, StandardCharsets.UTF_8).split('&').filter(String::isNotEmpty)) {
            val name = decode(pair.substringBefore('='))
            val value = decode(pair.substringAfter('=', ""))
            if (values.put(name, value) != null) {
                throw OAuthException("invalid_request", "A parameter was sent more than once.")
            }
        }
        return values.filterValues(String::isNotEmpty)
    }

    private fun decode(value: String): String = try {
        URLDecoder.decode(value, StandardCharsets.UTF_8)
    } catch (@Suppress("SwallowedException") error: IllegalArgumentException) {
        throw OAuthException("invalid_request", "The request is not correctly encoded.")
    }

    private companion object {
        const val FORM_LIMIT = 16 * 1024
        const val MAX_LIST = 20
        val BASIC = Regex("^[Bb]asic ([A-Za-z0-9+/=]{1,1024})$")
    }
}
