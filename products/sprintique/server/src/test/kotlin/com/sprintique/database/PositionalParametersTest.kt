package com.sprintique.database

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class PositionalParametersTest {
    @Test
    fun `parameters become placeholders in order and a repeated one is bound again`() {
        val (sql, order) = PositionalParameters.rewrite("SELECT \$2, \$1 WHERE a = \$2")
        assertThat(sql).isEqualTo("SELECT ?, ? WHERE a = ?")
        assertThat(order).containsExactly(2, 1, 2)
    }

    @Test
    fun `literals, quoted names, dollar quotes and comments are left alone`() {
        val text = "SELECT '\$1 it''s', \"\$2\", \$tag\$ \$3 \$tag\$, \$\$ \$4 \$\$ -- \$5\n/* \$6 */ , \$7"
        val (sql, order) = PositionalParameters.rewrite(text)
        assertThat(order).containsExactly(7)
        assertThat(sql).endsWith(", ?")
    }

    @Test
    fun `a bare question mark is refused because the driver would bind it`() {
        assertThatThrownBy {
            PositionalParameters.rewrite("SELECT data ? 'key'")
        }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `values are encoded as text the database can infer`() {
        assertThat(TextValues.encode(1024.0)).isEqualTo("1024")
        assertThat(TextValues.encode(1.5)).isEqualTo("1.5")
        assertThat(TextValues.encode(listOf("a", null, "b\"c"))).isEqualTo("{\"a\",NULL,\"b\\\"c\"}")
        assertThat(TextValues.encode(mapOf("k" to 1))).isEqualTo("{\"k\":1}")
    }
}
