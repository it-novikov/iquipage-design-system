package com.sprintique.database

import com.sprintique.health.ReadinessProbe
import com.sprintique.problem.ProblemException
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.sql.SQLException

/** The runtime role is still safe and the schema still matches the artifact. */
@Component
@Profile("api")
class DatabaseReadinessProbe(private val database: Database) : ReadinessProbe {
    override fun check() {
        try {
            database.requireSafeRuntimeRole()
            SchemaMigrations.requireCurrent(database.dataSource)
        } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
            throw if (isUnreachable(error)) unavailable() else error
        }
    }

    private fun isUnreachable(error: RuntimeException): Boolean =
        error !is ProblemException && generateSequence<Throwable>(error) { it.cause }.any { it is SQLException }

    private fun unavailable() =
        ProblemException(503, "TEMPORARILY_UNAVAILABLE", "Сервис временно недоступен. Повторите позже.")
}
