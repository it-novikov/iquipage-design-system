package com.sprintique.identity.infrastructure

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.util.DefaultResourceRetriever
import com.nimbusds.oauth2.sdk.AuthorizationCode
import com.nimbusds.oauth2.sdk.AuthorizationCodeGrant
import com.nimbusds.oauth2.sdk.AuthorizationResponse
import com.nimbusds.oauth2.sdk.ResponseType
import com.nimbusds.oauth2.sdk.Scope
import com.nimbusds.oauth2.sdk.TokenRequest
import com.nimbusds.oauth2.sdk.auth.ClientAuthentication
import com.nimbusds.oauth2.sdk.auth.ClientAuthenticationMethod
import com.nimbusds.oauth2.sdk.auth.ClientSecretBasic
import com.nimbusds.oauth2.sdk.auth.ClientSecretPost
import com.nimbusds.oauth2.sdk.auth.Secret
import com.nimbusds.oauth2.sdk.http.HTTPRequest
import com.nimbusds.oauth2.sdk.id.ClientID
import com.nimbusds.oauth2.sdk.id.Issuer
import com.nimbusds.oauth2.sdk.id.State
import com.nimbusds.oauth2.sdk.pkce.CodeChallengeMethod
import com.nimbusds.oauth2.sdk.pkce.CodeVerifier
import com.nimbusds.openid.connect.sdk.AuthenticationRequest
import com.nimbusds.openid.connect.sdk.Nonce
import com.nimbusds.openid.connect.sdk.OIDCTokenResponse
import com.nimbusds.openid.connect.sdk.OIDCTokenResponseParser
import com.nimbusds.openid.connect.sdk.op.OIDCProviderMetadata
import com.nimbusds.openid.connect.sdk.token.OIDCTokens
import com.nimbusds.openid.connect.sdk.validators.IDTokenValidator
import com.sprintique.configuration.OidcProperties
import com.sprintique.identity.application.ExternalIdentity
import com.sprintique.identity.application.IdentityProviderPort
import com.sprintique.identity.application.SignInRejectedException
import com.sprintique.identity.application.SignInStart
import java.net.URI
import javax.net.ssl.SSLSocketFactory

/**
 * OpenID Connect over the Nimbus SDK. Discovery is cached and retried after a failure; every call to the provider
 * has a timeout. `socketFactory` lets a local stand trust its own certificate authority without touching the JVM.
 */
class OidcIdentityProviderAdapter(
    private val settings: OidcProperties,
    private val socketFactory: SSLSocketFactory? = null,
) : IdentityProviderPort {
    @Volatile private var metadata: OIDCProviderMetadata? = null

    override fun start(redirect: URI): SignInStart {
        val provider = discovered()
        val state = State()
        val nonce = Nonce()
        val verifier = CodeVerifier()
        val clientId = ClientID(settings.clientId)
        val request = AuthenticationRequest.Builder(ResponseType.CODE, Scope("openid", "profile"), clientId, redirect)
            .endpointURI(provider.authorizationEndpointURI)
            .state(state)
            .nonce(nonce)
            .codeChallenge(verifier, CodeChallengeMethod.S256)
            .build()
        return SignInStart(request.toURI(), state.value, nonce.value, verifier.value)
    }

    override fun complete(
        callback: URI,
        redirect: URI,
        state: String,
        nonce: String,
        verifier: String,
    ): ExternalIdentity {
        try {
            val provider = discovered()
            val response = AuthorizationResponse.parse(callback).toSuccessResponse()
            check(response.state?.value == state) { "state" }
            response.issuer?.let { check(it == provider.issuer) { "iss" } }
            val code: AuthorizationCode = response.authorizationCode ?: error("code")
            val grant = AuthorizationCodeGrant(code, redirect, CodeVerifier(verifier))
            val authentication = clientAuthentication(provider)
            val tokenRequest = TokenRequest.Builder(provider.tokenEndpointURI, authentication, grant).build()
            val http = tokenRequest.toHTTPRequest().withTimeouts()
            val success = OIDCTokenResponseParser.parse(http.send()).toSuccessResponse() as OIDCTokenResponse
            val tokens: OIDCTokens = success.oidcTokens
            val algorithm = provider.idTokenJWSAlgs?.firstOrNull() ?: JWSAlgorithm.RS256
            val retriever =
                DefaultResourceRetriever(TIMEOUT_MILLISECONDS, TIMEOUT_MILLISECONDS, KEY_SET_LIMIT, true, socketFactory)
            val validator =
                IDTokenValidator(provider.issuer, ClientID(settings.clientId), algorithm, keySet(provider), retriever)
            val claims = validator.validate(tokens.idToken, Nonce(nonce))
            val subject = claims.subject?.value ?: error("sub")
            val emailVerified = claims.getBooleanClaim("email_verified") == true
            val email = claims.getStringClaim("email")?.takeIf { emailVerified && EMAIL.matches(it) }?.take(EMAIL_LIMIT)
            val name = (claims.getStringClaim("name") ?: "Участник").take(NAME_LIMIT)
            return ExternalIdentity(settings.issuer, subject, name, email)
        } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
            throw SignInRejectedException(error)
        }
    }

    /** HTTP Basic unless the provider lists only form-posted secrets; Basic is the default of the standard. */
    private fun clientAuthentication(provider: OIDCProviderMetadata): ClientAuthentication {
        val clientId = ClientID(settings.clientId)
        val secret = Secret(settings.clientSecret)
        val methods = provider.tokenEndpointAuthMethods
        return if (methods.isNullOrEmpty() || ClientAuthenticationMethod.CLIENT_SECRET_BASIC in methods) {
            ClientSecretBasic(clientId, secret)
        } else {
            ClientSecretPost(clientId, secret)
        }
    }

    private fun keySet(provider: OIDCProviderMetadata) = provider.jwkSetURI.toURL()

    private fun discovered(): OIDCProviderMetadata = metadata ?: synchronized(this) {
        metadata ?: run {
            val url = URI(settings.issuer.trimEnd('/') + "/.well-known/openid-configuration")
            val response = HTTPRequest(HTTPRequest.Method.GET, url).withTimeouts().send()
            OIDCProviderMetadata.parse(response.bodyAsJSONObject).also { found ->
                check(found.issuer == Issuer(settings.issuer)) { "Discovered issuer differs from the configured one" }
                metadata = found
            }
        }
    }

    private fun HTTPRequest.withTimeouts(): HTTPRequest = apply {
        connectTimeout = TIMEOUT_MILLISECONDS
        readTimeout = TIMEOUT_MILLISECONDS
        socketFactory?.let { sslSocketFactory = it }
    }

    private companion object {
        const val TIMEOUT_MILLISECONDS = 10_000
        const val KEY_SET_LIMIT = 512 * 1024
        const val NAME_LIMIT = 100
        const val EMAIL_LIMIT = 320
        val EMAIL = Regex("^[^\\s@]{1,64}@[^\\s@]{1,255}$")
    }
}
