package com.sprintique.web

import com.sprintique.problem.ProblemException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.method.MethodValidationException
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.context.request.async.AsyncRequestNotUsableException
import org.springframework.web.method.annotation.HandlerMethodValidationException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.servlet.NoHandlerFoundException
import org.springframework.web.servlet.resource.NoResourceFoundException

/**
 * Every failure becomes `{code, message, requestId}`. SQL, stack traces, credentials and provider responses never
 * reach the client or the log.
 */
@RestControllerAdvice
@Profile("api")
class ProblemResponses {
    private val log = LoggerFactory.getLogger(ProblemResponses::class.java)

    @ExceptionHandler(ProblemException::class)
    fun problem(
        error: ProblemException,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<Map<String, Any?>> {
        if (error.status == HttpStatus.TOO_MANY_REQUESTS.value() || error.code == "BUSY") {
            response.setHeader("Retry-After", if (error.status == HttpStatus.TOO_MANY_REQUESTS.value()) "60" else "5")
        }
        val body =
            linkedMapOf<String, Any?>(
                "code" to error.code,
                "message" to error.message,
                "requestId" to RequestIds.of(request),
            )
        error.action?.let { body["action"] = it }
        // A request that accepts only an event stream cannot take a JSON body; the status alone answers it.
        if (eventStreamOnly(request)) return ResponseEntity.status(error.status).build()
        return ResponseEntity.status(error.status).body(body)
    }

    /** The client went away while an asynchronous response (a stream) was being written: nothing to answer. */
    @ExceptionHandler(AsyncRequestNotUsableException::class)
    fun clientGone() {
        log.debug("Client disconnected during an asynchronous response")
    }

    @ExceptionHandler(
        HttpMessageNotReadableException::class,
        MethodArgumentNotValidException::class,
        HandlerMethodValidationException::class,
        MethodValidationException::class,
        MissingRequestHeaderException::class,
        MethodArgumentTypeMismatchException::class,
        RequestValidationException::class,
    )
    fun validation(request: HttpServletRequest): ResponseEntity<Map<String, Any?>> =
        body(request, HttpStatus.BAD_REQUEST, "VALIDATION", "Проверьте поля запроса.")

    @ExceptionHandler(
        NoHandlerFoundException::class,
        NoResourceFoundException::class,
        HttpRequestMethodNotSupportedException::class,
    )
    fun notFound(request: HttpServletRequest): ResponseEntity<Map<String, Any?>> =
        body(request, HttpStatus.NOT_FOUND, "NOT_FOUND", "Ресурс не найден.")

    @ExceptionHandler(HttpMediaTypeNotSupportedException::class)
    fun unsupportedMediaType(request: HttpServletRequest): ResponseEntity<Map<String, Any?>> =
        body(request, HttpStatus.UNSUPPORTED_MEDIA_TYPE, "INVALID_REQUEST", "Некорректный запрос.")

    @ExceptionHandler(PayloadTooLargeException::class)
    fun tooLarge(request: HttpServletRequest): ResponseEntity<Map<String, Any?>> {
        // A streamed photo without a declared length is cut off at the limit and told the same as a declared one.
        if (BodySizeFilter.isPhoto(request)) {
            BodySizeFilter.refusedPhoto(-1)
            return body(request, HttpStatus.CONTENT_TOO_LARGE, "FILE_SIZE", BodySizeFilter.PHOTO_TOO_LARGE)
        }
        return body(request, HttpStatus.CONTENT_TOO_LARGE, "INVALID_REQUEST", "Некорректный запрос.")
    }

    @ExceptionHandler(Exception::class)
    fun unexpected(error: Exception, request: HttpServletRequest): ResponseEntity<Map<String, Any?>> {
        val sqlState =
            generateSequence<Throwable>(error) {
                it.cause
            }.filterIsInstance<java.sql.SQLException>().firstOrNull()?.sqlState
        return when (sqlState) {
            "23505" -> {
                body(request, HttpStatus.CONFLICT, "CONFLICT", "Такой объект уже существует.")
            }

            "23503", "23514" -> {
                body(request, HttpStatus.UNPROCESSABLE_CONTENT, "REFERENCE_INVALID", "Связанные данные недоступны.")
            }

            else -> {
                // The class and the first frame of our own code outside the database layer locate the failure; the
                // message may carry data and is not logged.
                val site = error.stackTrace.firstOrNull {
                    it.className.startsWith("com.sprintique.") && !it.className.startsWith("com.sprintique.database.")
                }
                log.error(
                    "Request failed request_id={} code={} error={} at={}",
                    RequestIds.of(request),
                    sqlState ?: "INTERNAL",
                    error.javaClass.name,
                    site?.let { "${it.className}.${it.methodName}:${it.lineNumber}" },
                )
                // The message only at debug level: a local diagnosis, never in a production log.
                log.debug("Request failed request_id={}", RequestIds.of(request), error)
                body(
                    request,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "TEMPORARILY_UNAVAILABLE",
                    "Сервис временно недоступен. Повторите позже.",
                )
            }
        }
    }

    private fun body(
        request: HttpServletRequest,
        status: HttpStatus,
        code: String,
        message: String,
    ): ResponseEntity<Map<String, Any?>> =
        if (eventStreamOnly(request)) {
            ResponseEntity.status(status).build()
        } else {
            ResponseEntity.status(status).body(
                linkedMapOf(
                    "code" to code,
                    "message" to message,
                    "requestId" to RequestIds.of(request),
                ),
            )
        }

    private fun eventStreamOnly(request: HttpServletRequest): Boolean {
        val accept = request.getHeader("Accept")?.lowercase() ?: return false
        return "text/event-stream" in accept && "json" !in accept && "*/*" !in accept
    }
}

/** Thrown by explicit request checks that bean validation cannot express. */
class RequestValidationException : RuntimeException("Request validation failed")

/** Thrown when a request body is larger than its route allows. */
class PayloadTooLargeException : RuntimeException("Request body too large")
