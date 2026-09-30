package com.sprintique.web

import com.sprintique.configuration.SprintiqueProperties
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Headers on every response. API responses are never cached unless a handler says otherwise; only content-addressed
 * build assets opt into long caching.
 */
@Component
@Profile("api")
@Order(FilterOrder.HEADERS)
class SecurityHeadersFilter(private val properties: SprintiqueProperties) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("X-Content-Type-Options", "nosniff")
        response.setHeader("Referrer-Policy", "same-origin")
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin")
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        // No page of the product is ever framed, the consent screen above all (clickjacking); CSP says the same.
        response.setHeader("X-Frame-Options", "DENY")
        if (properties.isSecureOrigin) {
            response.setHeader(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        }
        if (properties.webRoot.isNotEmpty()) response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        // Handlers that allow caching set Cache-Control themselves before the body is written.
        response.setHeader("Cache-Control", "no-store")
        chain.doFilter(request, response)
    }

    private companion object {
        const val CONTENT_SECURITY_POLICY =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
                "media-src 'self' blob:; " +
                "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }
}
