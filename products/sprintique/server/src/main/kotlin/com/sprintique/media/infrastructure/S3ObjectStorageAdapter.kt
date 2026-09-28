package com.sprintique.media.infrastructure

import com.sprintique.configuration.StorageProperties
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.domain.FileInspection
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import java.net.URI
import java.time.Duration

/**
 * A private S3-compatible bucket with server-side credentials. HTTPS is required outside the local reference
 * network; every call has a timeout; a read stops at the canonical file limit.
 */
class S3ObjectStorageAdapter(private val settings: StorageProperties) : ObjectStoragePort, AutoCloseable {
    private val client: S3Client

    init {
        val endpoint = URI(settings.endpoint)
        require(endpoint.scheme == "https" || endpoint.host in LOCAL_HOSTS) {
            "Object storage requires HTTPS outside the local reference network"
        }
        require(BUCKET.matches(settings.bucket)) { "Invalid bucket name" }
        require(settings.prefix.isEmpty() || PREFIX.matches(settings.prefix)) { "Invalid object key prefix" }
        require(
            settings.region.isNotEmpty() && settings.accessKeyId.isNotEmpty() && settings.secretAccessKey.isNotEmpty(),
        ) {
            "Object storage needs region and credentials"
        }
        client = S3Client.builder()
            .endpointOverride(endpoint)
            .region(Region.of(settings.region))
            .forcePathStyle(true)
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(settings.accessKeyId, settings.secretAccessKey),
                ),
            )
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
            .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
            .httpClient(UrlConnectionHttpClient.builder().connectionTimeout(TIMEOUT).socketTimeout(TIMEOUT).build())
            .overrideConfiguration { it.apiCallTimeout(TIMEOUT).retryStrategy { retry -> retry.maxAttempts(2) } }
            .build()
    }

    override fun put(key: String, bytes: ByteArray, mime: String) {
        client.putObject(
            PutObjectRequest.builder().bucket(settings.bucket).key(stored(key)).contentType(mime).build(),
            RequestBody.fromBytes(bytes),
        )
    }

    override fun get(key: String): ByteArray = client.getObject(
        GetObjectRequest.builder().bucket(settings.bucket).key(stored(key)).build(),
    ).use { stream ->
        val declared = stream.response().contentLength()
        check(declared == null || declared <= FileInspection.FILE_LIMIT) { "Object exceeds canonical limit" }
        val bytes = stream.readNBytes(FileInspection.FILE_LIMIT + 1)
        check(bytes.size <= FileInspection.FILE_LIMIT) { "Object exceeds canonical limit" }
        bytes
    }

    override fun remove(key: String) {
        client.deleteObject(DeleteObjectRequest.builder().bucket(settings.bucket).key(stored(key)).build())
    }

    override fun requireReady() {
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(settings.bucket).build())
        } catch (error: SdkException) {
            throw IllegalStateException("Object storage unavailable", error)
        }
    }

    override fun close() = client.close()

    /** The object's key in the bucket: under the configured prefix, if any. */
    private fun stored(key: String) = settings.prefix + key

    private companion object {
        val TIMEOUT: Duration = Duration.ofSeconds(15)
        val LOCAL_HOSTS = setOf("localhost", "127.0.0.1", "garage")
        val BUCKET = Regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")

        /** A key prefix: path segments of `a–z 0–9 . _ -`, ending with a slash. */
        val PREFIX = Regex("^([a-z0-9._-]+/)+$")
    }
}
