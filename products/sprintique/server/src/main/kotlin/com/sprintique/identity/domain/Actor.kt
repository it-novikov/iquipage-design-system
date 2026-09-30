package com.sprintique.identity.domain

/** A bearer secret as presented: a browser session cookie, an agent token or a service account's token. */
data class Credential(val token: String, val kind: CredentialKind)

/**
 * How a principal proved who it is. A session is the person at the interface; an agent token is a project agent's.
 * A service token (for scripts) and an OAuth access token (for apps such as Claude) are a service account's: its owner
 * delegated work to it, never their own identity, and the token is narrowed by scopes.
 */
enum class CredentialKind(val wire: String, val prefix: String?) {
    SESSION("session", null),
    AGENT("agent", "spr_"),
    SERVICE("service", "spk_"),
    OAUTH("oauth", "spo_"),
    ;

    /** A service account's token: bound to a resource, narrowed by scopes, never trusted with access decisions. */
    val isDelegated: Boolean get() = this == SERVICE || this == OAUTH

    companion object {
        /** The kind of a bearer token by its prefix; a session is never a bearer token. */
        fun ofBearer(token: String): CredentialKind? = entries.firstOrNull {
            it.prefix != null &&
                token.startsWith(it.prefix)
        }
    }
}

/** What a service account's token may do with the account's rights: read, and optionally change. */
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

    /** A service account: made and owned by a person, a member of the projects it was granted, never above them. */
    SERVICE("service"),
    ;

    companion object {
        fun fromWire(value: String): PrincipalKind = entries.first { it.wire == value }
    }
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
 * limited to one project, its granted capabilities and the current rights of the person who issued it. A service
 * account acts as itself through a token narrowed by its [scopes], within its project roles and its owner's current
 * rights; its [initiatorId] is its owner, and [clientId] names the OAuth app the token was issued to.
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

    val isAgent: Boolean get() = kind == PrincipalKind.AGENT

    val isService: Boolean get() = kind == PrincipalKind.SERVICE

    /** The person at the interface, with a session: the only caller trusted with security decisions. */
    val isInteractive: Boolean get() = credentialKind == CredentialKind.SESSION

    val isDelegated: Boolean get() = credentialKind.isDelegated

    /** Whether the credential lets the caller change data at all; people's roles are checked separately. */
    val mayChange: Boolean get() = !isDelegated || Scope.WRITE in scopes

    /**
     * A write-only agent grant must not receive existing content back; people and service accounts read through
     * membership.
     */
    fun mayRead(capability: Capability): Boolean = !isAgent || capability in capabilities
}
