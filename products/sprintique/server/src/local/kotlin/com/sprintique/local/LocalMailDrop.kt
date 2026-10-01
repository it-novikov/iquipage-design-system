package com.sprintique.local

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.identity.application.MailMessage
import com.sprintique.identity.application.MailPort
import com.sprintique.identity.application.MailUnavailableException
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.PosixFilePermissions
import java.util.UUID

/**
 * The local stand's mailbox: every letter becomes a JSON file (`to`, `subject`, `text`, `html`, `headers`) in
 * SPRINTIQUE_MAIL_DROP,
 * readable only by its owner. Only the local artifact has it, and like dev login it refuses production and origins
 * other than loopback, so sign-in codes never land in a file on a deployed server.
 */
@Configuration(proxyBeanMethods = false)
@Profile("api", "worker")
@ConditionalOnExpression("'\${sprintique.mail.drop:}' != ''")
class LocalMailDropConfiguration(properties: SprintiqueProperties) {
    init {
        check(!properties.isProduction) { "The mail drop is never available in production" }
        check(URI(properties.publicOrigin).host in setOf("localhost", "127.0.0.1")) {
            "The mail drop requires a loopback PUBLIC_ORIGIN"
        }
    }

    @Bean
    fun mailDrop(properties: SprintiqueProperties): MailPort = LocalMailDrop(Path.of(properties.mail.drop))
}

class LocalMailDrop(private val directory: Path) : MailPort {
    private val json = JsonMapper.builder().build()

    override fun send(message: MailMessage) {
        try {
            Files.createDirectories(directory)
            val file = directory.resolve("${System.currentTimeMillis()}-${UUID.randomUUID()}.json")
            val letter = mapOf(
                "to" to message.to.value, "subject" to message.subject, "text" to message.text,
                "html" to message.html, "headers" to message.headers,
            )
            Files.createFile(file, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")))
            Files.write(file, json.writeValueAsBytes(letter), StandardOpenOption.TRUNCATE_EXISTING)
        } catch (error: IOException) {
            throw MailUnavailableException(error)
        }
    }
}
