package com.sprintique.database

import com.sprintique.problem.ProblemException
import org.flywaydb.core.Flyway
import org.slf4j.LoggerFactory
import javax.sql.DataSource

/**
 * Flyway over the immutable migration ledger in `db/migration`. Only the migrate command applies migrations, with
 * the migration owner's credentials; the API and worker validate that the applied history matches the artifact.
 *
 * Flyway gets this class's loader explicitly: readiness runs on pool threads whose context loader cannot see the
 * migrations inside the artifact, and without them every applied migration would look unknown.
 */
object SchemaMigrations {
    private val log = LoggerFactory.getLogger(SchemaMigrations::class.java)
    private const val LOCATION = "classpath:db/migration"
    private val ROLE_NAME = Regex("^[a-z][a-z0-9_]{0,62}$")

    fun migrate(dataSource: DataSource, runtimeRole: String, workerRole: String) {
        require(ROLE_NAME.matches(runtimeRole)) { "Invalid runtime role name" }
        require(workerRole.isEmpty() || (ROLE_NAME.matches(workerRole) && workerRole != runtimeRole)) {
            "Worker role must be a distinct valid role"
        }
        val adopted = PreviousLedger.baselineOf(dataSource)
        val configuration = Flyway
            .configure(SchemaMigrations::class.java.classLoader)
            .dataSource(dataSource)
            .locations(LOCATION)
            .defaultSchema("public")
            .createSchemas(false)
            .placeholders(mapOf("runtime_role" to runtimeRole, "worker_role" to workerRole))
            .validateMigrationNaming(true)
        if (adopted != null) {
            log.info("Adopting the previous migration ledger at version {}", adopted)
            configuration.baselineOnMigrate(true).baselineVersion(adopted).baselineDescription("previous ledger")
        }
        configuration.load().migrate()
    }

    /** The applied history must equal the shipped migrations: same versions and checksums, none pending. */
    fun requireCurrent(dataSource: DataSource) {
        val result =
            Flyway
                .configure(SchemaMigrations::class.java.classLoader)
                .dataSource(dataSource)
                .locations(LOCATION)
                .defaultSchema("public")
                .createSchemas(false)
                .placeholderReplacement(false)
                // Nothing is ignored: an applied migration unknown to this artifact fails like a missing one.
                .ignoreMigrationPatterns(*emptyArray<String>())
                .load()
                .validateWithResult()
        if (!result.validationSuccessful) {
            for (invalid in result.invalidMigrations) {
                log.warn(
                    "Schema history differs version={} script={} problem={}",
                    invalid.version,
                    invalid.filepath?.substringAfterLast('/'),
                    invalid.errorDetails?.errorCode,
                )
            }
            throw ProblemException(
                503,
                "SCHEMA_MISMATCH",
                "Версия схемы не соответствует серверу. Выполните миграции перед запуском.",
            )
        }
    }
}
