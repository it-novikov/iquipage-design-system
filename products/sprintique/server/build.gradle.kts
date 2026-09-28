import dev.detekt.gradle.Detekt
import org.springframework.boot.gradle.tasks.bundling.BootJar

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.jib)
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
    // Local debugging only (the admin/admin sign-in, stand routes). Never part of the production artifact.
    create("local") {
        compileClasspath += main.get().output + main.get().compileClasspath
        runtimeClasspath += main.get().output + main.get().runtimeClasspath
    }
    // Tests against a real PostgreSQL provided by scripts/test.mjs.
    create("integrationTest") {
        compileClasspath += main.get().output + test.get().compileClasspath
        runtimeClasspath += main.get().output + test.get().runtimeClasspath
    }
}

configurations {
    named("localImplementation") { extendsFrom(configurations.implementation.get()) }
    named("integrationTestImplementation") { extendsFrom(configurations.testImplementation.get()) }
    named("integrationTestRuntimeOnly") { extendsFrom(configurations.testRuntimeOnly.get()) }
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
    implementation(libs.swagger.annotations)
    implementation(libs.nimbus.oidc)
    implementation(libs.aws.sdk.s3)
    implementation(libs.aws.sdk.url.connection)
    implementation(libs.twelvemonkeys.jpeg)
    implementation(libs.twelvemonkeys.webp)
    implementation(libs.webp.imageio)
    runtimeOnly(libs.postgresql)
    implementation(libs.junixsocket.core)

    testImplementation(platform(libs.spring.boot.bom))
    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.archunit)
    testImplementation(libs.postgresql)
    "integrationTestImplementation"(libs.jooq.codegen)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    systemProperty("file.encoding", "UTF-8")
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

tasks.bootJar {
    archiveFileName.set("sprintique-server.jar")
}

val localBootJar =
    tasks.register<BootJar>("localBootJar") {
        group = "build"
        description = "The artifact for tests and the local stand: production code plus the local source set."
        archiveFileName.set("sprintique-server-local.jar")
        mainClass.set("com.sprintique.ApplicationKt")
        targetJavaVersion.set(JavaVersion.VERSION_25)
        classpath(sourceSets["local"].runtimeClasspath)
    }

tasks.assemble { dependsOn(localBootJar) }

// Integration tests need the isolated cluster of scripts/test.mjs; without it they fail instead of guessing a database.
val integrationTest =
    tasks.register<Test>("integrationTest") {
        group = "verification"
        description = "Tests against a real PostgreSQL provided by scripts/test.mjs."
        testClassesDirs = sourceSets["integrationTest"].output.classesDirs
        classpath = sourceSets["integrationTest"].runtimeClasspath
        shouldRunAfter(tasks.test)
        doFirst {
            check(System.getenv("SPRINTIQUE_TEST_ADMIN_DATABASE_URL") != null) {
                "Integration tests need the isolated database: run them through `npm test` in products/sprintique"
            }
        }
    }

tasks.jar {
    enabled = false
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("config/detekt/detekt.yml"))
    source.setFrom(files("src/main/kotlin", "src/local/kotlin", "src/test/kotlin", "src/integrationTest/kotlin"))
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

val architectureTest =
    tasks.register<Test>("architectureTest") {
        group = "verification"
        description = "Module and layer boundaries."
        testClassesDirs =
            sourceSets.test
                .get()
                .output.classesDirs
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

// Regenerates src/generated/jooq from the migrated schema of the isolated cluster (scripts/test.mjs --jooq).
tasks.register<JavaExec>("generateJooq") {
    group = "build"
    description = "Regenerates jOOQ classes from the migrations."
    classpath = sourceSets["integrationTest"].runtimeClasspath
    mainClass.set("com.sprintique.database.JooqCodegenKt")
    args(
        layout.projectDirectory
            .dir("src/generated/jooq")
            .asFile.absolutePath,
    )
}

// The production artifact must not contain the local debugging code (admin/admin sign-in, stand routes).
val verifyProductionArtifact = tasks.register("verifyProductionArtifact") {
    group = "verification"
    description = "Fails when the production jar contains classes of the local source set."
    val jar = tasks.bootJar.flatMap { it.archiveFile }
    inputs.file(jar)
    doLast {
        val leaked = zipTree(jar.get().asFile).matching { include("**/com/sprintique/local/**") }.files
        check(leaked.isEmpty()) { "Production jar contains local classes: ${leaked.map { it.name }}" }
    }
}

tasks.check { dependsOn(verifyProductionArtifact) }

// The production image: the main artifact only (never the local source set), the built web interface, a non-root
// user and a JRE pinned by digest. `npm run build` produces ../dist first; `jibBuildTar` or `jibDockerBuild` make it.
jib {
    from {
        image = "eclipse-temurin:25-jre-noble@sha256:30772b161c319f9a10c82e30fd77b7b6702c6b051e44e0e9f3d7ab5dd389a5ab"
    }
    to {
        image = "sprintique-server"
        tags = setOf(project.version.toString())
    }
    container {
        mainClass = "com.sprintique.ApplicationKt"
        user = "10001:10001"
        ports = listOf("4311")
        workingDirectory = "/app"
        environment = mapOf(
            "SPRINTIQUE_HOST" to "0.0.0.0",
            "SPRINTIQUE_PORT" to "4311",
            "SPRINTIQUE_WEB_ROOT" to "/app/web",
        )
        jvmFlags = listOf("-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError")
    }
    extraDirectories {
        paths {
            path {
                setFrom(file("../dist"))
                into = "/app/web"
            }
        }
    }
}
