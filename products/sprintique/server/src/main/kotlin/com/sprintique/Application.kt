package com.sprintique

import com.sprintique.database.Database
import com.sprintique.database.SchemaMigrations
import org.springframework.boot.WebApplicationType
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.context.properties.ConfigurationPropertiesScan

@SpringBootApplication
@ConfigurationPropertiesScan
class Application

/**
 * One artifact, three commands: `api` (default) serves HTTP, `worker` runs background jobs with the narrow worker
 * role, `migrate` applies the migration ledger with the owner's credentials and exits.
 */
fun main(arguments: Array<String>) {
    when (arguments.firstOrNull()) {
        "migrate" -> migrate()
        "worker" ->
            SpringApplicationBuilder(Application::class.java)
                .web(WebApplicationType.NONE)
                .profiles("worker")
                .run(*arguments.drop(1).toTypedArray())
        else ->
            SpringApplicationBuilder(Application::class.java)
                .profiles("api")
                .run(*arguments.dropWhile { it == "api" }.toTypedArray())
    }
}

private fun migrate() {
    val environment = System.getenv()
    val url = environment["SPRINTIQUE_MIGRATION_DATABASE_URL"].orEmpty()
    val runtimeRole = environment["SPRINTIQUE_DATABASE_RUNTIME_ROLE"].orEmpty()
    require(url.isNotEmpty() && runtimeRole.isNotEmpty()) {
        "SPRINTIQUE_MIGRATION_DATABASE_URL and SPRINTIQUE_DATABASE_RUNTIME_ROLE are required"
    }
    Database.connect(url, maximumPoolSize = 1, poolName = "migration").use { database ->
        SchemaMigrations.migrate(database.dataSource, runtimeRole, environment["SPRINTIQUE_DATABASE_WORKER_ROLE"].orEmpty())
    }
}
