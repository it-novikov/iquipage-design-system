package com.sprintique.map.contract

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonValue
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.contract.RESOURCE_ID
import com.sprintique.contract.TrimmedString
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import tools.jackson.databind.annotation.JsonDeserialize

/*
 * The JSON contract of idea maps: a whiteboard document of objects and connections, the map around it, and templates.
 * Optional fields left out stay out of the stored document.
 */

private const val COORDINATE = "100000"
private const val SIZE_LIMIT = "10000"
private const val PANEL_LIMIT = "4000"

enum class MapObjectType(@get:JsonValue val wire: String) {
    STICKY("sticky"),
    TEXT("text"),
    SHAPE("shape"),
    FRAME("frame"),
    TASK("task"),
    IMAGE("image"),
    DRAWING("drawing"),
}

enum class MapColor(@get:JsonValue val wire: String) {
    SAND("sand"),
    LAVENDER("lavender"),
    MINT("mint"),
    SKY("sky"),
    ROSE("rose"),
    NEUTRAL("neutral"),
}

enum class HorizontalAlign(@get:JsonValue val wire: String) { LEFT("left"), CENTER("center"), RIGHT("right") }

enum class VerticalAlign(@get:JsonValue val wire: String) { TOP("top"), MIDDLE("middle"), BOTTOM("bottom") }

enum class ColumnLayout(@get:JsonValue val wire: String) { COLUMN("column") }

enum class MapShape(@get:JsonValue val wire: String) {
    RECTANGLE("rectangle"),
    DIAMOND("diamond"),
    PILL("pill"),
    ELLIPSE("ellipse"),
    PARALLELOGRAM("parallelogram"),
    DATABASE("database"),
    DOCUMENT("document"),
    PREDEFINED("predefined"),
    MANUAL("manual"),
    TRAPEZOID("trapezoid"),
    HEXAGON("hexagon"),
    DELAY("delay"),
    CONNECTOR("connector"),
    OFFPAGE("offpage"),
}

@Schema(name = "MapObject")
@JsonInclude(JsonInclude.Include.NON_NULL)
data class MapObjectContract(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    val type: MapObjectType,
    @field:Size(max = 10_000) val text: String,
    @field:DecimalMin("-$COORDINATE") @field:DecimalMax(COORDINATE) val x: Double,
    @field:DecimalMin("-$COORDINATE") @field:DecimalMax(COORDINATE) val y: Double,
    @field:DecimalMin("40") @field:DecimalMax(SIZE_LIMIT) val width: Double,
    @field:DecimalMin("32") @field:DecimalMax(SIZE_LIMIT) val height: Double,
    val color: MapColor = MapColor.SAND,
    @field:Pattern(regexp = RESOURCE_ID) val parentId: String? = null,
    val locked: Boolean? = null,
    @field:Size(max = 100) val author: String? = null,
    val align: HorizontalAlign? = null,
    val valign: VerticalAlign? = null,
    val autoHeight: Boolean? = null,
    @field:DecimalMin("32") @field:DecimalMax(PANEL_LIMIT) val minHeight: Double? = null,
    @field:DecimalMin("56") @field:DecimalMax(PANEL_LIMIT) val headerHeight: Double? = null,
    @field:DecimalMin("24") @field:DecimalMax(PANEL_LIMIT) val captionHeight: Double? = null,
    val layout: ColumnLayout? = null,
    val shape: MapShape? = null,
    @field:Pattern(regexp = RESOURCE_ID) val assetId: String? = null,
    /** A freehand line: 2–4000 points inside the drawing's own 0–10 000 box. */
    @field:Size(min = 2, max = 4000) val points: List<List<Double>>? = null,
    val done: Boolean? = null,
    @field:Size(max = 100) val owner: String? = null,
    @field:Pattern(regexp = RESOURCE_ID) val externalTaskId: String? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isConsistent: Boolean
        get() = (type == MapObjectType.IMAGE) == (assetId != null) &&
            (externalTaskId == null || type == MapObjectType.TASK) &&
            (type != MapObjectType.DRAWING || points != null) &&
            points.orEmpty().all { it.size == 2 && it.all { value -> value.isFinite() && value in 0.0..POINT_LIMIT } }

    private companion object {
        const val POINT_LIMIT = 10_000.0
    }
}

