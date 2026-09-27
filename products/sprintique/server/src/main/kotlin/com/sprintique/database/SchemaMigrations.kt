package com.sprintique.database

import com.sprintique.problem.ProblemException
import org.flywaydb.core.Flyway
import javax.sql.DataSource

/**
 * Flyway over the immutable migration ledger in `db/migration`. Only the migrate command applies migrations, with
 * the migration owner's credentials; the API and worker validate that the applied history matches the artifact.
 */
object SchemaMigrations {
    private const val LOCATION = "classpath:db/migration"
    private val ROLE_NAME = Regex("^[a-z][a-z0-9_]{0,62}$")

    fun migrate(dataSource: DataSource, runtimeRole: String, workerRole: String) {
        require(ROLE_NAME.matches(runtimeRole)) { "Invalid runtime role name" }
        require(workerRole.isEmpty() || ROLE_NAME.matches(workerRole) && workerRole != runtimeRole) {
            "Worker role must be a distinct valid role"
        }
        Flyway.configure()
            .dataSource(dataSource)
            .locations(LOCATION)
            .defaultSchema("public")
            .createSchemas(false)
            .placeholders(mapOf("runtime_role" to runtimeRole, "worker_role" to workerRole))
            .validateMigrationNaming(true)
            .load()
            .migrate()
    }

    /** The applied history must equal the migrations shipped in this artifact: same versions, same checksums, none pending. */
    fun requireCurrent(dataSource: DataSource) {
        val result = Flyway.configure()
            .dataSource(dataSource)
            .locations(LOCATION)
            .defaultSchema("public")
            .createSchemas(false)
            .placeholderReplacement(false)
            .load()
            .validateWithResult()
        if (!result.validationSuccessful) {
            throw ProblemException(503, "SCHEMA_MISMATCH", "Версия схемы не соответствует серверу. Выполните миграции перед запуском.")
        }
    }
}
