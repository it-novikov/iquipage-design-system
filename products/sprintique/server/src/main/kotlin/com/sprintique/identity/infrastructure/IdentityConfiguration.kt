package com.sprintique.identity.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.identity.application.IdentityProviderPort
import com.sprintique.identity.application.SignInMethod
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile

/** The identity provider exists only when fully configured; without it sign-in answers IDENTITY_NOT_CONFIGURED. */
@Configuration(proxyBeanMethods = false)
@Profile("api")
@ConditionalOnExpression(IdentityConfiguration.CONFIGURED)
class IdentityConfiguration {
    companion object {
        const val CONFIGURED =
            "'\${sprintique.oidc.issuer:}' != '' && '\${sprintique.oidc.client-id:}' != '' && " +
                "'\${sprintique.oidc.client-secret:}' != ''"
    }

    @Bean
    fun identityProvider(
        properties: SprintiqueProperties,
    ): IdentityProviderPort = OidcIdentityProviderAdapter(properties.oidc)

    @Bean
    fun oidcSignIn() = SignInMethod { "oidc" }
}
