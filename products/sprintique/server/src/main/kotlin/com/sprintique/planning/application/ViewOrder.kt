package com.sprintique.planning.application

import java.text.Collator
import java.util.Locale

/** Text order as people read it: locale-aware, and numbers inside keys by value (`SPR-2` before `SPR-10`). */
object ViewOrder {
    private val collator: Collator = Collator.getInstance(Locale.ROOT)
    private val CHUNK = Regex("\\d+|\\D+")

    fun text(left: String, right: String): Int = collator.compare(left, right)

    fun natural(left: String, right: String): Int {
        val a = CHUNK.findAll(left).map { it.value }.toList()
        val b = CHUNK.findAll(right).map { it.value }.toList()
        for (index in 0 until minOf(a.size, b.size)) {
            val x = a[index]
            val y = b[index]
            val result = if (x[0].isDigit() && y[0].isDigit()) {
                x.toBigInteger().compareTo(y.toBigInteger())
            } else {
                collator.compare(x, y)
            }
            if (result != 0) return result
        }
        return a.size.compareTo(b.size)
    }
}
