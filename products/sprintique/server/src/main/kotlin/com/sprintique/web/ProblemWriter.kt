package com.sprintique.web

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import tools.jackson.databind.json.JsonMapper

/** Writes `{code, message, requestId}` from a servlet filter, where the MVC exception handlers do not reach. */
object ProblemWriter {
    private val json = JsonMapper.builder().build()

    fun write(request: HttpServletRequest, response: HttpServletResponse, status: Int, code: String, message: String) {
        if (status == 429) response.setHeader("Retry-After", "60")
        if (code == "BUSY") response.setHeader("Retry-After", "5")
        response.status = status
        response.contentType = "application/json; charset=utf-8"
        response.writer.write(
            json.writeValueAsString(
                linkedMapOf(
                    "code" to code,
                    "message" to message,
                    "requestId" to RequestIds.of(request),
                ),
            ),
        )
    }
}
