package com.sprintique.web

import jakarta.servlet.FilterChain
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Request bodies are bounded per route: 128 KiB for commands, 2 MiB for map documents, 10 MiB for a person's photo,
 * 2 GiB for a file's content. A declared length over the limit is refused at once; a streamed body is counted and cut
 * off at the limit.
 */
@Component
@Profile("api")
@Order(FilterOrder.BODY)
class BodySizeFilter : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val limit = limitFor(request)
        if (request.contentLengthLong > limit) {
            return ProblemWriter.write(request, response, 413, "INVALID_REQUEST", "Некорректный запрос.")
        }
        chain.doFilter(LimitedRequest(request, limit), response)
    }

    private class LimitedRequest(request: HttpServletRequest, private val limit: Long) : HttpServletRequestWrapper(
        request,
    ) {
        private val stream by lazy { LimitedStream(super.getInputStream(), limit) }

        override fun getInputStream(): ServletInputStream = stream
    }

    private class LimitedStream(
        private val source: ServletInputStream,
        private val limit: Long,
    ) : ServletInputStream() {
        private var read = 0L

        override fun read(): Int = source.read().also { if (it >= 0) count(1) }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int = source.read(buffer, offset, length).also {
            if (it >
                0
            ) {
                count(it.toLong())
            }
        }

        private fun count(bytes: Long) {
            read += bytes
            if (read > limit) throw PayloadTooLargeException()
        }

        override fun isFinished() = source.isFinished

        override fun isReady() = source.isReady

        override fun setReadListener(listener: ReadListener) = source.setReadListener(listener)
    }

    companion object {
        const val COMMAND_LIMIT = 128L * 1024
        const val DOCUMENT_LIMIT = 2L * 1024 * 1024
        const val AVATAR_LIMIT = 10L * 1024 * 1024

        /** The content of one stored file; the media module checks the exact reserved size inside this bound. */
        const val FILE_LIMIT = 2L * 1024 * 1024 * 1024
        private val DOCUMENT = Regex("^/api/v1/projects/[^/]+/(maps|map-templates)/[^/]+$")

        fun limitFor(request: HttpServletRequest): Long = when {
            RequestLimitFilter.isFileContent(request) -> FILE_LIMIT
            RequestLimitFilter.isUpload(request) -> AVATAR_LIMIT
            request.method == "PUT" && DOCUMENT.matches(RequestLimitFilter.routedPath(request)) -> DOCUMENT_LIMIT
            else -> COMMAND_LIMIT
        }
    }
}
