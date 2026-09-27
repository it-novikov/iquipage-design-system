package com.sprintique.health

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class HealthController {
    @GetMapping("/health")
    fun health(): Map<String, String> = mapOf("status" to "ok", "version" to VERSION)

    private companion object {
        const val VERSION = "2.0.0-alpha.0"
    }
}
