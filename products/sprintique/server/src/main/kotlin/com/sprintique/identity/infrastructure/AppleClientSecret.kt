package com.sprintique.identity.infrastructure

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyFactory
import java.security.interfaces.ECPrivateKey
import java.security.spec.PKCS8EncodedKeySpec
import java.time.Clock
import java.time.Duration
import java.util.Base64
import java.util.Date

/**
 * Sign in with Apple has no static client secret: the client authenticates with a JWT signed (ES256) by the team's
 * key, issued by the team, about the Services ID, for Apple as the audience. Each token request gets a fresh one
 * that expires in five minutes, so a leaked secret is worth little.
 */
class AppleClientSecret(
    private val teamId: String,
    private val clientId: String,
    private val keyId: String,
    private val audience: String,
    private val key: ECPrivateKey,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val signer = ECDSASigner(key)

    fun next(): String {
        val now = clock.instant()
        val claims = JWTClaimsSet.Builder()
            .issuer(teamId)
            .subject(clientId)
            .audience(audience)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now + LIFETIME))
            .build()
        val header = JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build()
        return SignedJWT(header, claims).apply { sign(signer) }.serialize()
    }

    companion object {
        private val LIFETIME: Duration = Duration.ofMinutes(5)

        /** Reads the PKCS#8 PEM key Apple lets you download once (`AuthKey_<keyId>.p8`). */
        fun readKey(file: Path): ECPrivateKey {
            val pem = Files.readString(file)
            val body = pem.lineSequence().filterNot { it.startsWith("-----") }.joinToString("").trim()
            require(body.isNotEmpty()) { "Apple private key file holds no key" }
            val spec = PKCS8EncodedKeySpec(Base64.getMimeDecoder().decode(body))
            return KeyFactory.getInstance("EC").generatePrivate(spec) as ECPrivateKey
        }
    }
}
