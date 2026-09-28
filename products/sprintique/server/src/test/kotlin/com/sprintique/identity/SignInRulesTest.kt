package com.sprintique.identity

import com.nimbusds.jwt.JWTClaimsSet
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.identity.infrastructure.IdentityConfiguration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SignInRulesTest {
    @Test
    fun `addresses are matched trimmed and lower-cased, and nothing else is rewritten`() {
        assertThat(EmailAddress.parse("  Maria.Ivanova+work@Example.ORG ")?.value)
            .isEqualTo("maria.ivanova+work@example.org")
        assertThat(EmailAddress.parse("anna@xn--80ak6aa92e.xn--p1ai")?.localPart).isEqualTo("anna")
        listOf(null, "", "anna", "anna@", "@example.org", "anna@example", "a b@example.org", "anna@exa_mple.org")
            .forEach { assertThat(EmailAddress.parse(it)).describedAs(it).isNull() }
        assertThat(EmailAddress.parse("a".repeat(65) + "@example.org")).isNull()
    }

    @Test
    fun `Google vouches for Gmail and Workspace addresses it verified`() {
        fun claims(email: String, verified: Any?, hd: String? = null) = JWTClaimsSet.Builder()
            .claim("email", email).claim("email_verified", verified).claim("hd", hd).build()
        assertThat(IdentityConfiguration.googleVouches(claims("anna@gmail.com", true))).isTrue()
        val workspace = claims("anna@company.example", true, "company.example")
        assertThat(IdentityConfiguration.googleVouches(workspace)).isTrue()
        assertThat(IdentityConfiguration.googleVouches(claims("anna@company.example", true))).isFalse()
        assertThat(IdentityConfiguration.googleVouches(claims("anna@gmail.com", false))).isFalse()
    }

    @Test
    fun `Apple's verification flag is read as a boolean or as the string true`() {
        fun claims(verified: Any?) = JWTClaimsSet.Builder().claim("email_verified", verified).build()
        assertThat(IdentityConfiguration.appleVouches(claims(true))).isTrue()
        assertThat(IdentityConfiguration.appleVouches(claims("true"))).isTrue()
        assertThat(IdentityConfiguration.appleVouches(claims("false"))).isFalse()
        assertThat(IdentityConfiguration.appleVouches(claims(null))).isFalse()
    }
}
