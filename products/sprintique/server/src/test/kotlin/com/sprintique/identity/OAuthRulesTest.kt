package com.sprintique.identity

import com.sprintique.identity.domain.OAuthRules
import com.sprintique.identity.domain.Scope
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import java.util.Base64

class OAuthRulesTest {
    private val api = "https://api.iqui.page"
    private val mcp = "https://api.iqui.page/mcp"

    @Test
    fun `a client registers only https addresses or http on the loopback interface`() {
        assertThat(OAuthRules.isAllowedRedirect("https://claude.ai/api/mcp/auth_callback")).isTrue()
        assertThat(OAuthRules.isAllowedRedirect("http://127.0.0.1:33418/callback")).isTrue()
        assertThat(OAuthRules.isAllowedRedirect("http://[::1]:8080/cb")).isTrue()
        assertThat(OAuthRules.isAllowedRedirect("http://localhost:6274/oauth/callback")).isTrue()
        assertThat(OAuthRules.isAllowedRedirect("http://example.com/callback")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("https://example.com/cb#fragment")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("https://user:pass@example.com/cb")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("javascript:alert(1)")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("cursor://anysphere.cursor-retrieval/oauth")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("/relative/callback")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("https://example.com/cb\nSet-Cookie: x")).isFalse()
        assertThat(OAuthRules.isAllowedRedirect("https://example.com/" + "a".repeat(2100))).isFalse()
    }

    @Test
    fun `only a verifier that hashes to the S256 challenge proves the code`() {
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        val challenge = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        assertThat(challenge).isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        assertThat(OAuthRules.verifies(verifier, challenge)).isTrue()
        assertThat(OAuthRules.verifies(verifier + "x", challenge)).isFalse()
        // The plain method would send the verifier as the challenge: it never verifies.
        assertThat(OAuthRules.verifies(verifier, verifier)).isFalse()
        assertThat(OAuthRules.verifies("short", challenge)).isFalse()
    }

    @Test
    fun `scopes default to read, write brings read and anything unknown is refused`() {
        assertThat(OAuthRules.scopes(null)).containsExactly(Scope.READ)
        assertThat(OAuthRules.scopes("write")).containsExactlyInAnyOrder(Scope.READ, Scope.WRITE)
        assertThat(OAuthRules.scopes("read  write")).containsExactlyInAnyOrder(Scope.READ, Scope.WRITE)
        assertThat(OAuthRules.scopes("read admin")).isNull()
        assertThat(OAuthRules.wire(setOf(Scope.WRITE, Scope.READ))).isEqualTo("read write")
    }

    @Test
    fun `a token is only for this server's resources`() {
        assertThat(OAuthRules.resource(null, api, mcp)).isEqualTo(mcp)
        assertThat(OAuthRules.resource("$mcp/", api, mcp)).isEqualTo(mcp)
        assertThat(OAuthRules.resource(api, api, mcp)).isEqualTo(api)
        assertThat(OAuthRules.resource("https://evil.example/mcp", api, mcp)).isNull()
        assertThat(OAuthRules.resource("https://api.iqui.page/api", api, mcp)).isNull()
    }

    @Test
    fun `parameters are appended to a registered address and keep its query`() {
        assertThat(OAuthRules.redirect("https://app.example/cb", mapOf("code" to "a b", "state" to "x&y")))
            .isEqualTo("https://app.example/cb?code=a%20b&state=x%26y")
        assertThat(OAuthRules.redirect("https://app.example/cb?tenant=1", mapOf("error" to "access_denied")))
            .isEqualTo("https://app.example/cb?tenant=1&error=access_denied")
        assertThat(OAuthRules.isState("abc-123_~")).isTrue()
        assertThat(OAuthRules.isState("line\nbreak")).isFalse()
    }

    @Test
    fun `a loopback redirect may name another port, and nothing else may differ`() {
        val registered = "http://127.0.0.1:43111/callback"
        assertThat(OAuthRules.matchesRegistered(registered, registered)).isTrue()
        assertThat(OAuthRules.matchesRegistered("http://127.0.0.1:50123/callback", registered)).isTrue()
        assertThat(OAuthRules.matchesRegistered("http://127.0.0.1/callback", registered)).isTrue()
        assertThat(OAuthRules.matchesRegistered("http://localhost:50123/callback", registered)).isFalse()
        assertThat(OAuthRules.matchesRegistered("http://127.0.0.1:50123/other", registered)).isFalse()
        assertThat(OAuthRules.matchesRegistered("http://127.0.0.1:50123/callback?x=1", registered)).isFalse()
        assertThat(OAuthRules.matchesRegistered("http://127.0.0.1:50123/callback#f", registered)).isFalse()
        assertThat(OAuthRules.matchesRegistered("http://user@127.0.0.1:50123/callback", registered)).isFalse()
        assertThat(OAuthRules.matchesRegistered("https://app.example:8443/cb", "https://app.example/cb")).isFalse()
        assertThat(OAuthRules.matchesRegistered("http://evil.example:80/callback", "http://evil.example/callback"))
            .isFalse()
    }
}
