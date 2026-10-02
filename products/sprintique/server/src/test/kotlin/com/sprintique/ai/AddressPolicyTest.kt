package com.sprintique.ai

import com.sprintique.ai.domain.AddressPolicy
import com.sprintique.ai.domain.ProviderFailure
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetAddress
import java.net.URI

class AddressPolicyTest {
    private fun public(address: String) = AddressPolicy.isPublic(InetAddress.getByName(address))

    @Test
    fun `private, loopback, link-local and reserved addresses are not public`() {
        val blocked = listOf(
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
            "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1", "::1", "::", "fe80::1", "fc00::1",
            "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe",
            "2002:a9fe:a9fe::1", "2001:db8::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:2::1", "2001:10::1",
            "64:ff9b:1::a9fe:a9fe", "192.88.99.1",
        )
        assertThat(blocked.filter(::public)).isEmpty()
        val open = listOf("8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8")
        assertThat(open.all(::public)).isTrue()
    }

    @Test
    fun `only public https is reached unless the operator lists the host`() {
        val none = emptySet<String>()
        val local = { _: String -> listOf(InetAddress.getByName("127.0.0.1")) }
        val outside = { _: String -> listOf(InetAddress.getByName("8.8.8.8")) }
        assertThat(AddressPolicy.check(URI("https://api.example.com/v1"), none, outside)).isNull()
        assertThat(AddressPolicy.check(URI("http://api.example.com/v1"), none, outside))
            .isEqualTo(ProviderFailure.PROVIDER_INSECURE_URL)
        assertThat(AddressPolicy.check(URI("https://rebind.example.com/v1"), none, local))
            .isEqualTo(ProviderFailure.PROVIDER_ADDRESS_BLOCKED)
        // One private answer among public ones is enough to refuse.
        val mixed = { _: String -> listOf(InetAddress.getByName("8.8.8.8"), InetAddress.getByName("10.0.0.1")) }
        assertThat(AddressPolicy.check(URI("https://mixed.example.com"), none, mixed))
            .isEqualTo(ProviderFailure.PROVIDER_ADDRESS_BLOCKED)
        assertThat(AddressPolicy.check(URI("https://gone.example.com"), none) { emptyList() })
            .isEqualTo(ProviderFailure.PROVIDER_UNREACHABLE)
        assertThat(AddressPolicy.check(URI("http://ollama:11434/v1"), setOf("ollama"), local)).isNull()
        assertThat(AddressPolicy.check(URI("http://vllm:8000/v1"), setOf("vllm:8000"), local)).isNull()
        assertThat(AddressPolicy.check(URI("http://vllm:9000/v1"), setOf("vllm:8000"), local))
            .isEqualTo(ProviderFailure.PROVIDER_INSECURE_URL)
    }

    @Test
    fun `a stored base address has no user, query or fragment`() {
        assertThat(AddressPolicy.normalize(" https://openrouter.ai/api/v1/ ")).isEqualTo("https://openrouter.ai/api/v1")
        assertThat(AddressPolicy.normalize("https://user:pass@host.example/v1")).isNull()
        assertThat(AddressPolicy.normalize("https://host.example/v1?x=1")).isNull()
        assertThat(AddressPolicy.normalize("https://host.example/v1#a")).isNull()
        assertThat(AddressPolicy.normalize("file:///etc/passwd")).isNull()
        assertThat(AddressPolicy.normalize("javascript:alert(1)")).isNull()
    }
}
