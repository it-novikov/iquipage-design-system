package com.sprintique.ai.infrastructure

import com.sprintique.ai.application.AgentRunner
import com.sprintique.ai.application.SecretBox
import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import com.sprintique.configuration.SprintiqueProperties
import org.slf4j.LoggerFactory
import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * The agent runners of an API process (docs/decisions/0005-ai-agents.md). Agents act as service accounts through the
 * same use cases and row security as requests, so they run where the runtime role is, not in the worker, whose role
 * may only call the queue functions of file cleanup. Runs are leased from the database, so several API processes
 * share the queue; `SPRINTIQUE_AI_RUNNERS=0` keeps a process out of it. Nothing runs while the feature is off or the
 * secrets key is missing.
 */
@Component
@Profile("api")
class AgentRunnerLoop(
    private val runner: AgentRunner,
    private val flags: FeatureFlags,
    private val box: SecretBox,
    properties: SprintiqueProperties,
) : SmartLifecycle {
    private val log = LoggerFactory.getLogger(AgentRunnerLoop::class.java)
    private val count = properties.ai.runners.coerceIn(0, MAX_RUNNERS)

    @Volatile private var running = false
    private val threads = mutableListOf<Thread>()

    override fun start() {
        running = true
        if (count == 0 || !flags.isEnabled(Feature.AI_AGENTS) || !box.isConfigured) return
        repeat(count) { index ->
            threads += Thread.ofPlatform().daemon(true).name("agent-runner-$index").start {
                while (running) {
                    val busy = try {
                        runner.runOne()
                    } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                        log.warn("Agent runner round unavailable; retrying. error={}", error.javaClass.name)
                        false
                    }
                    if (!busy && !pause()) break
                }
            }
        }
    }

    private fun pause(): Boolean = try {
        Thread.sleep(IDLE)
        true
    } catch (_: InterruptedException) {
        false
    }

    override fun stop() {
        running = false
        threads.forEach(Thread::interrupt)
        threads.forEach { it.join(STOP_WAIT.toMillis()) }
        threads.clear()
    }

    override fun isRunning() = running

    private companion object {
        const val MAX_RUNNERS = 16
        val IDLE: Duration = Duration.ofSeconds(1)
        val STOP_WAIT: Duration = Duration.ofSeconds(5)
    }
}
