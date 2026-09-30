package com.sprintique.access.domain

/**
 * The rules that turn a preset and personal changes into effective permissions. They are the same as the database's
 * (auth.compile_permissions, compared by an integration test); the application uses them to validate a change before
 * writing it, to explain a membership («Что может») and to preview what a preset change does.
 */
object Permissions {
    /** Permissions a service account or a project agent never holds. */
    val NEVER_SERVICE: Set<Permission> = Permission.entries.filterTo(linkedSetOf()) {
        it.service == Permission.ServiceUse.NEVER
    }

    /** What a workspace guest never holds in a project. */
    val GUEST_FORBIDDEN: Set<Permission> = setOf(Permission.PROJECT_ACCESS)

    /** The permissions and everything they include, in catalog order. */
    fun closure(permissions: Collection<Permission>): Set<Permission> {
        val found = linkedSetOf<Permission>()
        fun add(permission: Permission) {
            if (found.add(permission)) permission.includes.forEach(::add)
        }
        permissions.forEach(::add)
        return sorted(found)
    }

    fun sorted(permissions: Collection<Permission>): Set<Permission> =
        Permission.entries.filterTo(linkedSetOf()) { it in permissions }

    /**
     * closure(base ∪ granted ∪ {tasks.read}) without every permission whose closure meets revoked ∪ forbidden, then
     * ∩ ceiling when there is one. «Видеть задачи» cannot be removed: it is what membership means.
     */
    fun compile(
        base: Collection<Permission>,
        granted: Collection<Permission> = emptySet(),
        revoked: Collection<Permission> = emptySet(),
        forbidden: Collection<Permission> = emptySet(),
        ceiling: Collection<Permission>? = null,
    ): Set<Permission> {
        val removed = (revoked + forbidden).toSet() - Permission.TASKS_READ
        return closure(base + granted + Permission.TASKS_READ).filterTo(linkedSetOf()) { permission ->
            closure(listOf(permission)).none { it in removed } &&
                (ceiling == null || permission in ceiling || permission == Permission.TASKS_READ)
        }
    }

    /** The five workspace permissions of a role with personal changes. */
    fun compileWorkspace(
        role: WorkspaceRole,
        granted: Collection<Permission>,
        revoked: Collection<Permission>,
    ): Set<Permission> {
        if (role == WorkspaceRole.OWNER) return Permission.WORKSPACE.toSet()
        return closure(role.permissions + granted).filterTo(linkedSetOf()) { permission ->
            permission.scope == PermissionScope.WORKSPACE && closure(listOf(permission)).none { it in revoked }
        }
    }

    /**
     * A change is consistent when it does not add a permission whose dependency it removes, and does not remove
     * «Видеть задачи». Returns the offending permissions, empty when consistent.
     */
    fun conflicts(granted: Collection<Permission>, revoked: Collection<Permission>): Set<Permission> {
        val removed = revoked.toSet()
        val bad = granted.filterTo(linkedSetOf()) { permission -> closure(listOf(permission)).any { it in removed } }
        if (Permission.TASKS_READ in removed) bad += Permission.TASKS_READ
        return sorted(bad)
    }

    /**
     * Keeps only personal changes that change something: an addition the preset lacks, a removal of something the
     * preset or an addition would give. The stored difference is then exactly what the page shows.
     */
    fun normalize(
        preset: Collection<Permission>,
        granted: Collection<Permission>,
        revoked: Collection<Permission>,
    ): Pair<Set<Permission>, Set<Permission>> {
        val base = closure(preset + Permission.TASKS_READ)
        val added = sorted(granted.filter { it !in base && it.scope == PermissionScope.PROJECT })
        val reachable = closure(base + added)
        val removed = sorted(revoked.filter { it in reachable && it != Permission.TASKS_READ })
        return added to removed
    }

    /** Where each permission of the catalog comes from, for «Что может». */
    enum class Source(val wire: String) {
        PRESET("preset"),
        ADDED("added"),
        REMOVED("removed"),
        DEPENDENCY("dependency"),
        ABSENT("absent"),
        FORBIDDEN("forbidden"),
    }

    fun sources(
        preset: Collection<Permission>,
        granted: Collection<Permission>,
        revoked: Collection<Permission>,
        effective: Collection<Permission>,
    ): Map<Permission, Source> {
        val base = closure(preset + Permission.TASKS_READ)
        val added = closure(granted)
        return Permission.PROJECT.associateWith { permission ->
            when {
                permission in effective && permission in base -> Source.PRESET

                permission in effective && permission in added -> Source.ADDED

                permission in effective -> Source.DEPENDENCY

                // Removed by hand, or with something it depends on: both read «убрано».
                closure(listOf(permission)).any { it in revoked } -> Source.REMOVED

                permission in base || permission in added -> Source.FORBIDDEN

                else -> Source.ABSENT
            }
        }
    }
}

/** Workspace roles; each is also the workspace preset of the same name. */
enum class WorkspaceRole(val wire: String, val title: String, val permissions: Set<Permission>) {
    OWNER("owner", "Владелец", Permission.WORKSPACE.toSet()),
    ADMIN("admin", "Администратор", Permission.WORKSPACE.toSet()),
    MEMBER("member", "Участник", emptySet()),
    GUEST("guest", "Гость", emptySet()),
    ;

    companion object {
        fun fromWire(value: String?): WorkspaceRole? = entries.firstOrNull { it.wire == value }
    }
}

/** The system presets of every workspace and what they hold out of the box. */
enum class SystemPreset(val key: String, val human: Boolean, defaults: List<Permission>) {
    ADMIN("admin", true, Permission.PROJECT),
    EDITOR(
        "editor",
        true,
        listOf(
            Permission.TASKS_WRITE,
            Permission.THREADS_WRITE,
            Permission.RELEASES_MANAGE,
            Permission.MAPS_WRITE,
            Permission.FINANCE_READ,
            Permission.APPROVALS_DECIDE,
        ),
    ),
    READER(
        "reader",
        true,
        listOf(Permission.TASKS_READ, Permission.THREADS_WRITE, Permission.MAPS_READ, Permission.FINANCE_READ),
    ),
    GUEST("guest", true, listOf(Permission.TASKS_READ, Permission.THREADS_WRITE, Permission.MAPS_READ)),
    SERVICE_READ("service_read", false, listOf(Permission.TASKS_READ, Permission.MAPS_READ)),
    SERVICE_TASKS(
        "service_tasks",
        false,
        listOf(Permission.TASKS_WRITE, Permission.THREADS_WRITE, Permission.MAPS_READ),
    ),
    ;

    val defaults: Set<Permission> = Permissions.closure(defaults)

    companion object {
        fun fromKey(value: String?): SystemPreset? = entries.firstOrNull { it.key == value }
    }
}
