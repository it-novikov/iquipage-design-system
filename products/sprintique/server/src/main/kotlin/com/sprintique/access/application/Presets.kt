package com.sprintique.access.application

import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import java.util.Locale

/** A preset as stored: its key when it is a system one, its permissions and whether it is for people. */
data class Preset(
    val id: String,
    val workspaceId: String,
    val key: SystemPreset?,
    val name: String,
    val hint: String,
    val human: Boolean,
    val permissions: Set<Permission>,
    val locked: Boolean,
    val revision: Long,
    val archived: Boolean,
)

/**
 * Presets of project permissions: the system ones every workspace has (Администратор is locked; Редактор,
 * Наблюдатель and Гость can be edited and reset) and up to ten of the workspace's own. A change applies to every
 * membership with the preset at once — the database recompiles them — and keeps personal additions and removals.
 */
object Presets {
    const val CUSTOM_LIMIT = 10
    private const val USAGE_NAMES = 6

    fun find(tx: Transaction, workspaceId: String, id: String, lock: Boolean = false): Preset {
        val row = tx.row(
            """
            SELECT id, workspace_id AS "workspaceId", key, name, hint, subject, permissions, locked, revision,
                   archived_at IS NOT NULL AS archived
            FROM app.access_presets WHERE id = $1::uuid AND workspace_id = $2::uuid ${if (lock) "FOR UPDATE" else ""}
            """.trimIndent(),
            id,
            workspaceId,
        )
        return presetOf(requirePresent(row, 404, "PRESET_NOT_FOUND", "Пресет недоступен."))
    }

    fun system(tx: Transaction, workspaceId: String, preset: SystemPreset): Preset {
        val row = tx.row(
            """
            SELECT id, workspace_id AS "workspaceId", key, name, hint, subject, permissions, locked, revision,
                   archived_at IS NOT NULL AS archived
            FROM app.access_presets WHERE workspace_id = $1::uuid AND key = $2
            """.trimIndent(),
            workspaceId,
            preset.key,
        )
        return presetOf(requireNotNull(row) { "Workspace $workspaceId has no preset ${preset.key}" })
    }

    /** A live preset for people of this workspace. */
    fun requireUsable(tx: Transaction, workspaceId: String, id: String): Preset {
        val preset = find(tx, workspaceId, id)
        requireCondition(preset.human && !preset.archived, 422, "PRESET_NOT_FOUND", "Пресет недоступен.")
        return preset
    }

    /** A preset a guest may start from: it cannot manage project access. */
    fun requireGuestUsable(tx: Transaction, workspaceId: String, id: String): Preset {
        val preset = requireUsable(tx, workspaceId, id)
        requireCondition(
            Permission.PROJECT_ACCESS !in preset.permissions,
            422,
            "GUEST_RESTRICTED",
            "Гостю нельзя дать «Управлять доступом».",
        )
        return preset
    }

    fun list(tx: Transaction, actor: Actor, workspaceId: String): List<Map<String, Any?>> {
        WorkspaceAccess.require(tx, actor, workspaceId)
        return tx.rows(
            """
            SELECT a.id, a.key, a.name, a.hint, a.subject, a.permissions, a.locked, a.revision, a.updated_at AS "updatedAt",
                   coalesce(u.profile_name, u.name) AS "updatedByName",
                   (SELECT count(*)::int FROM app.project_members m WHERE m.preset_id = a.id) AS members,
                   (SELECT count(DISTINCT m.project_id)::int FROM app.project_members m WHERE m.preset_id = a.id) AS projects
            FROM app.access_presets a LEFT JOIN auth.principals u ON u.id = a.updated_by
            WHERE a.workspace_id = $1::uuid AND a.archived_at IS NULL
            ORDER BY CASE a.key WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 WHEN 'reader' THEN 2 WHEN 'guest' THEN 3
                                WHEN 'service_read' THEN 5 WHEN 'service_tasks' THEN 6 ELSE 4 END, lower(a.name)
            """.trimIndent(),
            workspaceId,
        ).map { row -> describe(row) }
    }

    private fun describe(row: Row): Map<String, Any?> {
        val system = SystemPreset.fromKey(row.stringOrNull("key"))
        val permissions = ProjectAccess.permissionsOf(row)
        return LinkedHashMap<String, Any?>(row).apply {
            put("custom", system == null)
            put("modified", system != null && permissions != system.defaults)
            put("defaults", system?.defaults?.map(Permission::wire))
        }
    }