enum class ConnectionStyle(@get:JsonValue val wire: String) { CURVE("curve"), STRAIGHT("straight"), ELBOW("elbow") }

enum class Port(@get:JsonValue val wire: String) {
    AUTO("auto"),
    TOP("top"),
    RIGHT("right"),
    BOTTOM("bottom"),
    LEFT("left"),
}

enum class ConnectionColor(@get:JsonValue val wire: String) {
    NEUTRAL("neutral"),
    ACCENT("accent"),
    SUCCESS("success"),
    WARNING("warning"),
    ERROR("error"),
}

@Schema(name = "MapConnection")
@JsonInclude(JsonInclude.Include.NON_NULL)
data class MapConnectionContract(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Pattern(regexp = RESOURCE_ID) val from: String,
    @field:Pattern(regexp = RESOURCE_ID) val to: String,
    @field:Size(max = 240) val label: String? = null,
    val style: ConnectionStyle? = null,
    val arrow: Boolean? = null,
    val arrowStart: Boolean? = null,
    val fromPort: Port? = null,
    val toPort: Port? = null,
    val dashed: Boolean? = null,
    val color: ConnectionColor? = null,
    @field:DecimalMin("0") @field:DecimalMax("1") val labelPosition: Double? = null,
    @field:DecimalMin("-$COORDINATE") @field:DecimalMax(COORDINATE) val bend: Double? = null,
)

@Schema(name = "MapDocument")
data class MapDocumentContract(
    @field:Pattern(regexp = "^iquipage\\.whiteboard/1$") val schema: String,
    @field:Size(max = 160) val title: String,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val revision: Long,
    @field:Size(max = 600) val objects: List<@Valid MapObjectContract>,
    @field:Size(max = 1600) val connections: List<@Valid MapConnectionContract>,
) {
    /** Unique ids, bounded images, frames only as parents without cycles, connections between two objects. */
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isConsistent: Boolean get() = MapRules.valid(this)
}

/** The whole-document rules of a map. */
object MapRules {
    /**
     * Images count as objects before de-duplication: repeating one asset still costs every viewer a load. Parallel
     * edges are bounded because routing is per connection.
     */
    const val IMAGE_LIMIT = 40
    const val PAIR_CONNECTIONS = 16

    fun valid(document: MapDocumentContract): Boolean {
        val byId = document.objects.associateBy(MapObjectContract::id)
        if (byId.size != document.objects.size) return false
        if (document.objects.count { it.type == MapObjectType.IMAGE } > IMAGE_LIMIT) return false
        if (!document.objects.all { framed(it, byId) }) return false
        return connectionsValid(document.connections, byId)
    }

    private fun framed(item: MapObjectContract, byId: Map<String, MapObjectContract>): Boolean {
        val seen = hashSetOf(item.id)
        var current = item
        while (true) {
            val parentId = current.parentId ?: return true
            val parent = byId[parentId]
            if (parent == null || parent.type != MapObjectType.FRAME || !seen.add(parent.id)) return false
            current = parent
        }
    }

    private fun connectionsValid(
        connections: List<MapConnectionContract>,
        objects: Map<String, MapObjectContract>,
    ): Boolean {
        val ids = HashSet(objects.keys)
        val geometry = HashSet<String>()
        val pairs = HashMap<String, Int>()
        for (edge in connections) {
            val linksTwoObjects = edge.from in objects && edge.to in objects && edge.from != edge.to
            if (!ids.add(edge.id) || !linksTwoObjects) return false
            val shape = listOf(
                edge.from,
                edge.to,
                edge.fromPort?.wire ?: "auto",
                edge.toPort?.wire ?: "auto",
                edge.style?.wire ?: "curve",
                number(edge.bend ?: 0.0),
            ).joinToString("|")
            if (!geometry.add(shape)) return false
            val pair = if (edge.from < edge.to) "${edge.from}|${edge.to}" else "${edge.to}|${edge.from}"
            if (pairs.merge(pair, 1, Int::plus)!! > PAIR_CONNECTIONS) return false
        }
        return true
    }

