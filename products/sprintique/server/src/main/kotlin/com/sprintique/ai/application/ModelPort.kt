package com.sprintique.ai.application

import com.sprintique.ai.domain.Endpoint
import com.sprintique.ai.domain.ModelReply
import com.sprintique.ai.domain.ModelRequest

/**
 * A language model behind a provider's API. Both calls throw ProviderException with a code on failure, after the
 * retries a busy provider deserves.
 */
interface ModelPort {
    /** One turn of the conversation: the model answers or asks for tool calls. */
    fun reply(endpoint: Endpoint, request: ModelRequest): ModelReply

    /**
     * A minimal real call that proves the address and the key work: the provider's list of models, or, where there
     * is no list and [probeModel] is known, a completion of one token. Returns the model names it learnt (maybe none).
     */
    fun check(endpoint: Endpoint, probeModel: String?): List<String>
}
