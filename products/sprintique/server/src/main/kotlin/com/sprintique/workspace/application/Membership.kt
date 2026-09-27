package com.sprintique.workspace.application

import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ProjectMembership
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability

/** Changes to who belongs to a project: members, invitations, agent grants. */
object Membership {
    /**
     * The same project lock as canonical writes, so a revocation cannot race a later committed effect: a membership
     * advisory lock, the project row, then the live credential and the administrator right again.
     */
    fun manageProject(tx: Transaction, actor: Actor, projectId: String): ProjectMembership {
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        ProjectAccess.requireActiveCredential(tx, actor)
        return ProjectAccess.authorize(tx, actor, projectId, Capability.AGENTS_MANAGE)
    }
}
