package com.sprintique.identity.infrastructure

import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.oauth2.sdk.Scope
import com.nimbusds.openid.connect.sdk.Prompt
import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.identity.application.SignInProviders
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import java.nio.file.Path

/** Google and Apple, each only when fully configured; the sign-in screen offers exactly the configured ones. */
@Configuration(proxyBeanMethods = false)
@Profile("api")
class IdentityConfiguration {
    @Bean
    fun signInProviders(properties: SprintiqueProperties): SignInProviders {
        val settings = properties.signIn
        val trust = settings.trustFile.takeIf(String::isNotEmpty)?.let { ProviderTrust.socketFactory(Path.of(it)) }
        val google = settings.google.takeIf { it.isConfigured }?.let { google ->
            OidcClient(
                name = "google",
                issuer = google.issuer,
                clientId = google.clientId,
                clientSecret = { google.clientSecret },
                scope = Scope("openid", "email", "profile"),
                prompt = Prompt(Prompt.Type.SELECT_ACCOUNT),
                trustsEmail = ::googleVouches,
            )
        }
        val apple = settings.apple.takeIf { it.isConfigured }?.let { apple ->
            val secret = AppleClientSecret(
                apple.teamId,
                apple.clientId,
                apple.keyId,
                apple.issuer,
                AppleClientSecret.readKey(Path.of(apple.privateKeyFile)),
            )
            OidcClient(
                name = "apple",
                issuer = apple.issuer,
                clientId = apple.clientId,
                clientSecret = secret::next,
                scope = Scope("openid", "name", "email"),
                formPost = true,
                trustsEmail = ::appleVouches,
            )
        }
        return SignInProviders(listOfNotNull(google, apple).map { OidcIdentityProviderAdapter(it, trust) })
    }

    companion object {
        /**
         * Google's advice: an address is authoritative for account matching when verified and either a Gmail address
         * or one of a Google Workspace domain (the `hd` claim). Other verified addresses were only verified once.
         */
        fun googleVouches(claims: JWTClaimsSet): Boolean {
            val email = claims.getStringClaim("email") ?: return false
            return verified(claims) && (email.lowercase().endsWith("@gmail.com") || claims.getStringClaim("hd") != null)
        }

        /** Apple verifies every address it hands out, relay addresses included. */
        fun appleVouches(claims: JWTClaimsSet): Boolean = verified(claims)

        /** Apple has sent `email_verified` both as a boolean and as the string "true". */
        private fun verified(claims: JWTClaimsSet): Boolean =
            when (val value = claims.getClaim("email_verified")) {
                is Boolean -> value
                is String -> value == "true"
                else -> false
            }
    }
}
