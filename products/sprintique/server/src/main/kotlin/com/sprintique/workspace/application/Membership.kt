package com.sprintique.workspace.application

import com.sprintique.access.application.MemberAccess
import com.sprintique.access.application.Presets
import com.sprintique.access.domain.SystemPreset
import com.sprintique.command.CommandLedger
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.AccessEvents
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.application.ProjectMembership
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent

/** Who belongs to a project (see access.application for the rules of access) and a person's own profile and photo. */
object Membership {
    /**
     * The same project lock as canonical writes, so a revocation cannot race a later committed effect: a membership
     * advisory lock, the project row, then the live credential and the permission again.
     */
    fun manageProject(tx: Transaction, actor: Actor, projectId: String, capability: Capability): ProjectMembership {
        tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "membership:$projectId")
        tx.update("SELECT id FROM app.projects WHERE id = $1 FOR UPDATE", projectId)
        ProjectAccess.requireActiveCredential(tx, actor)
        // Access, settings and agents are managed only by the person at the interface.
        ProjectAccess.requireInteractive(actor)
        return ProjectAccess.authorize(tx, actor, projectId, capability)
    }

    /** Last activity is the member's newest audit event in this project; presets and personal changes included. */
    fun members(tx: Transaction, actor: Actor, projectId: String): List<Map<String, Any?>> =
        MemberAccess.members(tx, actor, projectId)

    data class MemberChange(val baseRevision: Long, val role: String?)

    /**
     * The role API: a role is the system preset of the same name (reader — Наблюдатель, editor — Редактор, admin —
     * Администратор) without personal changes; no role removes the member.
     */
    fun changeMember(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        input: MemberChange,
        key: String,
        ledger: CommandLedger,
    ): Any {
        val me = MemberAccess.manage(tx, actor, projectId, Capability.MEMBERS_MANAGE)
        return ledger.idempotent(tx, actor, projectId, "member.change:$id", key, input) {
            if (input.role == null) {
                MemberAccess.remove(tx, actor, projectId, id, input.baseRevision)
            } else {
                val preset = Presets.system(tx, me.workspaceId, SystemPreset.fromKey(input.role)!!)
                val change = MemberAccess.AccessChange(input.baseRevision, preset.id, emptySet(), emptySet())
                MemberAccess.change(tx, actor, projectId, id, change)
            }
        }
    }

    /** The person's profile with their own preferences, which follow them to every device. */
    fun profile(tx: Transaction, actor: Actor): Map<String, Any?>? {
        val row = tx.row(
            """
            SELECT p.id, coalesce(p.profile_name, p.name) AS name, p.email, p.revision, a.revision AS "avatarRevision",
                   coalesce(r.confirm_release_scope, true) AS "confirmReleaseScope"
            FROM auth.principals p LEFT JOIN app.person_avatars a ON a.principal_id = p.id
            LEFT JOIN app.person_preferences r ON r.principal_id = p.id WHERE p.id = $1
            """.trimIndent(),
            actor.id,
        ) ?: return null
        val preferences = mapOf("confirmReleaseScope" to row["confirmReleaseScope"])
        return row.filterKeys { it != "confirmReleaseScope" } + ("preferences" to preferences)
    }

    /** Sets the person's preferences as a whole: a repeated request leaves the same state, the last one wins. */
    fun changePreferences(tx: Transaction, actor: Actor, confirmReleaseScope: Boolean): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        val row = tx.row(
            """
            INSERT INTO app.person_preferences(principal_id, confirm_release_scope) VALUES ($1, $2)
            ON CONFLICT (principal_id) DO UPDATE SET confirm_release_scope = EXCLUDED.confirm_release_scope,
                updated_at = clock_timestamp()
            RETURNING confirm_release_scope AS "confirmReleaseScope"
            """.trimIndent(),
            actor.id, confirmReleaseScope,
        )!!
        return mapOf("confirmReleaseScope" to row["confirmReleaseScope"])
    }

    fun changeProfile(tx: Transaction, actor: Actor, baseRevision: Long, name: String): Row {
        requireHuman(tx, actor, "Профиль доступен человеку.")
        val result = tx.row(
            """
            UPDATE auth.principals SET profile_name = $2, revision = revision + 1 WHERE id = $1 AND revision = $3 RETURNING id, profile_name AS name, revision
            """.trimIndent(),
            actor.id, name, baseRevision,
        )
        return requirePresent(result, 409, "CONFLICT", "Профиль уже изменён.")
    }

    /** The person's settings for one project: which release the board shows (null: the running one). */
    fun projectPreferences(tx: Transaction, actor: Actor, projectId: String): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        val row = tx.row(
            "SELECT board_release FROM app.person_project_preferences WHERE principal_id = $1 AND project_id = $2",
            actor.id, projectId,
        )
        return mapOf("boardRelease" to row?.stringOrNull("board_release"))
    }

    /** Sets them as a whole; the last write wins. */
    fun changeProjectPreferences(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        boardRelease: String?,
    ): Map<String, Any?> {
        requireHuman(tx, actor, "Настройки доступны человеку.")
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        requireCondition(
            boardRelease == null || boardRelease == "backlog" ||
                tx.row("SELECT 1 FROM app.releases WHERE project_id = $1 AND id = $2", projectId, boardRelease) != null,
            422,
            "RELEASE_UNAVAILABLE",
            "Релиз недоступен.",
        )
        tx.update(
            """
            INSERT INTO app.person_project_preferences(principal_id, project_id, board_release) VALUES ($1, $2, $3)
            ON CONFLICT (principal_id, project_id) DO UPDATE SET board_release = EXCLUDED.board_release,
                updated_at = clock_timestamp()
            """.trimIndent(),
            actor.id, projectId, boardRelease,
        )
        return mapOf("boardRelease" to boardRelease)
    }

    /** Replaces the person's photo with an already re-encoded image; the revision becomes the cache key. */
    fun setAvatar(tx: Transaction, actor: Actor, image: ByteArray): Row {
        requireHuman(tx, actor, "Фото профиля доступно человеку.")
        return tx.row(
            """
            INSERT INTO app.person_avatars(principal_id, image) VALUES ($1, $2)
            ON CONFLICT (principal_id) DO UPDATE SET image = EXCLUDED.image, revision = app.person_avatars.revision + 1,
                updated_at = clock_timestamp()
            RETURNING revision AS "avatarRevision"
            """.trimIndent(),
            actor.id, image,
        )!!
    }

    fun removeAvatar(tx: Transaction, actor: Actor): Map<String, Any?> {
        requireHuman(tx, actor, "Фото профиля доступно человеку.")
        tx.update("DELETE FROM app.person_avatars WHERE principal_id = $1", actor.id)
        return mapOf("avatarRevision" to null)
    }

    /** Visible to the person and to anyone sharing a project or workspace with them (row policy). */
    fun avatar(tx: Transaction, principalId: String): Row =
        requirePresent(
            tx.row("SELECT image, revision FROM app.person_avatars WHERE principal_id = $1", principalId),
            404,
            "NOT_FOUND",
            "Фото недоступно.",
        )

    private fun requireHuman(tx: Transaction, actor: Actor, message: String) {
        requireCondition(actor.isHuman, 403, "FORBIDDEN", message)
        ProjectAccess.requireActiveCredential(tx, actor)
    }
}