    /** A number as JavaScript prints it, so equal geometries compare equal. */
    private fun number(value: Double) = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
}

enum class MapKind(@get:JsonValue val wire: String) { PERMANENT("permanent"), SESSION("session") }

enum class MapStatus(@get:JsonValue val wire: String) {
    DRAFT("draft"),
    ACTIVE("active"),
    PAUSED("paused"),
    ARCHIVED("archived"),
}

enum class SessionPhase(@get:JsonValue val wire: String) {
    COLLECT("collect"),
    DISCUSS("discuss"),
    VOTE("vote"),
    OUTCOMES("outcomes"),
}

@Schema(name = "MapSession")
data class MapSessionContract(val phase: SessionPhase, @field:Min(1) @field:Max(100) val voteLimit: Int)

@Schema(name = "TemplateOrigin")
data class TemplateOriginContract(
    @field:Pattern(regexp = RESOURCE_ID) val id: String,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val version: Long,
)

@Schema(name = "MapInput")
data class MapInputContract(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 160)
    val title: String,
    val kind: MapKind,
    val status: MapStatus,
    @field:Valid val document: MapDocumentContract,
    @field:Size(max = 50_000) val summary: String = "",
    @field:Valid val session: MapSessionContract? = null,
    /** Executable workflows are a separate, versioned command contract, never arbitrary map JSON. */
    val flow: Any? = null,
    @field:Valid val templateOrigin: TemplateOriginContract? = null,
    @field:Pattern(regexp = RESOURCE_ID) val sourceMapId: String? = null,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val sourceRevision: Long? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isConsistent: Boolean get() = flow == null && (kind == MapKind.SESSION) == (session != null)
}

@Schema(name = "MapTimer")
data class MapTimerContract(@field:Min(0) @field:Max(14_400) val remaining: Int, val running: Boolean)

@Schema(name = "PutMap")
data class PutMapRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Valid val value: MapInputContract,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val votes: Map<String, Int>? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    @field:Valid val timer: MapTimerContract? = null,
) {
    @get:JsonIgnore
    @get:Schema(hidden = true)
    @get:AssertTrue
    val isVotesValid: Boolean
        get() = votes == null || (
            votes.size <= VOTE_KEYS && votes.all { (id, count) -> ID.matches(id) && count in 0..MAX_VOTES }
            )

    private companion object {
        val ID = Regex(RESOURCE_ID)
        const val VOTE_KEYS = 2000
        const val MAX_VOTES = 100
    }
}

enum class TemplateScope(@get:JsonValue val wire: String) {
    PERSONAL("personal"),
    PROJECT("project"),
    WORKSPACE("workspace"),
}

@Schema(name = "MapTemplateInput")
data class MapTemplateInputContract(
    @field:JsonDeserialize(using = TrimmedString::class)
    @field:Size(min = 1, max = 160)
    val title: String,
    @field:Size(max = 3000) val description: String = "",
    @field:Size(max = 3000) val `when`: String = "",
    val scope: TemplateScope,
    val kind: MapKind,
    @field:Valid val document: MapDocumentContract,
    @field:Pattern(regexp = RESOURCE_ID) val sourceMapId: String? = null,
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val sourceRevision: Long? = null,
)

@Schema(name = "PutMapTemplate")
data class PutMapTemplateRequest(
    @field:Min(0) @field:Max(MAX_SAFE_INTEGER) val baseRevision: Long,
    @field:Valid val value: MapTemplateInputContract,
)
