package com.sprintique.media.infrastructure

import com.sprintique.configuration.StorageProperties
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.media.application.ObjectWrite
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.awscore.AwsRequestOverrideConfiguration
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload
import software.amazon.awssdk.services.s3.model.CompletedPart
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.ListMultipartUploadsRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import java.io.InputStream
import java.net.URI
import java.time.Duration

/**
 * A private S3-compatible bucket with server-side credentials. HTTPS is required outside the local reference
 * network. Every call has a deadline: 15 seconds, or two minutes for a part, a whole small object or the assembly of
 * the parts; a stalled connection is cut after a minute of silence.
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
            .httpClient(
                UrlConnectionHttpClient.builder().connectionTimeout(TIMEOUT).socketTimeout(SILENCE).build(),
            )
            .overrideConfiguration { it.apiCallTimeout(TIMEOUT).retryStrategy { retry -> retry.maxAttempts(2) } }
            .build()
    }

    override fun put(key: String, bytes: ByteArray, mime: String) {
        client.putObject(
            PutObjectRequest.builder().bucket(settings.bucket).key(stored(key)).contentType(mime)
                .overrideConfiguration(LONG_CALL).build(),
            RequestBody.fromBytes(bytes),
        )
    }

    override fun startWrite(key: String, mime: String): ObjectWrite {
        val upload = client.createMultipartUpload(
            CreateMultipartUploadRequest.builder().bucket(settings.bucket).key(stored(key)).contentType(mime).build(),
        ).uploadId()
        return PartWrite(stored(key), upload)
    }

    /** The body streams straight from S3: the call deadline covers the response head, the socket timeout the rest. */
    override fun read(key: String, range: LongRange?): InputStream = client.getObject(
        GetObjectRequest.builder().bucket(settings.bucket).key(stored(key))
            .apply { if (range != null) range("bytes=${range.first}-${range.last}") }.build(),
    )

    override fun remove(key: String) {
        client.deleteObject(DeleteObjectRequest.builder().bucket(settings.bucket).key(stored(key)).build())
        // A process that died mid-upload leaves parts that no object points to; only a listing finds them.
        val pending = client.listMultipartUploads(
            ListMultipartUploadsRequest.builder().bucket(settings.bucket).prefix(stored(key)).build(),
        )
        for (upload in pending.uploads().filter { it.key() == stored(key) }) abort(upload.key(), upload.uploadId())
    }

    override fun requireReady() {
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(settings.bucket).build())
        } catch (error: SdkException) {
            throw IllegalStateException("Object storage unavailable", error)
        }
    }

    override fun close() = client.close()

    private fun abort(key: String, upload: String) {
        client.abortMultipartUpload(
            AbortMultipartUploadRequest.builder().bucket(settings.bucket).key(key).uploadId(upload).build(),
        )
    }

    /** The object's key in the bucket: under the configured prefix, if any. */
    private fun stored(key: String) = settings.prefix + key

    /** The parts of one multipart upload, numbered in the order they were written. */
    private inner class PartWrite(private val key: String, private val upload: String) : ObjectWrite {
        private val parts = mutableListOf<CompletedPart>()
        private var finished = false

        override fun part(bytes: ByteArray, length: Int) {
            check(!finished) { "Write already finished" }
            val number = parts.size + 1
            val tag = client.uploadPart(
                UploadPartRequest.builder().bucket(settings.bucket).key(key).uploadId(upload).partNumber(number)
                    .contentLength(length.toLong()).overrideConfiguration(LONG_CALL).build(),
                RequestBody.fromBytes(if (length == bytes.size) bytes else bytes.copyOf(length)),
            ).eTag()
            parts += CompletedPart.builder().partNumber(number).eTag(tag).build()
        }

        override fun complete() {
            check(!finished) { "Write already finished" }
            client.completeMultipartUpload(
                CompleteMultipartUploadRequest.builder().bucket(settings.bucket).key(key).uploadId(upload)
                    .multipartUpload(CompletedMultipartUpload.builder().parts(parts).build())
                    .overrideConfiguration(LONG_CALL).build(),
            )
            finished = true
        }

        override fun abort() {
            if (finished) return
            finished = true
            abort(key, upload)
        }
    }

    private companion object {
        val TIMEOUT: Duration = Duration.ofSeconds(15)
        val SILENCE: Duration = Duration.ofSeconds(60)
        val LONG_CALL: AwsRequestOverrideConfiguration =
            AwsRequestOverrideConfiguration.builder().apiCallTimeout(Duration.ofSeconds(120)).build()
        val LOCAL_HOSTS = setOf("localhost", "127.0.0.1", "garage")
        val BUCKET = Regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")

        /** A key prefix: path segments of `a–z 0–9 . _ -`, ending with a slash. */
        val PREFIX = Regex("^([a-z0-9._-]+/)+$")
    }
}
