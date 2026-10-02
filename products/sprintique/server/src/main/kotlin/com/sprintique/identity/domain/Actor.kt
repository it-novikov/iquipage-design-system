package com.sprintique.identity.domain

import com.sprintique.access.domain.Permission

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

    /**
     * The credential of one run of a service account's agent (docs/decisions/0005-ai-agents.md): issued by the server
     * for the run and its project, never handed out as a bearer token and revoked when the run ends.
     */
    RUNTIME("runtime", null),

    /**
     * A person acting from the Telegram chat linked to them: a button under a notification or a reply to it
     * (docs/decisions/0007-notification-channels.md). Never presented over HTTP; the link itself is the credential.
     */
    TELEGRAM("telegram", null),
    ;

    /** A service account's credential: narrowed by scopes, never trusted with access decisions. */
    val isDelegated: Boolean get() = this == SERVICE || this == OAUTH || this == RUNTIME

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
    /**
     * The person an agent run acts for (docs/decisions/0005-ai-agents.md): whoever assigned the task, mentioned the
     * account or started the agent. Every check of the account is also made for this person.
     */
    val onBehalfOf: String? = null,
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