    /**
     * What an actor may add to a preset: not more than their own. The owner and administrators (projects.oversee, who
     * may enter any project) may use every permission. Anyone else may build a new preset from what they hold in some
     * project of the workspace, but may not widen an existing one: it may already be used in projects, invitations or
     * defaults they cannot see, where it would give people more than the actor has there.
     */
    fun allowed(
        tx: Transaction,
        actor: Actor,
        workspace: WorkspaceMembership,
        existing: Boolean = false,
    ): Set<Permission> {
        if (workspace.has(Permission.PROJECTS_OVERSEE)) return Permission.PROJECT.toSet()
        if (existing) return emptySet()
        val held = tx.rows(
            "SELECT permissions FROM app.project_members WHERE workspace_id = $1::uuid AND principal_id = $2",
            workspace.workspaceId,
            actor.id,
        ).flatMap { ProjectAccess.permissionsOf(it) }
        return Permissions.sorted(held)
    }

    data class Draft(val name: String, val hint: String, val permissions: Set<Permission>)

    fun create(tx: Transaction, actor: Actor, workspaceId: String, id: String, draft: Draft): Map<String, Any?> {
        val me = WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        // A retry of the same command (same id, same content) answers with what the first one made.
        val existing = tx.row("SELECT workspace_id::text AS w FROM app.access_presets WHERE id = $1::uuid", id)
        if (existing != null) {
            val made = find(tx, workspaceId, id)
            requireCondition(
                existing.string("w") == workspaceId && made.name == draft.name && made.hint == draft.hint &&
                    made.permissions == Permissions.closure(draft.permissions + Permission.TASKS_READ),
                409,
                "PRESET_EXISTS",
                "Пресет с этим идентификатором уже создан с другим содержанием.",
            )
            return one(tx, workspaceId, id)
        }
        val custom = tx.row(
            """
            SELECT count(*)::int AS n FROM app.access_presets WHERE workspace_id = $1::uuid AND key IS NULL AND archived_at IS NULL
            """.trimIndent(),
            workspaceId,
        )!!.int("n")
        requireCondition(custom < CUSTOM_LIMIT, 422, "PRESET_LIMIT", "Своих пресетов может быть не больше десяти.")
        val permissions = Permissions.closure(draft.permissions + Permission.TASKS_READ)
        requireWithin(permissions, allowed(tx, actor, me))
        requireUniqueName(tx, workspaceId, draft.name, null)
        tx.update(
            """
            INSERT INTO app.access_presets(id, workspace_id, name, hint, permissions, created_by, updated_by)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5::text[], $6, $6)
            """.trimIndent(),
            id, workspaceId, draft.name, draft.hint, permissions.map(Permission::wire), actor.id,
        )
        WorkspaceAccess.audit(
            tx, actor, workspaceId, "preset.created", id, 1,
            mapOf("name" to draft.name, "permissions" to permissions.map(Permission::wire)),
        )
        return one(tx, workspaceId, id)
    }

    fun update(
        tx: Transaction,
        actor: Actor,
        workspaceId: String,
        id: String,
        baseRevision: Long,
        draft: Draft,
    ): Map<String, Any?> {
        val me = WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = find(tx, workspaceId, id, lock = true)
        requireCondition(!current.archived, 404, "PRESET_NOT_FOUND", "Пресет недоступен.")
        requireCondition(
            !current.locked,
            422,
            "PRESET_LOCKED",
            "Пресет «Администратор» закреплён: иначе проект может остаться без администратора.",
        )
        requireCondition(current.revision == baseRevision, 409, "CONFLICT", "Пресет уже изменён. Обновите страницу.")
        var permissions = Permissions.closure(draft.permissions + Permission.TASKS_READ)
        if (!current.human) {
            requireCondition(
                permissions.none { it.service != Permission.ServiceUse.PRESET },
                422,
                "SERVICE_RESTRICTED",
                "Этого права нет в пресетах сервисных аккаунтов.",
            )
        }
        if (current.key == SystemPreset.GUEST) permissions = permissions - Permission.PROJECT_ACCESS
        requireWithin(permissions - current.permissions, allowed(tx, actor, me, existing = true))
        requireUniqueName(tx, workspaceId, draft.name, id)
        return write(tx, actor, current, draft.name, draft.hint, permissions, "preset.updated")
    }

    /** A system preset back to what it held out of the box (its name stays). */
    fun reset(tx: Transaction, actor: Actor, workspaceId: String, id: String, baseRevision: Long): Map<String, Any?> {
        val me = WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = find(tx, workspaceId, id, lock = true)
        val system = current.key
        requireCondition(
            system != null && !current.locked,
            422,
            "PRESET_NOT_SYSTEM",
            "Вернуть по умолчанию можно только системный пресет.",
        )
        requireCondition(current.revision == baseRevision, 409, "CONFLICT", "Пресет уже изменён. Обновите страницу.")
        requireWithin(system.defaults - current.permissions, allowed(tx, actor, me, existing = true))
        return write(tx, actor, current, current.name, current.hint, system.defaults, "preset.reset")
    }

