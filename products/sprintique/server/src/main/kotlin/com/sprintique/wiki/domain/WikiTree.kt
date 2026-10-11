package com.sprintique.wiki.domain

import com.sprintique.problem.requireCondition

data class WikiNode(val id: String, val parentId: String?, val archived: Boolean)

/** Validate the complete bounded tree, including descendants affected by a move. */
object WikiTree {
    const val LIMIT = 1000
    const val DEPTH = 12

    fun check(nodes: List<WikiNode>, changedId: String) {
        requireCondition(nodes.size <= LIMIT, 422, "WIKI_LIMIT", "В проекте уже 1000 страниц.")
        val indexed = nodes.associateBy { it.id }
        val changed = indexed.getValue(changedId)
        if (changed.archived) {
            requireCondition(
                nodes.none { it.parentId == changedId && !it.archived },
                409, "WIKI_CHILDREN", "Сначала перенесите или архивируйте дочерние страницы.",
            )
        } else {
            requireCondition(
                changed.parentId == null || indexed[changed.parentId]?.archived == false,
                422, "WIKI_PARENT", "Выберите доступную страницу вне архива.",
            )
        }
        for (node in nodes) {
            var current: WikiNode? = node
            val seen = mutableSetOf<String>()
            while (current != null) {
                requireCondition(seen.add(current.id), 422, "WIKI_CYCLE", "Страница не может содержать саму себя.")
                requireCondition(seen.size <= DEPTH, 422, "WIKI_DEPTH", "Допустимо не более 12 уровней страниц.")
                val parentId = current.parentId
                current = parentId?.let { indexed[it] }
                requireCondition(
                    parentId == null || current != null, 422, "WIKI_PARENT", "Родительская страница недоступна.",
                )
            }
        }
    }
}
