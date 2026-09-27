package com.sprintique

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses

@AnalyzeClasses(packages = ["com.sprintique"], importOptions = [ImportOption.DoNotIncludeTests::class])
class ModuleBoundaryArchitectureTest {
    @ArchTest
    val `domain code depends on no framework, database or HTTP library`: ArchRule =
        noClasses()
            .that()
            .resideInAPackage("..domain..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework..",
                "org.jooq..",
                "java.sql..",
                "jakarta.servlet..",
                "tools.jackson..",
            ).allowEmptyShould(true)

    @ArchTest
    val `application code does not reach into HTTP controllers`: ArchRule =
        noClasses()
            .that()
            .resideInAPackage("..application..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..api..")
            .allowEmptyShould(true)

    @ArchTest
    val `no package is named common, shared, utils or helpers`: ArchRule =
        noClasses()
            .should()
            .resideInAnyPackage(
                "..common..",
                "..shared..",
                "..util..",
                "..utils..",
                "..helper..",
                "..helpers..",
                "..misc..",
                "..models..",
            )

    @ArchTest
    val `production code never depends on the local debugging source set`: ArchRule =
        noClasses().should().dependOnClassesThat().resideInAPackage("com.sprintique.local..")
}
