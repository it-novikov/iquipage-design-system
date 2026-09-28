package com.sprintique.identity.application

import java.net.URI

/** A started sign-in: where to send the browser, and the secrets to keep until it comes back. */
data class SignInStart(val redirect: URI, val state: String, val nonce: String, val verifier: String)

/**
 * The verified identity from a completed sign-in. `verifiedEmail` is set only when the provider vouches for the
 * address strongly enough to join an existing account by it.
 */
data class ExternalIdentity(val issuer: String, val subject: String, val name: String, val verifiedEmail: String?)

/**
 * An OpenID Connect provider (Google, Apple): authorization code flow with state and nonce, PKCE when the provider
 * supports it, a signed ID token checked against the provider's keys.
 */
interface IdentityProviderPort {
    /** `google` or `apple`: the path segment of its sign-in and callback routes. */
    val name: String

    /** Whether the provider posts the callback as a form (Apple) instead of redirecting with a query. */
    val postsCallback: Boolean

    fun start(redirect: URI): SignInStart

    /**
     * `parameters` are the callback's query or form fields. Throws [SignInRejectedException] on any failed check;
     * the caller never learns which one.
     */
    fun complete(
        parameters: Map<String, List<String>>,
        redirect: URI,
        state: String,
        nonce: String,
        verifier: String,
    ): ExternalIdentity
}

/** The configured providers by name. */
class SignInProviders(providers: List<IdentityProviderPort>) {
    private val byName = providers.associateBy(IdentityProviderPort::name)

    val names: Set<String> get() = byName.keys

    operator fun get(name: String): IdentityProviderPort? = byName[name]
}

class SignInRejectedException(cause: Throwable? = null) : RuntimeException("Sign-in could not be verified", cause)
