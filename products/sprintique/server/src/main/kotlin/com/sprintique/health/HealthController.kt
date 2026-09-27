package com.sprintique.health

import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Profile("api")
class HealthController {
    @GetMapping("/health")
    fun health(): Map<String, String> = mapOf("status" to "ok", "version" to VERSION)

    private companion object {
        const val VERSION = "2.0.0-alpha.0"
    }
}
