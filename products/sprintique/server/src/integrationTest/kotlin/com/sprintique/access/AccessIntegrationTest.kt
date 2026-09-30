package com.sprintique.access

import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.database.IntegrationDatabase
import com.sprintique.database.Transaction
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.random.Random

/**
 * The permission rules the database keeps (docs/access/access-and-invitations.md, 7.2): the compilation equals the
 * application's, every write of a membership is compiled, guests and principals that are not people are held to
 * their limits, one owner per workspace, and `auth.can` decides finance under the runtime role.
 */
class AccessIntegrationTest {
    private val suffix = UUID.randomUUID().toString().take(8)
    private val owner = "access-owner-$suffix"
    private val reader = "access-reader-$suffix"
    private val guest = "access-guest-$suffix"
    private val editor = "access-editor-$suffix"
    private val agent = "access-agent-$suffix"
    private val project = "access-$suffix"
    private val workspace = UUID.randomUUID().toString()

    init {
        IntegrationDatabase.admin.transaction { tx ->
            val principals = listOf(
                owner to "human",
                reader to "human",
                guest to "human",
                editor to "human",
                agent to "agent",
            )
            for ((id, kind) in principals) {
                tx.update(
                    """
                    INSERT INTO auth.principals(id, kind, name, issuer, subject)
                    VALUES ($1, $2, $1, CASE WHEN $2 = 'human' THEN 'https://test.example' END, CASE WHEN $2 = 'human' THEN $1 END)
                    """.trimIndent(),
                    id,
                    kind,
                )
            }
            tx.update(
                "INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, 'Доступ', $2)",
                workspace,
                owner,
            )
            tx.update(
                """
                INSERT INTO app.projects(id, workspace_id, name, slug, key) VALUES ($1, $2::uuid, 'Проект', $1, 'ACC')
                """.trimIndent(),
                project,
                workspace,
            )
            for ((id, role) in listOf(owner to "owner", reader to "member", guest to "guest", editor to "member")) {
                tx.update(
                    "INSERT INTO app.workspace_members(workspace_id, principal_id, role) VALUES ($1::uuid, $2, $3)",
                    workspace,
                    id,
                    role,
                )
            }
            val roles = listOf(
                owner to "admin",
                reader to "reader",
                guest to "reader",
                editor to "editor",
                agent to "editor",
            )
            for ((id, role) in roles) {
                tx.update(
                    "INSERT INTO app.project_members(project_id, principal_id, role) VALUES ($1, $2, $3)",
                    project,
                    id,
                    role,
                )
            }
        }
    }

    @Test
    fun `the database compiles permissions exactly like the application`() {
        val random = Random(42)
        val catalog = Permission.PROJECT
        val cases = buildList {
            for (preset in SystemPreset.entries) {
                add(Triple(preset.defaults, emptySet<Permission>(), emptySet<Permission>()))
                catalog.forEach { add(Triple(preset.defaults, setOf(it), emptySet())) }
                catalog.forEach { add(Triple(preset.defaults, emptySet(), setOf(it))) }
            }
            repeat(RANDOM_CASES) {
                val pick = { catalog.filter { random.nextInt(4) == 0 }.toSet() }
                add(Triple(pick(), pick(), pick()))
            }
        }
        val forbidden = listOf(emptySet(), Permissions.GUEST_FORBIDDEN, Permissions.NEVER_SERVICE)
        IntegrationDatabase.runtime.transaction { tx ->
            for ((base, granted, revoked) in cases) {
                for (limit in forbidden) {
                    val sql = tx.row(
                        "SELECT auth.compile_permissions($1::text[], $2::text[], $3::text[], $4::text[]) AS p",
                        base.map(Permission::wire),
                        granted.map(Permission::wire),
                        revoked.map(Permission::wire),
                        limit.map(Permission::wire),
                    )!!.strings("p")
                    val kotlin = Permissions.compile(base, granted, revoked, limit).map(Permission::wire)
                    val case = "base=$base granted=$granted revoked=$revoked forbidden=$limit"
                    assertThat(sql).`as`(case).isEqualTo(kotlin)
                }
            }
        }
    }

