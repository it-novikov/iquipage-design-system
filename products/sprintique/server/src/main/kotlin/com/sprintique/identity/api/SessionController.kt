package com.sprintique.identity.api

import com.sprintique.identity.application.EmailSignIn
import com.sprintique.identity.application.SignInMethod
import com.sprintique.identity.application.SignInProviders
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Profile("api")
class SessionController(
    private val requests: AuthenticatedRequests,
    private val methods: List<SignInMethod>,
    private val providers: SignInProviders,
    private val emailSignIn: EmailSignIn,
) {
    /** Anonymous: which ways in exist, so the sign-in screen never offers an unconfigured one. */
    @GetMapping("/api/v1/auth/methods")
    fun methods(): Map<String, Boolean> = linkedMapOf(
        "email" to emailSignIn.isAvailable,
        "google" to ("google" in providers.names),
        "apple" to ("apple" in providers.names),
        "devLogin" to methods.any { it.name() == "devLogin" },
    )

    @GetMapping("/api/v1/session")
    fun session(request: HttpServletRequest): Map<String, Any?> = requests.run(request) { tx, actor ->
        val projects = tx.rows(
            """
            SELECT p.id, p.workspace_id AS "workspaceId", p.name, p.slug, p.key, p.avatar_asset_id AS "avatarAssetId", m.role,
                   w.name AS "workspaceName"
            FROM app.projects p JOIN app.project_members m ON m.project_id = p.id AND m.principal_id = $1
            JOIN app.workspaces w ON w.id = p.workspace_id ORDER BY w.name, p.name
            """.trimIndent(),
            actor.id,
        )
        val avatar = tx.row("SELECT revision FROM app.person_avatars WHERE principal_id = $1", actor.id)
        linkedMapOf(
            "principal" to
                linkedMapOf(
                    "id" to actor.id,
                    "name" to actor.name,
                    "kind" to actor.kind.wire,
                    "avatarRevision" to avatar?.get("revision"),
                ),
            "csrf" to actor.csrf,
            "projects" to projects,
        )
    }

    @PostMapping("/api/v1/logout")
    fun logout(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): Map<String, Boolean> = requests.run(request) { tx, actor ->
        tx.update("UPDATE auth.credentials SET revoked_at = clock_timestamp() WHERE id = $1", actor.credentialId)
        response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(AuthenticatedRequests.SESSION_COOKIE, "", 0))
        // Signing out also forgets the browser, so a shared computer keeps no exemption from the code limits.
        val device = EmailSignInController.DEVICE_COOKIE
        AuthenticatedRequests.cookie(request, device)?.takeIf { EmailSignInController.TOKEN.matches(it) }?.let {
            emailSignIn.forget(tx, it)
            response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(device, "", 0))
        }
        mapOf("ok" to true)
    }
}
