package com.sprintique.database

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.io.path.relativeTo
import kotlin.streams.toList

class JooqSchemaDriftIntegrationTest {
    @Test
    fun `the committed jOOQ classes match the migrated schema`() {
        val committed = Path.of("src/generated/jooq")
        val fresh = Files.createTempDirectory("jooq-drift")
        JooqCodegen.generate(IntegrationDatabase.adminUrl("sprintique"), fresh)
        assertThat(contents(fresh)).isEqualTo(contents(committed))
    }

    private fun contents(root: Path): Map<String, String> =
        Files.walk(root).use { paths ->
            paths.filter(Files::isRegularFile).toList().associate { file ->
                file.relativeTo(root).toString() to
                    file.readText()
            }
        }
}
