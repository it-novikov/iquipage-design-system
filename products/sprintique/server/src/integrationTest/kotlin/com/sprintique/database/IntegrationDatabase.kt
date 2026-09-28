package com.sprintique.database

/**
 * The isolated cluster that scripts/test.mjs created for this run. Roles mirror production: the runtime role owns
 * nothing and cannot bypass row security; `admin` is the cluster superuser, used only to arrange test data.
 */
object IntegrationDatabase {
    val runtime: Database by lazy { Database.connect(environment("SPRINTIQUE_TEST_DATABASE_URL"), 4, "test-runtime") }
    val admin: Database by lazy { Database.connect(adminUrl("sprintique"), 2, "test-admin") }
    val worker: Database by lazy {
        Database.connect(environment("SPRINTIQUE_TEST_WORKER_DATABASE_URL"), 2, "test-worker")
    }
    val migrationUrl: String get() = environment("SPRINTIQUE_TEST_MIGRATION_DATABASE_URL")

    fun environment(name: String): String =
        System.getenv(name) ?: error("$name is not set: run integration tests through npm test in products/sprintique")

    /** Runs one statement as the cluster superuser on another database of the cluster, outside a transaction. */
    fun execute(database: String, statement: String) {
        Database.connect(adminUrl(database), 1, "test-admin-$database").use { admin ->
            admin.dataSource.connection.use { connection -> connection.createStatement().use { it.execute(statement) } }
        }
    }

    /** The superuser URL of the cluster pointed at `database`. */
    fun adminUrl(
        database: String,
    ): String = environment("SPRINTIQUE_TEST_ADMIN_DATABASE_URL").replace("/sprintique?", "/$database?")
}
