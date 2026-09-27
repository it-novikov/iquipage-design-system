package com.sprintique.web

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain

/**
 * Spring Security supplies request firewalling (encoded traversal, malformed paths). Authentication, CSRF and headers
 * are the application's own: a credential is resolved inside the same database transaction as the operation it
 * authorizes, so a revocation committed while a request waits cannot be outrun.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { requests -> requests.anyRequest().permitAll() }
        .csrf { it.disable() }
        .headers { it.disable() }
        .formLogin { it.disable() }
        .httpBasic { it.disable() }
        .logout { it.disable() }
        .requestCache { it.disable() }
        .anonymous { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .build()
}
