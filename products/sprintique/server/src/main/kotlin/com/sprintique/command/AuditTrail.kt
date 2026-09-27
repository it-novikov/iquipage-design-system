package com.sprintique.command

import com.sprintique.database.Transaction
import com.sprintique.identity.domain.Actor
import java.util.UUID

/**
 * The audit record and the outbox event of a change, written in the transaction of the change itself, so an event
 * exists exactly when the change was committed.
 */
object AuditTrail {
    fun record(tx: Transaction, actor: Actor, projectId: String, action: String, resourceId: String, revision: Long) {
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO app.audit_events(id, project_id, actor_id, initiator_id, action, resource_id, revision)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """.trimIndent(),
            id,
            projectId,
            actor.id,
            actor.initiatorId,
            action,
            resourceId,
            revision,
        )
        tx.update(
            "INSERT INTO app.outbox(id, project_id, topic, payload) VALUES ($1, $2, $3, $4)",
            id,
            projectId,
            action,
            mapOf(
                "id" to id,
                "projectId" to projectId,
                "resourceId" to resourceId,
                "revision" to revision,
            ),
        )
    }

    /**
     * An event of one operation that changes several things at once: every event carries the operation as its
     * correlation and causation, and the payload names the actor and the initiator.
     */
    @Suppress("LongParameterList")
    fun recordOperation(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        operationId: String,
        action: String,
        resourceId: String,
        revision: Long,
    ) {
        val id = UUID.randomUUID().toString()
        tx.update(
            """
            INSERT INTO app.audit_events(id, project_id, actor_id, initiator_id, action, resource_id, revision, operation_id,
                                         correlation_id, causation_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8)
            """.trimIndent(),
            id,
            projectId,
            actor.id,
            actor.initiatorId,
            action,
            resourceId,
            revision,
            operationId,
        )
        tx.update(
            "INSERT INTO app.outbox(id, project_id, topic, payload) VALUES ($1, $2, $3, $4)",
            id,
            projectId,
            action,
            linkedMapOf(
                "id" to id,
                "projectId" to projectId,
                "resourceId" to resourceId,
                "revision" to revision,
                "actorId" to actor.id,
                "initiatorId" to actor.initiatorId,
                "operationId" to operationId,
                "correlationId" to operationId,
                "causationId" to operationId,
            ),
        )
    }
}
