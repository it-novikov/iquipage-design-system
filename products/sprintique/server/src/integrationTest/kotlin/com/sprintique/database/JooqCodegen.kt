package com.sprintique.database

import org.jooq.codegen.GenerationTool
import org.jooq.meta.jaxb.Configuration
import org.jooq.meta.jaxb.Database
import org.jooq.meta.jaxb.Generate
import org.jooq.meta.jaxb.Generator
import org.jooq.meta.jaxb.Jdbc
import org.jooq.meta.jaxb.Property
import org.jooq.meta.jaxb.Target
import java.nio.file.Path

/**
 * Generates the jOOQ classes of the migrated schema. Run through `node scripts/test.mjs --jooq`, which provides a
 * freshly migrated isolated database; the output lives in src/generated/jooq and is committed.
 */
object JooqCodegen {
    const val PACKAGE = "com.sprintique.database.schema"

    fun generate(adminUrl: String, directory: Path) {
        val url = DatabaseUrl.parse(adminUrl)
        val properties = url.properties.stringPropertyNames().map { name ->
            Property().withKey(name).withValue(url.properties.getProperty(name))
        }
        GenerationTool.generate(
            Configuration()
                .withJdbc(Jdbc().withDriver("org.postgresql.Driver").withUrl(url.jdbcUrl).withProperties(properties))
                .withGenerator(
                    Generator()
                        .withName("org.jooq.codegen.KotlinGenerator")
                        .withDatabase(
                            Database().withName(
                                "org.jooq.meta.postgres.PostgresDatabase",
                            ).withIncludes("app\\..*|auth\\..*|work\\..*"),
                        )
                        // Stable output: no timestamps or tool versions, so the drift test compares content only.
                        .withGenerate(
                            Generate().withGeneratedAnnotation(
                                false,
                            ).withJavadoc(false).withComments(false).withSources(false),
                        )
                        .withTarget(
                            Target().withPackageName(PACKAGE).withDirectory(directory.toString()).withClean(true),
                        ),
                ),
        )
    }
}

fun main(arguments: Array<String>) {
    JooqCodegen.generate(IntegrationDatabase.adminUrl("sprintique"), Path.of(arguments.single()))
}
