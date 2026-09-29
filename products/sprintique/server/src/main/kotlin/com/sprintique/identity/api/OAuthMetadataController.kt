package com.sprintique.identity.api

import com.sprintique.configuration.SprintiqueProperties
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Discovery for OAuth clients and MCP clients: the authorization server's metadata (RFC 8414) and the protected
 * resource metadata of the whole API and of the MCP server (RFC 9728). The issuer is the API origin; the
 * authorization endpoint is a page of the interface, where the person signs in.
 */
@RestController
@Profile("api")
class OAuthMetadataController(private val properties: SprintiqueProperties) {
    @GetMapping("/.well-known/oauth-authorization-server")
    fun authorizationServer(): Map<String, Any> = linkedMapOf(
        "issuer" to properties.apiBase,
        "authorization_endpoint" to "${properties.publicOrigin}/oauth/authorize",
        "token_endpoint" to "${properties.apiBase}/api/oauth/token",
        "registration_endpoint" to "${properties.apiBase}/api/oauth/register",
        "revocation_endpoint" to "${properties.apiBase}/api/oauth/revoke",
        "scopes_supported" to SCOPES,
        "response_types_supported" to listOf("code"),
        "response_modes_supported" to listOf("query"),
        "grant_types_supported" to listOf("authorization_code", "refresh_token"),
        "code_challenge_methods_supported" to listOf("S256"),
        "token_endpoint_auth_methods_supported" to AUTH_METHODS,
        "revocation_endpoint_auth_methods_supported" to AUTH_METHODS,
        "authorization_response_iss_parameter_supported" to true,
        "service_documentation" to "${properties.publicOrigin}/",
    )

    /** The whole API as one resource: a token issued for it serves REST and MCP alike. */
    @GetMapping("/.well-known/oauth-protected-resource")
    fun api(): Map<String, Any> = resource(properties.apiBase, "Sprintique API")

    @GetMapping("/.well-known/oauth-protected-resource/mcp")
    fun mcp(): Map<String, Any> = resource(properties.mcpResource, "Sprintique MCP")

    private fun resource(identifier: String, name: String): Map<String, Any> = linkedMapOf(
        "resource" to identifier,
        "authorization_servers" to listOf(properties.apiBase),
        "scopes_supported" to SCOPES,
        "bearer_methods_supported" to listOf("header"),
        "resource_name" to name,
    )

    private companion object {
        val SCOPES = listOf("read", "write")
        val AUTH_METHODS = listOf("none", "client_secret_post", "client_secret_basic")
    }
}
