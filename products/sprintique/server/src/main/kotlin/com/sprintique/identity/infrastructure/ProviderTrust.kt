package com.sprintique.identity.infrastructure

import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * TLS trust for the sign-in providers only: the JVM's certificate authorities plus the certificates of one PEM file.
 * The process-wide default is never changed.
 */
object ProviderTrust {
    fun socketFactory(pemFile: Path): SSLSocketFactory {
        val added = Files.newInputStream(pemFile).use { input ->
            CertificateFactory.getInstance("X.509").generateCertificates(input).map { it as X509Certificate }
        }
        require(added.isNotEmpty()) { "Sign-in provider trust file holds no certificate" }
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        defaultTrust().acceptedIssuers.forEachIndexed { index, certificate ->
            store.setCertificateEntry("jvm-$index", certificate)
        }
        added.forEachIndexed { index, certificate -> store.setCertificateEntry("provider-$index", certificate) }
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
        return SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }.socketFactory
    }

    private fun defaultTrust(): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as KeyStore?)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }
}
