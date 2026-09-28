package com.sprintique.apidoc

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.sprintique.contract.Accepts
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import io.swagger.v3.oas.annotations.media.Schema
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.SoftAssertions
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import kotlin.reflect.KClass
import kotlin.reflect.full.primaryConstructor

/**
 * Every request contract of the Kotlin server has exactly the fields of the Zod schema of the same name, which the
 * web client validates with. Polymorphic contracts are compared per discriminator value.
 */
class ContractParityTest {
    private val schemas: JsonNode = JsonMapper.builder().build()
        .readTree(ContractParityTest::class.java.getResourceAsStream("/contracts/public-schemas.json"))
        .path("schemas")

    private val contracts: List<KClass<*>> = ClassFileImporter()
        .withImportOption(ImportOption.DoNotIncludeTests())
        .importPackages("com.sprintique")
        .flatMap { it.methods }
        .filter { it.isAnnotatedWith(Accepts::class.java) }
        .map { it.getAnnotationOfType(Accepts::class.java).value }
        .distinct()

    @Test
    fun `every request contract matches its Zod schema field for field`() {
        assertThat(contracts).hasSizeGreaterThan(MINIMUM_CONTRACTS)
        val soft = SoftAssertions()
        for (contract in contracts) {
            val name = contract.java.getAnnotation(Schema::class.java)?.name ?: contract.java.simpleName
            val zod = schemas.path(name)
            soft.assertThat(zod.isMissingNode).`as`("$name is a public schema").isFalse()
            if (!zod.isMissingNode) compare(contract, zod, name, soft)
        }
        soft.assertAll()
    }

    private fun compare(
        type: KClass<*>,
        zod: JsonNode,
        path: String,
        soft: SoftAssertions,
        discriminator: String? = null,
    ) {
        val subtypes = type.java.getAnnotation(JsonSubTypes::class.java)
        if (subtypes != null) {
            val property = type.java.getAnnotation(JsonTypeInfo::class.java).property
            val variants = (zod.path("anyOf").values() + zod.path("oneOf").values()).toList()
            for (subtype in subtypes.value) {
                val names = subtype.names.toList().ifEmpty { listOf(subtype.name) }
                for (name in names) {
                    val variant = variants.firstOrNull { tags(it.path("properties").path(property)).contains(name) }
                    soft.assertThat(variant).`as`("$path has the variant $property=$name").isNotNull()
                    if (variant != null) compare(subtype.value, variant, "$path[$name]", soft, property)
                }
            }
            return
        }
        val kotlin = type.primaryConstructor?.parameters?.mapNotNull { it.name }?.toSet().orEmpty()
        // A field declared `never` is one the request must not carry; Kotlin refuses it as an unknown field.
        val zodFields = objectOf(zod)?.path("properties")?.properties().orEmpty()
            .filterNot { (_, schema) -> schema.has("not") && schema.path("not").isEmpty }
            .map { it.key }
            .toSet() - setOfNotNull(discriminator)
        soft.assertThat(kotlin).`as`("fields of $path").containsExactlyInAnyOrderElementsOf(zodFields)
    }

    /** The object schema of a node that may be wrapped as nullable (`anyOf` with `null`). */
    private fun objectOf(node: JsonNode): JsonNode? = when {
        node.has("properties") -> node
        node.has("anyOf") -> node.path("anyOf").values().firstOrNull { it.has("properties") }
        node.path("type").asString() == "object" -> node
        else -> null
    }

    private fun tags(node: JsonNode): Set<String> = buildSet {
        if (node.has("const")) add(node.path("const").asString())
        node.path("enum").values().forEach { add(it.asString()) }
    }

    private companion object {
        const val MINIMUM_CONTRACTS = 40
    }
}
