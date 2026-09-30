package com.sprintique.identity.domain

/** A bearer secret as presented: a browser session cookie, an agent token or a person's delegated token. */
data class Credential(val token: String, val kind: CredentialKind)

/**
 * How a principal proved who it is. A session is the person at the interface; an agent is its own principal; a
 * personal token and an OAuth access token are the person, delegated to a script or an app and narrowed by scopes.
 */
enum class CredentialKind(val wire: String, val prefix: String?) {
    SESSION("session", null),
    AGENT("agent", "spr_"),
    PERSONAL("personal", "spp_"),
    OAUTH("oauth", "spo_"),
    ;

    val isDelegated: Boolean get() = this == PERSONAL || this == OAUTH

    companion object {
        /** The kind of a bearer token by its prefix; a session is never a bearer token. */
        fun ofBearer(token: String): CredentialKind? = entries.firstOrNull {
            it.prefix != null &&
                token.startsWith(it.prefix)
        }
    }
}

/** What a delegated credential may do with its person's rights: read, and optionally change. */
enum class Scope(val wire: String) {
    READ("read"),
    WRITE("write"),
    ;

    companion object {
        fun fromWire(value: String): Scope? = entries.firstOrNull { it.wire == value }
    }
}

/** The resource a request is addressed to, for the audience of delegated tokens (RFC 8707). */
enum class ProtectedResource { API, MCP }

enum class PrincipalKind(val wire: String) {
    HUMAN("human"),
    AGENT("agent"),
}

/**
 * What a principal may do in a project. The first six can be granted to an agent; catalog and agent management exist
 * only for project administrators; finance is read by the people of the project and changed by its administrators.
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
    FINANCE_READ("finance:read"),
    FINANCE_WRITE("finance:write"),
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
 * limited to one project, its granted capabilities and the current rights of the person who issued it. A delegated
 * credential is the person, narrowed by its [scopes]; [clientId] names the OAuth app it was issued to.
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
    val credentialKind: CredentialKind,
    val scopes: Set<Scope> = emptySet(),
    val clientId: String? = null,
) {
    val isHuman: Boolean get() = kind == PrincipalKind.HUMAN

    /** The person at the interface, with a session: the only caller trusted with security decisions. */
    val isInteractive: Boolean get() = credentialKind == CredentialKind.SESSION

    val isDelegated: Boolean get() = credentialKind.isDelegated

    /** Whether the credential lets the caller change data at all; people's roles are checked separately. */
    val mayChange: Boolean get() = !isDelegated || Scope.WRITE in scopes

    /** A write-only agent grant must not receive existing content back; people read through membership. */
    fun mayRead(capability: Capability): Boolean = isHuman || capability in capabilities
}
