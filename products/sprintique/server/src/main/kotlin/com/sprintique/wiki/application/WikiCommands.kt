package com.sprintique.wiki.application

import com.sprintique.command.AuditTrail
import com.sprintique.command.CommandLedger
import com.sprintique.contract.MAX_SAFE_INTEGER
import com.sprintique.database.Row
import com.sprintique.database.Transaction
import com.sprintique.identity.application.ProjectAccess
import com.sprintique.identity.domain.Actor
import com.sprintique.identity.domain.Capability
import com.sprintique.planning.application.PlanningStates
import com.sprintique.problem.requireCondition
import com.sprintique.problem.requirePresent
import com.sprintique.wiki.contract.PutWikiPageRequest
import com.sprintique.wiki.contract.RestoreWikiVersionRequest
import com.sprintique.wiki.contract.WikiPageInputRequest
import com.sprintique.wiki.domain.WikiNode
import com.sprintique.wiki.domain.WikiTree

object WikiCommands {
    @Suppress("LongParameterList")
    fun put(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        input: PutWikiPageRequest,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        return ledger.idempotent(tx, actor, projectId, "wiki-page.put:$id", key, input) {
            val before = WikiReads.stored(tx, projectId, id)
            checkRevision(before, input.baseRevision)
            requireCondition(
                before != null || !input.value.archived,
                422, "WIKI_ARCHIVED", "Нельзя создать страницу сразу в архиве.",
            )
            if (before?.get("archivedAt") != null && input.value.archived) {
                requireCondition(
                    before.string("title") == input.value.title && before.string("body") == input.value.body &&
                        before.stringOrNull("parentId") == input.value.parentId,
                    409, "WIKI_ARCHIVED", "Сначала восстановите страницу из архива.",
                )
            }
            checkTree(tx, projectId, id, input.value)
            save(tx, actor, projectId, id, input.baseRevision + 1, input.value)
        }
    }

    @Suppress("LongParameterList")
    fun restore(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        input: RestoreWikiVersionRequest,
        key: String,
        ledger: CommandLedger,
    ): Any {
        PlanningStates.lock(tx, actor, projectId, write = true)
        ProjectAccess.authorize(tx, actor, projectId, Capability.TASKS_READ)
        return ledger.idempotent(tx, actor, projectId, "wiki-page.restore:$id", key, input) {
            val before = requirePresent(
                WikiReads.stored(tx, projectId, id), 404, "NOT_FOUND", "Страница недоступна.",
            )
            checkRevision(before, input.baseRevision)
            requireCondition(
                before["archivedAt"] == null, 409, "WIKI_ARCHIVED", "Сначала восстановите страницу из архива.",
            )
            val version = WikiReads.version(tx, actor, projectId, id, input.version)
            val value = WikiPageInputRequest(
                version.string("title"), version.string("body"), before.stringOrNull("parentId"), false,
            )
            save(tx, actor, projectId, id, input.baseRevision + 1, value)
        }
    }

    private fun checkRevision(before: Row?, revision: Long) {
        requireCondition(
            (before?.long("revision") ?: 0L) == revision,
            409, "CONFLICT", "Страница уже изменена. Ваш текст не перезаписан.",
        )
        requireCondition(revision < MAX_SAFE_INTEGER, 422, "REVISION_LIMIT", "Достигнут предел ревизий страницы.")
    }

    private fun checkTree(tx: Transaction, projectId: String, id: String, value: WikiPageInputRequest) {
        val rows = tx.rows(
            """SELECT id,parent_id AS parent,archived_at IS NOT NULL AS archived
                FROM app.wiki_page WHERE project_id=$1 LIMIT $2""",
            projectId, WikiTree.LIMIT + 1,
        )
        requireCondition(rows.size <= WikiTree.LIMIT, 422, "WIKI_LIMIT", "Превышен лимит страниц проекта.")
        val nodes = rows.filter { it.string("id") != id }.map {
            WikiNode(it.string("id"), it.stringOrNull("parent"), it.boolean("archived"))
        } + WikiNode(id, value.parentId, value.archived)
        WikiTree.check(nodes, id)
    }

    @Suppress("LongParameterList")
    private fun save(
        tx: Transaction,
        actor: Actor,
        projectId: String,
        id: String,
        revision: Long,
        value: WikiPageInputRequest,
    ): Any {
        tx.update(
            """INSERT INTO app.wiki_page(project_id,id,title,body,parent_id,revision,archived_at,updated_by)
                VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN clock_timestamp() ELSE NULL END,$8)
                ON CONFLICT(project_id,id) DO UPDATE SET title=$3,body=$4,parent_id=$5,revision=$6,
                    archived_at=CASE WHEN $7 THEN coalesce(app.wiki_page.archived_at,clock_timestamp()) ELSE NULL END,
                    updated_at=clock_timestamp(),updated_by=$8""",
            projectId, id, value.title, value.body, value.parentId, revision, value.archived, actor.id,
        )
        tx.update(
            "INSERT INTO app.wiki_version(project_id,page_id,revision,title,body,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
            projectId, id, revision, value.title, value.body, actor.id,
        )
        AuditTrail.record(tx, actor, projectId, "wiki-page.updated", id, revision)
        val row = WikiReads.stored(tx, projectId, id)!!
        return if (actor.mayRead(Capability.TASKS_READ)) {
            row
        } else {
            mapOf(
                "receipt" to "wiki-page", "id" to id, "projectId" to projectId,
                "revision" to revision, "updatedAt" to row["updatedAt"],
            )
        }
    }
}
