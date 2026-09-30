package com.sprintique.identity.domain

import com.sprintique.access.domain.Permission

/** A bearer secret as presented: a browser session cookie or an agent token. */
data class Credential(val token: String, val kind: CredentialKind)

enum class CredentialKind(val wire: String) {
    SESSION("session"),
    AGENT("agent"),
}

enum class PrincipalKind(val wire: String) {
    HUMAN("human"),
    AGENT("agent"),
}

/**
 * An action on a project, checked against the one [Permission] it needs (docs/access/access-and-invitations.md). The
 * first six can also be granted to a project agent's token, which then needs both the capability and the permission
 * on its membership; the others are decisions and settings that only people make.
 */
enum class Capability(val wire: String, val permission: Permission) {
    TASKS_READ("tasks:read", Permission.TASKS_READ),
    TASKS_WRITE("tasks:write", Permission.TASKS_WRITE),
    THREADS_READ("threads:read", Permission.TASKS_READ),
    THREADS_WRITE("threads:write", Permission.THREADS_WRITE),
    MAPS_READ("maps:read", Permission.MAPS_READ),
    MAPS_WRITE("maps:write", Permission.MAPS_WRITE),
    RELEASES_MANAGE("releases:manage", Permission.RELEASES_MANAGE),
    PROJECT_SETTINGS("project:settings", Permission.PROJECT_SETTINGS),
    APPROVALS_DECIDE("approvals:decide", Permission.APPROVALS_DECIDE),
    AGENTS_MANAGE("agents:manage", Permission.AGENTS_MANAGE),
    MEMBERS_INVITE("members:invite", Permission.MEMBERS_INVITE),
    MEMBERS_MANAGE("members:manage", Permission.MEMBERS_MANAGE),
    PROJECT_ACCESS("project:access", Permission.PROJECT_ACCESS),
    FINANCE_READ("finance:read", Permission.FINANCE_READ),
    FINANCE_WRITE("finance:write", Permission.FINANCE_WRITE),
    ;

    companion object {
        val GRANTABLE: List<Capability> =
            listOf(TASKS_READ, TASKS_WRITE, THREADS_READ, THREADS_WRITE, MAPS_READ, MAPS_WRITE)

        fun fromWire(value: String): Capability? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * The principal behind a request, resolved from a live credential inside the request's transaction. An agent is
 * limited to one project, its granted capabilities and the current rights of the person who issued it.
 */
data class Actor(
    val id: String,
    val name: String,
    val kind: PrincipalKind,
    val credentialId: String,
    val csrf: String?,
    val projectId: String?,
    val capabilities: Set<Capability>,
    val initiatorId: String,
) {
    val isHuman: Boolean get() = kind == PrincipalKind.HUMAN

    /** A write-only agent grant must not receive existing content back; people read through membership. */
    fun mayRead(capability: Capability): Boolean = isHuman || capability in capabilities
}
