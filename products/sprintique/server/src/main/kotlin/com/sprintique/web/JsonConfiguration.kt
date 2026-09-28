package com.sprintique.web

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import tools.jackson.core.JsonGenerator
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.MapperFeature
import tools.jackson.databind.SerializationContext
import tools.jackson.databind.ValueSerializer
import tools.jackson.databind.module.SimpleModule
import tools.jackson.module.kotlin.KotlinFeature
import tools.jackson.module.kotlin.KotlinModule
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * One JSON configuration for the whole API. Request bodies are parsed strictly, as the contracts require: unknown
 * fields, wrong types, coerced scalars, fractions for integers and trailing content are all rejected. Missing fields
 * are checked by [com.sprintique.contract.Contracts], which sees the parsed body.
 */
@Configuration(proxyBeanMethods = false)
class JsonConfiguration {
    @Bean
    fun strictJsonMapper(): JsonMapperBuilderCustomizer =
        JsonMapperBuilderCustomizer { builder ->
            builder
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .addModule(KotlinModule.Builder().enable(KotlinFeature.StrictNullChecks).build())
                .addModule(SimpleModule("sprintique-time").addSerializer(Instant::class.java, InstantSerializer))
        }

    /** Moments are written like the browser writes them: UTC, milliseconds, `Z`. */
    private object InstantSerializer : ValueSerializer<Instant>() {
        private val format = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

        override fun serialize(value: Instant, generator: JsonGenerator, context: SerializationContext) {
            generator.writeString(format.format(value))
        }
    }
}
