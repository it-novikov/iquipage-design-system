package com.sprintique.identity.api

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.contract.Contracts
import com.sprintique.identity.application.EmailSignIn
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.web.ClientAddresses
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

data class EmailCodeRequest(
    @field:Size(max = 320)
    val email: String,
)

data class EmailCodeAnswer(
    @field:Pattern(regexp = "^[0-9]{6}$")
    val code: String,
)

/**
 * Sign-in by a code from a letter. Both steps accept only same-origin requests; the challenge token stays in an
 * HttpOnly cookie of the browser that asked, so a code read elsewhere is useless without it.
 */
@RestController
@Profile("api")
class EmailSignInController(
    private val emailSignIn: EmailSignIn,
    private val contracts: Contracts,
    private val properties: SprintiqueProperties,
    private val clientAddresses: ClientAddresses,
) {
    @PostMapping("/auth/email/start")
    fun start(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): Map<String, Any> {
        requireSameOrigin(request)
        val input = contracts.parse<EmailCodeRequest>(body)
        val email = EmailAddress.parse(input.email)
            ?: throw ProblemException(422, "EMAIL_INVALID", "Проверьте адрес почты.")
        val device = AuthenticatedRequests.cookie(request, DEVICE_COOKIE)?.takeIf { TOKEN.matches(it) }
        val token = emailSignIn.start(email, clientAddresses.of(request), device)
        response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(CHALLENGE_COOKIE, token, CHALLENGE_SECONDS))
        return linkedMapOf("sent" to true, "codeLength" to EmailSignIn.CODE_LENGTH)
    }

    @PostMapping("/auth/email/verify")
    fun verify(
        @RequestBody(required = false) body: JsonNode?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): Map<String, Boolean> {
        requireSameOrigin(request)
        val input = contracts.parse<EmailCodeAnswer>(body)
        val token = requirePresent(
            AuthenticatedRequests.cookie(request, CHALLENGE_COOKIE)?.takeIf { TOKEN.matches(it) },
            400,
            "EMAIL_CODE_EXPIRED",
            "Код больше не действует. Запросите новый.",
        )
        val device = AuthenticatedRequests.cookie(request, DEVICE_COOKIE)?.takeIf { TOKEN.matches(it) }
        val signedIn = emailSignIn.verify(token, input.code, device)
        val session = signedIn.session
        response.addHeader("Set-Cookie", AuthenticatedRequests.cookieValue(CHALLENGE_COOKIE, "", 0))
        response.addHeader(
            "Set-Cookie",
            AuthenticatedRequests.cookieValue(DEVICE_COOKIE, signedIn.device, EmailSignIn.DEVICE_DAYS * DAY_SECONDS),
        )
        response.addHeader(
            "Set-Cookie",
            AuthenticatedRequests.cookieValue(AuthenticatedRequests.SESSION_COOKIE, session.token, SESSION_SECONDS),
        )
        return mapOf("ok" to true)
    }

    private fun requireSameOrigin(request: HttpServletRequest) =
        requireCondition(
            request.getHeader("Origin") == properties.publicOrigin,
            403,
            "CSRF",
            "Обновите страницу и попробуйте снова.",
        )

    companion object {
        private const val CHALLENGE_COOKIE = "__Host-sprintique-email"
        const val DEVICE_COOKIE = "__Host-sprintique-device"
        private const val DAY_SECONDS = 86_400L
        private const val CHALLENGE_SECONDS = 600L
        private const val SESSION_SECONDS = 28_800L
        val TOKEN = Regex("^[A-Za-z0-9_-]{43}$")
    }
}
