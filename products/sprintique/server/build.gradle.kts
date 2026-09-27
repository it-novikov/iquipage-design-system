import dev.detekt.gradle.Detekt

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
}

group = "com.sprintique"
version = "2.0.0-alpha.0"

kotlin {
    jvmToolchain(25)
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict", "-Xannotation-default-target=param-property")
        allWarningsAsErrors = true
    }
}

sourceSets {
    main {
        kotlin.srcDir("src/generated/jooq")
    }
}

dependencyLocking {
    lockAllConfigurations()
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(platform(libs.aws.sdk.bom))
    implementation(libs.spring.boot.starter.webmvc)
    implementation(libs.spring.boot.starter.security)
    implementation(libs.spring.boot.starter.jooq)
    implementation(libs.spring.boot.starter.validation)
    implementation(libs.jackson.module.kotlin)
    implementation(libs.kotlin.reflect)
    implementation(libs.flyway.core)
    implementation(libs.flyway.postgresql)
    implementation(libs.springdoc.webmvc.ui)
    implementation(libs.nimbus.oidc)
    implementation(libs.aws.sdk.s3)
    implementation(libs.aws.sdk.url.connection)
    implementation(libs.twelvemonkeys.jpeg)
    implementation(libs.webp.imageio)
    runtimeOnly(libs.postgresql)
    implementation(libs.junixsocket.core)

    testImplementation(platform(libs.spring.boot.bom))
    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.testcontainers.postgresql)
    testImplementation(libs.testcontainers.junit)
    testImplementation(libs.konsist)
    testImplementation(libs.postgresql)
    testImplementation(libs.jooq.codegen)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    // Integration tests reach Docker only through an explicitly chosen context (see README).
    environment("TESTCONTAINERS_RYUK_DISABLED", System.getenv("TESTCONTAINERS_RYUK_DISABLED") ?: "false")
    systemProperty("file.encoding", "UTF-8")
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

tasks.bootJar {
    archiveFileName.set("sprintique-server.jar")
}

tasks.jar {
    enabled = false
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("config/detekt/detekt.yml"))
    source.setFrom(files("src/main/kotlin", "src/test/kotlin"))
    parallel = true
}

tasks.withType<Detekt>().configureEach {
    jvmTarget = "25"
    exclude("**/generated/**")
}

ktlint {
    version.set(libs.versions.ktlint.cli)
    filter { exclude { it.file.path.contains("/generated/") } }
}

val architectureTest = tasks.register<Test>("architectureTest") {
    group = "verification"
    description = "Module and layer boundaries."
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    filter { includeTestsMatching("*ArchitectureTest") }
}

tasks.register("qualityCheck") {
    group = "verification"
    description = "Formatting, static analysis and architecture rules."
    dependsOn("ktlintCheck", "detekt", architectureTest)
}

tasks.register("qualityFormat") {
    group = "formatting"
    description = "Applies ktlint formatting; review the diff afterwards."
    dependsOn("ktlintFormat")
}

// Regenerates src/generated/jooq from the Flyway migrations on a throwaway PostgreSQL (Docker through an explicit context).
tasks.register<JavaExec>("generateJooq") {
    group = "build"
    description = "Regenerates jOOQ classes from the migrations."
    classpath = sourceSets.test.get().runtimeClasspath
    mainClass.set("com.sprintique.database.JooqCodegen")
    args(layout.projectDirectory.dir("src/generated/jooq").asFile.absolutePath)
}
