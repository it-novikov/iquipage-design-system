package com.sprintique.event.api

import com.sprintique.contract.QueryParameters
import com.sprintique.event.application.EventPage
import com.sprintique.event.application.ProjectEvents
import com.sprintique.identity.api.AuthenticatedRequests
import com.sprintique.identity.api.RequestInputs
import com.sprintique.identity.application.Authentication
import com.sprintique.identity.application.RequestIntent
import com.sprintique.identity.domain.Credential
import com.sprintique.problem.ProblemException
import com.sprintique.token.Tokens
import com.sprintique.web.RequestValidationException
import jakarta.annotation.PreDestroy
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * Project events: a head to subscribe from, pages after a cursor, and the same pages as a server-sent stream. The
 * stream publishes the committed outbox; it never marks external delivery as complete.
 */
@RestController
@Profile("api")
class EventController(
    private val requests: AuthenticatedRequests,
    private val authentication: Authentication,
    private val json: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(EventController::class.java)

    /** Open streams and the credential each belongs to (as a hash). */
    private val streams = ConcurrentHashMap<ResponseBodyEmitter, String>()

    @GetMapping("/api/v1/projects/{projectId}/events/head")
    fun head(@PathVariable projectId: String, request: HttpServletRequest) = requests.run(request) { tx, actor ->
        ProjectEvents.head(tx, actor, RequestInputs.id(projectId))
    }

    @GetMapping("/api/v1/projects/{projectId}/events")
    fun events(@PathVariable projectId: String, request: HttpServletRequest): Any {
        RequestInputs.id(projectId)
        val credential = requests.credentialOf(request)
        val query = QueryParameters(request, setOf("cursor", "stream"))
        val stream = query.oneOf("stream", setOf("true")) != null
        // A reconnect's last delivered event advances beyond the cursor of the original URL.
        val lastEvent = request.getHeader("Last-Event-ID")?.also {
            if (it.length >
                CURSOR_LIMIT
            ) {
                throw RequestValidationException()
            }
        }
        val requested = lastEvent?.takeIf { it.isNotEmpty() } ?: query.string("cursor", CURSOR_LIMIT)
        val start = start(credential, projectId, requested, stream)
        if (!stream) return start.page
        var cursor = start.cursor
        val first = start.page
        val identity = Tokens.sha256Hex(credential.token)
        val emitter = ResponseBodyEmitter(0L)
        if (!admit(emitter, identity)) return busy(emitter)
        if (start.resync) {
            val data = json.writeValueAsString(linkedMapOf("clearCache" to true, "code" to "RECONNECT"))
            emitter.send("id: $cursor\nevent: resync\ndata: $data\n\n", TEXT)
        }
        val close = { streams.remove(emitter) }
        emitter.onCompletion { close() }
        emitter.onTimeout { close() }
        emitter.onError { close() }
        Thread.ofVirtual().name("events-$projectId").start {
            var batch = first
            try {
                while (streams.containsKey(emitter)) {
                    send(emitter, batch)
                    cursor = batch.cursor
                    if (!batch.hasMore) Thread.sleep(POLL)
                    batch = read(credential, projectId, cursor)
                }
            } catch (error: ProblemException) {
                val denied = error.status in DENIED
                finish(
                    emitter,
                    if (denied) "access-revoked" else "resync",
                    if (denied) "ACCESS_REVOKED" else "RECONNECT",
                )
            } catch (_: IOException) {
                emitter.complete()
            } catch (_: InterruptedException) {
                emitter.complete()
            } catch (@Suppress("TooGenericExceptionCaught") error: RuntimeException) {
                log.warn("Event stream stopped error={}", error.javaClass.name)
                finish(emitter, "resync", "RECONNECT")
            }
        }
        return eventStream(emitter)
    }

    private class Start(val page: EventPage, val cursor: String?, val resync: Boolean)

    /**
     * The first page after the cursor. A browser's EventSource never retries after an HTTP error status, so a stream
     * that cannot continue from its cursor starts from the head and is told to resync; its `id` moves Last-Event-ID on.
     */
    private fun start(credential: Credential, projectId: String, cursor: String?, stream: Boolean): Start =
        try {
            Start(read(credential, projectId, cursor), cursor, false)
        } catch (error: ProblemException) {
            if (!stream || error.code != "CURSOR_INVALID") throw error
            val head = headCursor(credential, projectId)
            Start(read(credential, projectId, head), head, true)
        }

    /** Counting and registering are one step: a burst of parallel requests cannot all pass the same count. */
    private fun admit(emitter: ResponseBodyEmitter, identity: String): Boolean = synchronized(streams) {
        val free = streams.size < MAX_STREAMS && streams.values.count { it == identity } < STREAMS_PER_CREDENTIAL
        if (free) streams[emitter] = identity
        free
    }

    /**
     * Over the limit the stream still opens, asks the browser to come back later and ends: an error status would stop
     * EventSource for good, and connections stuck on a slow network can hold the per-credential slots for a while.
     */
    private fun busy(emitter: ResponseBodyEmitter): ResponseEntity<ResponseBodyEmitter> {
        try {
            emitter.send("retry: ${BUSY_RETRY.toMillis()}\n: busy\n\n", TEXT)
        } catch (_: IOException) {
            // The client already left.
        }
        emitter.complete()
        return eventStream(emitter)
    }

    private fun eventStream(emitter: ResponseBodyEmitter): ResponseEntity<ResponseBodyEmitter> =
        ResponseEntity.ok()
            .header("Cache-Control", "no-store")
            .header("X-Accel-Buffering", "no")
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(emitter)

    private fun headCursor(credential: Credential, projectId: String): String =
        authentication.run(credential, RequestIntent(false, null, null)) { tx, actor ->
            ProjectEvents.head(tx, actor, projectId).getValue("cursor")
        }

    private fun read(credential: Credential, projectId: String, cursor: String?): EventPage =
        authentication.run(credential, RequestIntent(false, null, null)) { tx, actor ->
            ProjectEvents.page(tx, actor, projectId, cursor)
        }

    /** Frames are written as text in the stream's own format: `id`, `event` and `data` lines, a blank line. */
    private fun send(emitter: ResponseBodyEmitter, batch: EventPage) {
        for (event in batch.items) {
            emitter.send("id: ${event["cursor"]}\nevent: change\ndata: ${json.writeValueAsString(event)}\n\n", TEXT)
        }
        if (batch.items.isEmpty()) emitter.send(": keepalive\n\n", TEXT)
    }

    /** Tells the client to drop what it cached, then ends the stream. */
    private fun finish(emitter: ResponseBodyEmitter, event: String, code: String) {
        try {
            val data = json.writeValueAsString(linkedMapOf("clearCache" to true, "code" to code))
            emitter.send("event: $event\ndata: $data\n\n", TEXT)
            emitter.complete()
        } catch (_: IOException) {
            emitter.complete()
        } catch (_: IllegalStateException) {
            // Already completed by the client going away.
        }
    }

    @PreDestroy
    fun closeStreams() {
        for (emitter in streams.keys) emitter.complete()
        streams.clear()
    }

    private companion object {
        const val CURSOR_LIMIT = 3000
        const val MAX_STREAMS = 100
        const val STREAMS_PER_CREDENTIAL = 3
        val POLL: Duration = Duration.ofSeconds(1)
        val BUSY_RETRY: Duration = Duration.ofSeconds(15)
        val DENIED = setOf(401, 403, 404)
        val TEXT: MediaType = MediaType("text", "event-stream", Charsets.UTF_8)
    }
}