    @Test
    fun `memberships are compiled on every write, with guests, agents and presets of other workspaces held back`() {
        val rows = IntegrationDatabase.admin.transaction { tx ->
            tx.rows(
                "SELECT principal_id AS id, role, permissions FROM app.project_members WHERE project_id = $1",
                project,
            )
                .associateBy { it.string("id") }
        }
        assertThat(rows.getValue(owner).strings("permissions"))
            .containsExactlyElementsOf(Permission.PROJECT.map(Permission::wire))
        assertThat(rows.getValue(reader).strings("permissions"))
            .containsExactly("tasks.read", "threads.write", "maps.read", "finance.read")
        assertThat(rows.getValue(agent).strings("permissions"))
            .containsExactly("tasks.read", "tasks.write", "threads.write", "maps.read")
        assertThat(rows.getValue(agent).string("role")).isEqualTo("editor")
        IntegrationDatabase.admin.transaction { tx ->
            val admin = presetId(tx, "admin")
            // A guest given the administrator preset still cannot manage access; the derived role follows.
            tx.update(
                "UPDATE app.project_members SET preset_id = $3::uuid WHERE project_id = $1 AND principal_id = $2",
                project,
                guest,
                admin,
            )
            val compiled = tx.row(
                "SELECT role, permissions FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
                project,
                guest,
            )!!
            assertThat(compiled.strings("permissions")).doesNotContain("project.access").contains("members.manage")
            assertThat(compiled.string("role")).isEqualTo("editor")
            // An agent never holds a decision or the access of people, and finance only when added.
            tx.update(
                """
                UPDATE app.project_members SET preset_id = $3::uuid, granted = '{finance.read}' WHERE project_id = $1 AND principal_id = $2
                """.trimIndent(),
                project,
                agent,
                admin,
            )
            val bounded = tx.row(
                "SELECT permissions FROM app.project_members WHERE project_id = $1 AND principal_id = $2",
                project,
                agent,
            )!!.strings("permissions")
            assertThat(bounded).contains("finance.read", "maps.write")
                .doesNotContain("approvals.decide", "members.invite", "project.access")
        }
        val other = UUID.randomUUID().toString()
        assertThatThrownBy {
            IntegrationDatabase.admin.transaction { tx ->
                tx.update(
                    "INSERT INTO app.workspaces(id, name, created_by) VALUES ($1::uuid, 'Чужое', $2)",
                    other,
                    owner,
                )
                val foreign = tx.row(
                    "SELECT id FROM app.access_presets WHERE workspace_id = $1::uuid AND key = 'editor'",
                    other,
                )!!.string("id")
                tx.update(
                    "UPDATE app.project_members SET preset_id = $3::uuid WHERE project_id = $1 AND principal_id = $2",
                    project,
                    editor,
                    foreign,
                )
            }
        }.hasMessageContaining("another workspace")
    }

    @Test
    fun `a workspace has one owner and roles compile to workspace permissions`() {
        val members = IntegrationDatabase.admin.transaction { tx ->
            tx.rows(
                "SELECT principal_id AS id, permissions FROM app.workspace_members WHERE workspace_id = $1::uuid",
                workspace,
            )
                .associate { it.string("id") to it.strings("permissions") }
        }
        assertThat(members.getValue(owner)).containsExactlyElementsOf(Permission.WORKSPACE.map(Permission::wire))
        assertThat(members.getValue(reader)).isEmpty()
        assertThatThrownBy {
            IntegrationDatabase.admin.transaction { tx ->
                tx.update(
                    """
                    UPDATE app.workspace_members SET role = 'owner' WHERE workspace_id = $1::uuid AND principal_id = $2
                    """.trimIndent(),
                    workspace,
                    reader,
                )
            }
        }.hasMessageContaining("workspace_one_owner")
        assertThatThrownBy {
            IntegrationDatabase.admin.transaction { tx ->
                tx.update(
                    """
                    UPDATE app.workspace_members SET granted = '{workspace.invite}' WHERE workspace_id = $1::uuid AND principal_id = $2
                    """.trimIndent(),
                    workspace,
                    guest,
                )
            }
        }.hasMessageContaining("workspace_member_permissions")
    }

    @Test
    fun `auth can decides finance under the runtime role`() {
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                INSERT INTO app.finance_entry(project_id, id, direction, state, amount_minor, currency_code, posted_date, category,
                  description, revision, created_by, updated_by)
                VALUES ($1, 'visible', 'income', 'posted', 100, 'RUB', '2026-09-30', 'Оплата', 'Счёт', 1, $2, $2)
                """.trimIndent(),
                project,
                owner,
            )
        }
        val count = "SELECT count(*)::int AS n FROM app.finance_entry WHERE project_id = $1"
        assertThat(asActor(reader) { it.row(count, project)!!.int("n") }).isEqualTo(1)
        assertThat(asActor(guest) { it.row(count, project)!!.int("n") }).isZero()
        assertThat(can(owner, "finance.write")).isTrue()
        assertThat(can(editor, "finance.write")).isFalse()
        // A personal addition is what row security reads.
        IntegrationDatabase.admin.transaction { tx ->
            tx.update(
                """
                UPDATE app.project_members SET granted = '{finance.write}' WHERE project_id = $1 AND principal_id = $2
                """.trimIndent(),
                project,
                editor,
            )
        }
        assertThat(can(editor, "finance.write")).isTrue()
        assertThat(
            asActor(editor) {
                it.update("UPDATE app.finance_entry SET description = 'x' WHERE project_id = $1 AND false", project)
            },
        ).isZero()
    }

    private fun can(actor: String, permission: String): Boolean =
        asActor(actor) { it.row("SELECT auth.can($1, $2) AS can", project, permission)!!.boolean("can") }

    private fun presetId(tx: Transaction, key: String): String =
        tx.row(
            "SELECT id FROM app.access_presets WHERE workspace_id = $1::uuid AND key = $2",
            workspace,
            key,
        )!!.string("id")

    private fun <T> asActor(
        actor: String,
        block: (Transaction) -> T,
    ): T = IntegrationDatabase.runtime.transaction { tx ->
        tx.row("SELECT set_config('app.actor_id', $1, true)", actor)
        block(tx)
    }

    private companion object {
        const val RANDOM_CASES = 300
    }
}