    private fun write(
        tx: Transaction,
        actor: Actor,
        current: Preset,
        name: String,
        hint: String,
        permissions: Set<Permission>,
        action: String,
    ): Map<String, Any?> {
        val administered = administeredProjects(tx, current.id)
        tx.update(
            """
            UPDATE app.access_presets SET name = $2, hint = $3, permissions = $4::text[], revision = revision + 1,
              updated_by = $5, updated_at = clock_timestamp() WHERE id = $1::uuid
            """.trimIndent(),
            current.id, name, hint, permissions.map(Permission::wire), actor.id,
        )
        // Every membership with the preset is compiled again by the database trigger, personal changes kept; its
        // revision moves, so an edit based on the old permissions is refused.
        val affected = tx.update(
            "UPDATE app.project_members SET revision = revision + 1 WHERE preset_id = $1::uuid",
            current.id,
        )
        requireAdministratorsRemain(tx, administered)
        WorkspaceAccess.audit(
            tx, actor, current.workspaceId, action, current.id, current.revision + 1,
            mapOf(
                "nameBefore" to current.name,
                "nameAfter" to name,
                "added" to (permissions - current.permissions).map(Permission::wire),
                "removed" to (current.permissions - permissions).map(Permission::wire),
                "memberships" to affected,
            ),
        )
        return one(tx, current.workspaceId, current.id)
    }

    /** Projects using the preset that have an active person who manages access right now. */
    private fun administeredProjects(tx: Transaction, presetId: String): List<String> = tx.rows(
        """
        SELECT DISTINCT m.project_id AS id FROM app.project_members m WHERE m.preset_id = $1::uuid AND EXISTS(
          SELECT 1 FROM app.project_members a JOIN auth.principals p ON p.id = a.principal_id
          WHERE a.project_id = m.project_id AND 'project.access' = ANY(a.permissions) AND p.kind = 'human'
            AND p.disabled_at IS NULL)
        """.trimIndent(),
        presetId,
    ).map { it.string("id") }

    /**
     * A preset change must not take the last active administrator from a project that had one. Projects the actor
     * cannot see are counted, not named.
     */
    private fun requireAdministratorsRemain(tx: Transaction, administered: List<String>) {
        if (administered.isEmpty()) return
        val orphaned = tx.rows(
            """
            SELECT id FROM unnest($1::text[]) AS t(id) WHERE NOT EXISTS(
              SELECT 1 FROM app.project_members a JOIN auth.principals p ON p.id = a.principal_id
              WHERE a.project_id = t.id AND 'project.access' = ANY(a.permissions) AND p.kind = 'human'
                AND p.disabled_at IS NULL)
            """.trimIndent(),
            administered,
        ).map { it.string("id") }
        if (orphaned.isEmpty()) return
        val names = tx.rows("SELECT name FROM app.projects WHERE id = ANY($1::text[]) ORDER BY name", orphaned)
            .map { "«${it.string("name")}»" }
        val hidden = orphaned.size - names.size
        val listed = (names + listOfNotNull(if (hidden > 0) "ещё $hidden" else null)).joinToString()
        throw com.sprintique.problem.ProblemException(
            409,
            "LAST_ADMIN",
            "После изменения в проектах не останется администратора: $listed. Сначала назначьте там другого " +
                "администратора (владелец пространства может войти в проект сам).",
        )
    }

