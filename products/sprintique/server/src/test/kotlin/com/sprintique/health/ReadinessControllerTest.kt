package com.sprintique.health

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** SEC-05: anonymous readiness shares one dependency probe and still fails closed. */
class ReadinessControllerTest {
    @Test
    fun `a burst of readiness requests shares probes and a later request probes again`() {
        val probes = AtomicInteger()
        val controller = ReadinessController(
            listOf(
                ReadinessProbe {
                    probes.incrementAndGet()
                    Thread.sleep(25)
                },
            ),
        )
        val burst = Executors.newVirtualThreadPerTaskExecutor().use { executor ->
            executor.invokeAll(List(24) { Callable { controller.ready() } }).map { it.get() }
        }
        assertThat(burst).allMatch { it == mapOf("status" to "ready") }
        assertThat(probes.get()).isLessThan(24)
        val before = probes.get()
        controller.ready()
        assertThat(probes.get()).isGreaterThan(before)
    }

    @Test
    fun `a failing dependency fails readiness`() {
        val controller = ReadinessController(listOf(ReadinessProbe { error("storage down") }))
        assertThatThrownBy { controller.ready() }.isInstanceOf(IllegalStateException::class.java)
    }
}
