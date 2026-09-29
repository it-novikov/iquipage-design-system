package com.sprintique.workbench.application

import com.sprintique.configuration.SprintiqueProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile

/** The cursor signer of this API process (docs/adr W4): a configured shared key, or a random one per process. */
@Configuration
@Profile("api")
class WorkbenchConfiguration {
    @Bean
    fun workbenchCursors(properties: SprintiqueProperties) = WorkbenchCursors(properties.workbench.cursorSecret)
}
