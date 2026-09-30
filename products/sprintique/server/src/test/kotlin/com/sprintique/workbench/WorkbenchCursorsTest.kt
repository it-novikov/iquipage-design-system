package com.sprintique.workbench

import com.sprintique.workbench.application.CursorScope
import com.sprintique.workbench.application.WorkbenchCursors
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64

class WorkbenchCursorsTest {
    private val secret = "s".repeat(32)
    private val now = Instant.parse("2026-09-29T10:00:00Z")
    private val cursors = WorkbenchCursors(secret, Clock.fixed(now, ZoneOffset.UTC))
    private val scope = CursorScope("alice", "epoch-1", "participating", "filter-1")

    @Test
    fun `a cursor opens for the actor, section and filter it was cut for`() {
        val cursor = cursors.encode(scope, "0000000001|p|t")
        val opened = cursors.open(cursor, "alice", "participating", "filter-1")
        assertThat(opened.after).isEqualTo("0000000001|p|t")
        assertThat(opened.epoch).isEqualTo("epoch-1")
    }

    @Test
    fun `another actor, section or filter gets one uniform answer`() {
        val cursor = cursors.encode(scope, "k")
        for ((actor, section, filter) in listOf(
            Triple("bob", "participating", "filter-1"),
            Triple("alice", "active", "filter-1"),
            Triple("alice", "participating", "filter-2"),
        )) {
            assertThatThrownBy { cursors.open(cursor, actor, section, filter) }
                .extracting("code").isEqualTo("CURSOR_INVALID")
        }
    }

    @Test
    fun `a tampered, foreign-key or malformed cursor is invalid`() {
        val cursor = cursors.encode(scope, "k")
        val (payload, signature) = cursor.split('.')
        val decoded = String(Base64.getUrlDecoder().decode(payload)).replace("alice", "mallory")
        val forged = Base64.getUrlEncoder().withoutPadding().encodeToString(decoded.toByteArray()) + "." + signature
        val otherKey = WorkbenchCursors("t".repeat(32), Clock.fixed(now, ZoneOffset.UTC)).encode(scope, "k")
        for (value in listOf(forged, otherKey, "", "abc", "a.b.c", "!!!.???", "$payload.")) {
            assertThatThrownBy { cursors.open(value, "alice", "participating", "filter-1") }
                .extracting("code").isEqualTo("CURSOR_INVALID")
        }
    }

    @Test
    fun `a cursor expires after its lifetime`() {
        val cursor = cursors.encode(scope, "k")
        val later = WorkbenchCursors(secret, Clock.fixed(now.plus(WorkbenchCursors.LIFETIME), ZoneOffset.UTC))
        assertThatThrownBy { later.open(cursor, "alice", "participating", "filter-1") }
            .extracting("code").isEqualTo("CURSOR_EXPIRED")
    }

    @Test
    fun `a change of access makes an older cursor stale`() {
        val opened = cursors.open(cursors.encode(scope, "k"), "alice", "participating", "filter-1")
        cursors.requireEpoch(opened, "epoch-1")
        assertThatThrownBy { cursors.requireEpoch(opened, "epoch-2") }.extracting("code").isEqualTo("CURSOR_STALE")
    }

    @Test
    fun `a configured key is at least 32 characters and a random one survives only its process`() {
        assertThatThrownBy { WorkbenchCursors("short") }.isInstanceOf(IllegalArgumentException::class.java)
        val first = WorkbenchCursors("").encode(scope, "k")
        assertThatThrownBy { WorkbenchCursors("").open(first, "alice", "participating", "filter-1") }
            .extracting("code").isEqualTo("CURSOR_INVALID")
    }
}
