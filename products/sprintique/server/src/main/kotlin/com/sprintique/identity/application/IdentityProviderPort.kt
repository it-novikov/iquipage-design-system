package com.sprintique.identity.application

import java.net.URI

/** A started sign-in: where to send the browser, and the secrets to keep until it comes back. */
data class SignInStart(val redirect: URI, val state: String, val nonce: String, val verifier: String)

/** The verified identity from a completed sign-in. Only a verified e-mail is passed on. */
data class ExternalIdentity(val issuer: String, val subject: String, val name: String, val verifiedEmail: String?)

/**
 * The OpenID Connect provider: authorization code flow with PKCE (S256), state and nonce, a signed ID token checked
 * against the provider's keys. The provider's name never leaves the adapter.
 */
interface IdentityProviderPort {
    fun start(redirect: URI): SignInStart

    /** Throws [SignInRejectedException] on any failed check; the caller never learns which one. */
    fun complete(callback: URI, redirect: URI, state: String, nonce: String, verifier: String): ExternalIdentity
}

class SignInRejectedException(cause: Throwable? = null) : RuntimeException("Sign-in could not be verified", cause)
