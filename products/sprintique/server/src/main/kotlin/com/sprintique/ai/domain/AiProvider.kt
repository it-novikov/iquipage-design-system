package com.sprintique.ai.domain

/**
 * The kinds of AI connection: Anthropic's Messages API (Claude), OpenAI's Chat Completions (ChatGPT), and any
 * endpoint that speaks Chat Completions at a base address of its own (OpenRouter, DeepSeek, Together, vLLM, Ollama).
 */
enum class AiProvider(val wire: String, val title: String, val defaultBaseUrl: String?) {
    ANTHROPIC("anthropic", "Anthropic (Claude)", "https://api.anthropic.com"),
    OPENAI("openai", "OpenAI (ChatGPT)", "https://api.openai.com/v1"),
    OPENAI_COMPATIBLE("openai_compatible", "Совместимый с OpenAI", null),
    ;

    companion object {
        fun fromWire(value: String?): AiProvider? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * Why a call to a provider did not give an answer. The code is stored and shown; the message is what a person reads.
 * Nothing the provider said is ever repeated: its error texts may echo the request, the key or internal addresses.
 */
enum class ProviderFailure(val message: String, val retryable: Boolean = false) {
    PROVIDER_AUTH("Провайдер не принял ключ API. Проверьте ключ и его права."),
    PROVIDER_NOT_FOUND("По этому адресу нет нужного метода API или такой модели. Проверьте адрес и модель."),
    PROVIDER_REJECTED("Провайдер отклонил запрос. Проверьте модель и лимиты."),
    PROVIDER_RATE_LIMIT("Провайдер ограничил частоту запросов. Повторите позже.", retryable = true),
    PROVIDER_UNAVAILABLE("Провайдер временно недоступен. Повторите позже.", retryable = true),
    PROVIDER_TIMEOUT("Провайдер не ответил вовремя.", retryable = true),
    PROVIDER_UNREACHABLE("Не удалось связаться с провайдером. Проверьте адрес.", retryable = true),
    PROVIDER_REDIRECT("Провайдер перенаправляет запрос на другой адрес. Укажите конечный адрес API."),
    PROVIDER_ADDRESS_BLOCKED("Адрес ведёт во внутреннюю сеть. Такие адреса разрешает администратор сервера."),
    PROVIDER_INSECURE_URL("Нужен адрес https://. Обычный http разрешён только для адресов из списка сервера."),
    PROVIDER_RESPONSE_TOO_LARGE("Ответ провайдера слишком большой."),
    PROVIDER_RESPONSE_INVALID("Провайдер ответил в неожиданном формате."),
    ;

    companion object {
        fun fromCode(code: String?): ProviderFailure? = entries.firstOrNull { it.name == code }
    }
}

/** A provider call that failed for a known reason; carries no text of the provider. */
class ProviderException(val failure: ProviderFailure, val retryAfterSeconds: Long? = null) :
    RuntimeException(failure.name)
