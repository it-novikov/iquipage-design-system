package com.sprintique.database

import org.jooq.DSLContext
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.Types
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime

/**
 * One database transaction. Statements use PostgreSQL positional parameters (`$1`, `$2`) exactly as the reviewed SQL
 * of the previous backend did; values travel as text and PostgreSQL infers their types from use.
 * `dsl` is the jOOQ context bound to the same connection for typed queries.
 */
class Transaction internal constructor(val connection: Connection) {
    val dsl: DSLContext by lazy { DSL.using(connection, SQLDialect.POSTGRES) }

    fun rows(sql: String, vararg parameters: Any?): List<Row> =
        prepare(sql, parameters).use { statement ->
            statement.executeQuery().use(::readRows)
        }

    fun row(sql: String, vararg parameters: Any?): Row? = rows(sql, *parameters).firstOrNull()

    /** Runs a statement that returns no rows or whose rows are not needed; returns the affected row count. */
    fun update(sql: String, vararg parameters: Any?): Int =
        prepare(sql, parameters).use { statement ->
            if (statement.execute()) {
                statement.resultSet.use { result ->
                    var count = 0
                    while (result.next()) count++
                    count
                }
            } else {
                statement.updateCount
            }
        }

    private fun prepare(sql: String, parameters: Array<out Any?>): PreparedStatement {
        val (text, order) = PositionalParameters.rewrite(sql)
        val statement = connection.prepareStatement(text)
        try {
            order.forEachIndexed { index, parameter ->
                require(parameter <= parameters.size) {
                    "SQL refers to \$$parameter but only ${parameters.size} values were given"
                }
                bind(statement, index + 1, parameters[parameter - 1])
            }
        } catch (@Suppress("TooGenericExceptionCaught") error: Throwable) {
            // The statement must not leak, whatever went wrong while binding.
            statement.close()
            throw error
        }
        return statement
    }

    private fun bind(statement: PreparedStatement, index: Int, value: Any?) {
        when (value) {
            null -> statement.setNull(index, Types.VARCHAR)
            is ByteArray -> statement.setBytes(index, value)
            else -> statement.setString(index, TextValues.encode(value))
        }
    }

    private fun readRows(result: ResultSet): List<Row> {
        val metadata = result.metaData
        val columns =
            (1..metadata.columnCount).map { index ->
                metadata.getColumnLabel(index) to
                    metadata.getColumnTypeName(index)
            }
        val rows = mutableListOf<Row>()
        while (result.next()) {
            val values = LinkedHashMap<String, Any?>(columns.size)
            columns.forEachIndexed { offset, (label, type) -> values[label] = readValue(result, offset + 1, type) }
            rows += Row(values)
        }
        return rows
    }

    private fun readValue(result: ResultSet, index: Int, type: String): Any? {
        val value: Any? =
            when (type) {
                "int2", "int4" -> result.getInt(index)

                // Wider numbers keep their exact text, as libpq clients receive them.
                "int8", "numeric" -> result.getString(index)

                "float4", "float8" -> result.getDouble(index)

                "bool" -> result.getBoolean(index)

                "json", "jsonb" -> result.getString(index)?.let(JSON::readTree)

                "timestamptz", "timestamp" -> result.getObject(index, OffsetDateTime::class.java)?.toInstant()

                "date" -> result.getObject(index, LocalDate::class.java)

                "bytea" -> result.getBytes(index)

                else -> if (type.startsWith("_")) readArray(result, index, type) else result.getString(index)
            }
        return if (result.wasNull()) null else value
    }

    private fun readArray(result: ResultSet, index: Int, type: String): List<Any?>? {
        val array = result.getArray(index) ?: return null
        val items = (array.array as Array<*>).toList()
        return when (type) {
            "_int8", "_numeric" -> items.map { it?.toString() }
            "_timestamptz" -> items.map { (it as? java.sql.Timestamp)?.toInstant() }
            else -> items
        }
    }

    private companion object {
        val JSON: ObjectMapper = JsonMapper.builder().build()
    }
}

/** A result row: column labels in select order. Serializes to JSON as an object. */
class Row(private val columns: Map<String, Any?>) : Map<String, Any?> by columns {
    fun string(name: String): String = columns[name] as? String ?: error("Column $name is not text")

    fun stringOrNull(name: String): String? = columns[name] as String?

    fun int(name: String): Int =
        when (val value = columns[name]) {
            is Int -> value
            is String -> value.toInt()
            else -> error("Column $name is not an integer")
        }

    fun long(name: String): Long =
        when (val value = columns[name]) {
            is Number -> value.toLong()
            is String -> value.toLong()
            else -> error("Column $name is not a number")
        }

    fun double(name: String): Double =
        when (val value = columns[name]) {
            is Number -> value.toDouble()
            is String -> value.toDouble()
            else -> error("Column $name is not a number")
        }

    fun boolean(name: String): Boolean = columns[name] as? Boolean ?: error("Column $name is not a boolean")

    fun instant(name: String): Instant = columns[name] as? Instant ?: error("Column $name is not a timestamp")

    fun instantOrNull(name: String): Instant? = columns[name] as Instant?

    fun json(name: String): JsonNode? = columns[name] as JsonNode?

    @Suppress("UNCHECKED_CAST")
    fun strings(name: String): List<String> = columns[name] as? List<String> ?: emptyList()

    /** A copy without some columns, for internal fields that must not reach the response. */
    fun without(vararg names: String): Row = Row(columns.filterKeys { it !in names })

    /** A copy with extra or replaced columns. */
    fun with(
        vararg pairs: Pair<String, Any?>,
    ): Row = Row(LinkedHashMap(columns).apply { pairs.forEach { (key, value) -> put(key, value) } })

    override fun toString(): String = columns.toString()
}

/** Text encoding of parameter values, matching what the previous backend's driver sent. */
internal object TextValues {
    private val MAPPER: ObjectMapper = JsonMapper.builder().build()
    private const val LARGEST_EXACT_DOUBLE = 1e15

    fun encode(value: Any): String = when (value) {
        is String -> value
        is Boolean, is Int, is Long, is Short, is Enum<*> -> value.toString()
        is Double -> encodeDouble(value)
        is Float -> encodeDouble(value.toDouble())
        is BigDecimal -> value.toPlainString()
        is Instant -> value.toString()
        is Collection<*> -> arrayLiteral(value)
        is Array<*> -> arrayLiteral(value.toList())
        else -> MAPPER.writeValueAsString(value)
    }

    /** Whole numbers are written without a fraction, so an integer column accepts them. */
    private fun encodeDouble(value: Double): String =
        if (value % 1.0 == 0.0 &&
            kotlin.math.abs(value) < LARGEST_EXACT_DOUBLE
        ) {
            value.toLong().toString()
        } else {
            value.toString()
        }

    private fun arrayLiteral(items: Collection<*>): String = items.joinToString(",", "{", "}") { item ->
        when (item) {
            null -> "NULL"
            is Collection<*> -> arrayLiteral(item)
            else -> "\"" + encode(item).replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        }
    }
}
