package com.sprintique.identity.domain

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
 * What a principal may do in a project. The first six can be granted to an agent; the last two exist only for
 * project administrators.
 */
enum class Capability(val wire: String) {
    TASKS_READ("tasks:read"),
    TASKS_WRITE("tasks:write"),
    THREADS_READ("threads:read"),
    THREADS_WRITE("threads:write"),
    MAPS_READ("maps:read"),
    MAPS_WRITE("maps:write"),
    CATALOG_WRITE("catalog:write"),
    AGENTS_MANAGE("agents:manage"),
    ;

    val isWrite: Boolean get() = !wire.endsWith(":read")

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
