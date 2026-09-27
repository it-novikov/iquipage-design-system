package com.sprintique.media.infrastructure

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.health.ReadinessProbe
import com.sprintique.media.application.ObjectStoragePort
import com.sprintique.problem.ProblemException
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Object storage is optional: without it the file features report STORAGE_UNAVAILABLE and readiness does not probe
 * it. With it, readiness checks the bucket on every probe.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnExpression("'\${sprintique.storage.endpoint:}' != ''")
class StorageConfiguration {
    @Bean(destroyMethod = "close")
    fun objectStorage(
        properties: SprintiqueProperties,
    ): S3ObjectStorageAdapter = S3ObjectStorageAdapter(properties.storage)

    @Bean
    fun storageReadiness(storage: ObjectStoragePort) = ReadinessProbe {
        try {
            storage.requireReady()
        } catch (_: IllegalStateException) {
            throw ProblemException(503, "TEMPORARILY_UNAVAILABLE", "Сервис временно недоступен. Повторите позже.")
        }
    }
}