    /** Only a preset of the workspace's own that nobody, no project default and no pending invitation uses. */
    fun archive(tx: Transaction, actor: Actor, workspaceId: String, id: String): Map<String, Any?> {
        WorkspaceAccess.lock(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        val current = find(tx, workspaceId, id, lock = true)
        requireCondition(
            current.key == null && !current.archived,
            422,
            "PRESET_NOT_CUSTOM",
            "Удалить можно только свой пресет.",
        )
        val used = tx.row(
            """
            SELECT EXISTS(SELECT 1 FROM app.project_members WHERE preset_id = $1::uuid)
                OR EXISTS(SELECT 1 FROM app.projects WHERE workspace_id = $2::uuid
                          AND $1::uuid IN (default_member_preset_id, default_guest_preset_id))
                OR EXISTS(SELECT 1 FROM app.workspaces WHERE id = $2::uuid
                          AND $1::uuid IN (default_member_preset_id, default_guest_preset_id))
                OR EXISTS(SELECT 1 FROM auth.invitations WHERE project_preset_id = $1::uuid AND accepted_at IS NULL
                          AND revoked_at IS NULL AND replaced_at IS NULL AND expires_at > clock_timestamp()) AS used
            """.trimIndent(),
            id,
            workspaceId,
        )!!.boolean("used")
        requireCondition(
            !used,
            409,
            "PRESET_IN_USE",
            "Пресет назначен: сначала смените его у участников, в проектах и приглашениях.",
        )
        tx.update(
            """
            UPDATE app.access_presets SET archived_at = clock_timestamp(), revision = revision + 1 WHERE id = $1::uuid
            """.trimIndent(),
            id,
        )
        WorkspaceAccess.audit(
            tx,
            actor,
            workspaceId,
            "preset.archived",
            id,
            current.revision + 1,
            mapOf("name" to current.name),
        )
        return mapOf("archived" to true)
    }

    /** Who a change of the preset would reach: counts and the first few names with their project. */
    fun usage(tx: Transaction, actor: Actor, workspaceId: String, id: String): Map<String, Any?> {
        WorkspaceAccess.require(tx, actor, workspaceId, Permission.WORKSPACE_SETTINGS)
        find(tx, workspaceId, id)
        val totals = tx.row(
            """
            SELECT count(*)::int AS members, count(DISTINCT project_id)::int AS projects FROM app.project_members
            WHERE preset_id = $1::uuid
            """.trimIndent(),
            id,
        )!!
        val people = tx.rows(
            """
            SELECT coalesce(p.profile_name, p.name) AS name, x.name AS project FROM app.project_members m
            JOIN auth.principals p ON p.id = m.principal_id JOIN app.projects x ON x.id = m.project_id
            WHERE m.preset_id = $1::uuid ORDER BY name, project LIMIT $2
            """.trimIndent(),
            id,
            USAGE_NAMES,
        )
        return linkedMapOf("members" to totals.int("members"), "projects" to totals.int("projects"), "people" to people)
    }

    private fun one(tx: Transaction, workspaceId: String, id: String): Map<String, Any?> = describe(
        tx.row(
            """
            SELECT a.id, a.key, a.name, a.hint, a.subject, a.permissions, a.locked, a.revision, a.updated_at AS "updatedAt",
                   coalesce(u.profile_name, u.name) AS "updatedByName",
                   (SELECT count(*)::int FROM app.project_members m WHERE m.preset_id = a.id) AS members,
                   (SELECT count(DISTINCT m.project_id)::int FROM app.project_members m WHERE m.preset_id = a.id) AS projects
            FROM app.access_presets a LEFT JOIN auth.principals u ON u.id = a.updated_by
            WHERE a.id = $1::uuid AND a.workspace_id = $2::uuid
            """.trimIndent(),
            id,
            workspaceId,
        )!!,
    )

    private fun requireWithin(added: Collection<Permission>, allowed: Set<Permission>) {
        val beyond = added.filterNot { it in allowed }
        requireCondition(
            beyond.isEmpty(),
            403,
            "PERMISSION_EXCEEDS_ACTOR",
            "Нельзя добавить в пресет право, которого нет у вас: ${beyond.joinToString { "«${it.title}»" }}.",
        )
    }

    /**
     * Names are unique in a workspace whatever their case. Compared here rather than with SQL lower(), which leaves
     * Cyrillic as it is under the C collation of some clusters; the workspace lock serializes the writers.
     */
    private fun requireUniqueName(tx: Transaction, workspaceId: String, name: String, except: String?) {
        val key = name.trim().lowercase(Locale.ROOT)
        val taken = tx.rows(
            "SELECT id, name FROM app.access_presets WHERE workspace_id = $1::uuid AND archived_at IS NULL",
            workspaceId,
        ).any { it.string("id") != except && it.string("name").trim().lowercase(Locale.ROOT) == key }
        requireCondition(!taken, 409, "PRESET_NAME_TAKEN", "Пресет с таким названием уже есть.")
    }

    private fun presetOf(row: Row) = Preset(
        id = row.string("id"),
        workspaceId = row.string("workspaceId"),
        key = SystemPreset.fromKey(row.stringOrNull("key")),
        name = row.string("name"),
        hint = row.string("hint"),
        human = row.string("subject") == "human",
        permissions = ProjectAccess.permissionsOf(row),
        locked = row.boolean("locked"),
        revision = row.long("revision"),
        archived = row.boolean("archived"),
    )
}
