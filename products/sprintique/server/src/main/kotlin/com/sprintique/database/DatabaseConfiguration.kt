package com.sprintique.database

import com.sprintique.configuration.SprintiqueProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile

@Configuration(proxyBeanMethods = false)
@Profile("api")
class DatabaseConfiguration {
    /** The runtime pool: a non-owner role without BYPASSRLS; the startup check refuses anything else. */
    @Bean(destroyMethod = "close")
    fun runtimeDatabase(properties: SprintiqueProperties): Database {
        require(properties.database.url.isNotEmpty()) { "SPRINTIQUE_DATABASE_URL is required" }
        return Database.connect(properties.database.url, properties.database.maximumPoolSize)
    }
}
