package com.sprintique.identity.infrastructure

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.util.DefaultResourceRetriever
import com.nimbusds.jose.util.JSONObjectUtils
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.oauth2.sdk.AuthorizationCode
import com.nimbusds.oauth2.sdk.AuthorizationCodeGrant
import com.nimbusds.oauth2.sdk.AuthorizationResponse
import com.nimbusds.oauth2.sdk.ResponseMode
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
import com.nimbusds.openid.connect.sdk.Prompt
import com.nimbusds.openid.connect.sdk.op.OIDCProviderMetadata
import com.nimbusds.openid.connect.sdk.validators.IDTokenValidator
import com.sprintique.identity.application.ExternalIdentity
import com.sprintique.identity.application.IdentityProviderPort
import com.sprintique.identity.application.SignInRejectedException
import com.sprintique.identity.application.SignInStart
import com.sprintique.identity.domain.EmailAddress
import java.net.URI
import javax.net.ssl.SSLSocketFactory

/** What sets one provider apart from another; everything else is the standard flow. */
data class OidcClient(
    val name: String,
    val issuer: String,
    val clientId: String,
    /** Called for every token request: Apple's secret is a short-lived signed token. */
    val clientSecret: () -> String,
    val scope: Scope,
    /** Apple posts the callback as a form whenever the name or e-mail is requested. */
    val formPost: Boolean = false,
    val prompt: Prompt? = null,
    /** Whether the provider vouches for the ID token's `email` enough to join an existing account by it. */
    val trustsEmail: (JWTClaimsSet) -> Boolean,
)

/**
 * OpenID Connect over the Nimbus SDK. Discovery is cached and retried after a failure; every call to the provider
 * has a timeout. PKCE is used whenever the provider announces S256. `socketFactory` lets a local or test stand trust
 * its own certificate authority without touching the JVM.
 */
class OidcIdentityProviderAdapter(
    private val client: OidcClient,
    private val socketFactory: SSLSocketFactory? = null,
) : IdentityProviderPort {
    @Volatile private var metadata: OIDCProviderMetadata? = null

    override val name: String get() = client.name

    override val postsCallback: Boolean get() = client.formPost

    override fun start(redirect: URI): SignInStart {
        val provider = discovered()
        val state = State()
        val nonce = Nonce()
        val verifier = CodeVerifier()
        val clientId = ClientID(client.clientId)
        val request = AuthenticationRequest.Builder(ResponseType.CODE, client.scope, clientId, redirect)
            .endpointURI(provider.authorizationEndpointURI)
            .state(state)
            .nonce(nonce)
            .apply { if (usesPkce(provider)) codeChallenge(verifier, CodeChallengeMethod.S256) }
            .apply { if (client.formPost) responseMode(ResponseMode.FORM_POST) }
            .apply { client.prompt?.let { prompt(it) } }
            .build()
        return SignInStart(request.toURI(), state.value, nonce.value, verifier.value)
    }

    override fun complete(
        parameters: Map<String, List<String>>,
        redirect: URI,
        state: String,
        nonce: String,
        verifier: String,
    ): ExternalIdentity {
        try {
            val provider = discovered()
            val response = AuthorizationResponse.parse(redirect, parameters).toSuccessResponse()
            check(response.state?.value == state) { "state" }
            response.issuer?.let { check(it == provider.issuer) { "iss" } }
            val code: AuthorizationCode = response.authorizationCode ?: error("code")
            val grant = AuthorizationCodeGrant(code, redirect, if (usesPkce(provider)) CodeVerifier(verifier) else null)
            val tokenRequest = TokenRequest.Builder(provider.tokenEndpointURI, clientAuthentication(provider), grant)
                .build()
            val http = tokenRequest.toHTTPRequest().withTimeouts()
            val success = OIDCTokenResponseParser.parse(http.send()).toSuccessResponse() as OIDCTokenResponse
            val algorithm = provider.idTokenJWSAlgs?.firstOrNull() ?: JWSAlgorithm.RS256
            val retriever =
                DefaultResourceRetriever(TIMEOUT_MILLISECONDS, TIMEOUT_MILLISECONDS, KEY_SET_LIMIT, true, socketFactory)
            val validator = IDTokenValidator(
                provider.issuer,
                ClientID(client.clientId),
                algorithm,
                provider.jwkSetURI.toURL(),
                retriever,
            )
            val claims = validator.validate(success.oidcTokens.idToken, Nonce(nonce)).toJWTClaimsSet()
            return identityOf(claims, parameters["user"]?.firstOrNull())
        } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
            throw SignInRejectedException(error)
        }
    }

    private fun identityOf(claims: JWTClaimsSet, user: String?): ExternalIdentity {
        val subject = claims.subject ?: error("sub")
        val email = EmailAddress.parse(claims.getStringClaim("email"))?.takeIf { client.trustsEmail(claims) }
        val name = claims.getStringClaim("name") ?: firstSignInName(user) ?: email?.localPart ?: FALLBACK_NAME
        return ExternalIdentity(client.issuer, subject, name.trim().take(NAME_LIMIT), email?.value)
    }

    /** Apple sends the person's name once, as the `user` form field of the first sign-in; never the e-mail from it. */
    private fun firstSignInName(user: String?): String? = runCatching {
        val name = JSONObjectUtils.getJSONObject(JSONObjectUtils.parse(user ?: return null), "name") ?: return null
        listOfNotNull(name["firstName"] as? String, name["lastName"] as? String)
            .joinToString(" ").trim().takeIf { it.isNotEmpty() && it.length <= NAME_LIMIT }
    }.getOrNull()

    private fun usesPkce(provider: OIDCProviderMetadata) =
        provider.codeChallengeMethods?.contains(CodeChallengeMethod.S256) == true

    /** HTTP Basic unless the provider lists only form-posted secrets; Basic is the default of the standard. */
    private fun clientAuthentication(provider: OIDCProviderMetadata): ClientAuthentication {
        val clientId = ClientID(client.clientId)
        val secret = Secret(client.clientSecret())
        val methods = provider.tokenEndpointAuthMethods
        return if (methods.isNullOrEmpty() || ClientAuthenticationMethod.CLIENT_SECRET_BASIC in methods) {
            ClientSecretBasic(clientId, secret)
        } else {
            ClientSecretPost(clientId, secret)
        }
    }

    private fun discovered(): OIDCProviderMetadata = metadata ?: synchronized(this) {
        metadata ?: run {
            val url = URI(client.issuer.trimEnd('/') + "/.well-known/openid-configuration")
            val response = HTTPRequest(HTTPRequest.Method.GET, url).withTimeouts().send()
            OIDCProviderMetadata.parse(response.bodyAsJSONObject).also { found ->
                check(found.issuer == Issuer(client.issuer)) { "Discovered issuer differs from the configured one" }
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
        const val FALLBACK_NAME = "Участник"
    }
}
