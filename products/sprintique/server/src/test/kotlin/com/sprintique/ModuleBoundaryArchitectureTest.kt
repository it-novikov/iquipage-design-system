package com.sprintique

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertTrue
import org.junit.jupiter.api.Test

class ModuleBoundaryArchitectureTest {
    private val production = Konsist.scopeFromProduction()

    @Test
    fun `domain code depends on no framework, database or HTTP library`() {
        production.files
            .filter { file -> file.packagee?.name?.contains(".domain") == true }
            .assertTrue { file ->
                file.imports.none { import ->
                    FORBIDDEN_IN_DOMAIN.any { prefix -> import.name.startsWith(prefix) }
                }
            }
    }

    @Test
    fun `no package is named common, shared, utils or helpers`() {
        production.packages.assertTrue { packagee ->
            packagee.name.split('.').none { part -> part in FORBIDDEN_PACKAGE_NAMES }
        }
    }

    private companion object {
        val FORBIDDEN_IN_DOMAIN =
            listOf("org.springframework", "org.jooq", "java.sql", "jakarta.servlet", "tools.jackson")
        val FORBIDDEN_PACKAGE_NAMES = setOf("common", "shared", "util", "utils", "helper", "helpers", "misc", "models")
    }
}
