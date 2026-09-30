package com.sprintique.access

import com.sprintique.access.domain.Permission
import com.sprintique.access.domain.Permission.APPROVALS_DECIDE
import com.sprintique.access.domain.Permission.FINANCE_READ
import com.sprintique.access.domain.Permission.FINANCE_WRITE
import com.sprintique.access.domain.Permission.MAPS_READ
import com.sprintique.access.domain.Permission.MAPS_WRITE
import com.sprintique.access.domain.Permission.MEMBERS_INVITE
import com.sprintique.access.domain.Permission.MEMBERS_MANAGE
import com.sprintique.access.domain.Permission.PROJECT_ACCESS
import com.sprintique.access.domain.Permission.PROJECT_SETTINGS
import com.sprintique.access.domain.Permission.RELEASES_MANAGE
import com.sprintique.access.domain.Permission.TASKS_READ
import com.sprintique.access.domain.Permission.TASKS_WRITE
import com.sprintique.access.domain.Permission.THREADS_WRITE
import com.sprintique.access.domain.Permission.WORKSPACE_INVITE
import com.sprintique.access.domain.Permission.WORKSPACE_PEOPLE
import com.sprintique.access.domain.PermissionScope
import com.sprintique.access.domain.Permissions
import com.sprintique.access.domain.SystemPreset
import com.sprintique.access.domain.WorkspaceRole
import com.sprintique.identity.domain.Capability
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/** The permission rules of docs/access/access-and-invitations.md, sections 3.1–3.4 (PR01, PR10). */
class PermissionsTest {
    @Test
    fun `the catalog has fourteen project and five workspace permissions with acyclic dependencies in scope`() {
        assertThat(Permission.PROJECT).hasSize(14)
        assertThat(Permission.WORKSPACE).hasSize(5)
        for (permission in Permission.entries) {
            assertThat(permission.includes).allMatch { it.scope == permission.scope && it != permission }
            assertThat(Permissions.closure(permission.includes)).doesNotContain(permission)
        }
        // Every project permission reaches «Видеть задачи»: membership itself.
        assertThat(Permission.PROJECT).allMatch { TASKS_READ in Permissions.closure(listOf(it)) }
    }

    @Test
    fun `closure adds what a permission includes, in catalog order`() {
        assertThat(Permissions.closure(listOf(RELEASES_MANAGE)))
            .containsExactly(TASKS_READ, TASKS_WRITE, RELEASES_MANAGE)
        assertThat(Permissions.closure(listOf(PROJECT_ACCESS)))
            .containsExactly(TASKS_READ, MEMBERS_INVITE, MEMBERS_MANAGE, PROJECT_SETTINGS, PROJECT_ACCESS)
        assertThat(Permissions.closure(listOf(WORKSPACE_PEOPLE))).containsExactly(WORKSPACE_INVITE, WORKSPACE_PEOPLE)
    }

    @Test
    fun `system presets hold what the specification lists`() {
        assertThat(SystemPreset.ADMIN.defaults).containsExactlyElementsOf(Permission.PROJECT)
        assertThat(SystemPreset.EDITOR.defaults).containsExactly(
            TASKS_READ,
            TASKS_WRITE,
            THREADS_WRITE,
            RELEASES_MANAGE,
            MAPS_READ,
            MAPS_WRITE,
            FINANCE_READ,
            APPROVALS_DECIDE,
        )
        assertThat(SystemPreset.READER.defaults).containsExactly(TASKS_READ, THREADS_WRITE, MAPS_READ, FINANCE_READ)
        assertThat(SystemPreset.GUEST.defaults).containsExactly(TASKS_READ, THREADS_WRITE, MAPS_READ)
        assertThat(SystemPreset.SERVICE_TASKS.defaults)
            .containsExactly(TASKS_READ, TASKS_WRITE, THREADS_WRITE, MAPS_READ)
        assertThat(SystemPreset.entries.filterNot { it.human }.flatMap { it.defaults })
            .noneMatch { it.service != Permission.ServiceUse.PRESET }
    }

    @Test
    fun `an addition brings its dependencies and a removal takes its dependents`() {
        val editor = SystemPreset.EDITOR.defaults
        val added = Permissions.compile(editor, granted = listOf(FINANCE_WRITE))
        assertThat(added).contains(FINANCE_WRITE, FINANCE_READ)
        val removed = Permissions.compile(editor, revoked = listOf(TASKS_WRITE))
        assertThat(removed).doesNotContain(TASKS_WRITE, RELEASES_MANAGE, APPROVALS_DECIDE)
        assertThat(removed).contains(TASKS_READ, THREADS_WRITE, MAPS_WRITE, FINANCE_READ)
    }

    @Test
    fun `seeing tasks cannot be removed, a guest never manages access and a ceiling caps a service account`() {
        assertThat(Permissions.compile(SystemPreset.READER.defaults, revoked = listOf(TASKS_READ))).contains(TASKS_READ)
        val guest = Permissions.compile(Permission.PROJECT, forbidden = Permissions.GUEST_FORBIDDEN)
        assertThat(guest).doesNotContain(PROJECT_ACCESS).contains(MEMBERS_MANAGE, PROJECT_SETTINGS)
        val owner = SystemPreset.READER.defaults
        val service = Permissions.compile(
            SystemPreset.SERVICE_TASKS.defaults,
            forbidden = Permissions.NEVER_SERVICE,
            ceiling = owner,
        )
        assertThat(service).containsExactly(TASKS_READ, THREADS_WRITE, MAPS_READ)
        assertThat(Permissions.NEVER_SERVICE).doesNotContain(FINANCE_READ, FINANCE_WRITE).contains(APPROVALS_DECIDE)
    }

    @Test
    fun `adding a permission whose dependency is removed is a conflict`() {
        assertThat(Permissions.conflicts(listOf(RELEASES_MANAGE), listOf(TASKS_WRITE))).containsExactly(RELEASES_MANAGE)
        assertThat(Permissions.conflicts(listOf(FINANCE_WRITE), listOf(TASKS_WRITE))).isEmpty()
        assertThat(Permissions.conflicts(emptyList(), listOf(TASKS_READ))).containsExactly(TASKS_READ)
    }

    @Test
    fun `the readable difference keeps only changes that change something`() {
        val editor = SystemPreset.EDITOR.defaults
        val (granted, revoked) = Permissions.normalize(
            editor,
            granted = listOf(FINANCE_WRITE, TASKS_WRITE, Permission.WORKSPACE_SETTINGS),
            revoked = listOf(RELEASES_MANAGE, PROJECT_ACCESS),
        )
        assertThat(granted).containsExactly(FINANCE_WRITE)
        assertThat(revoked).containsExactly(RELEASES_MANAGE)
        val effective = Permissions.compile(editor, granted, revoked)
        val sources = Permissions.sources(editor, granted, revoked, effective)
        assertThat(sources[FINANCE_WRITE]).isEqualTo(Permissions.Source.ADDED)
        assertThat(sources[FINANCE_READ]).isEqualTo(Permissions.Source.PRESET)
        assertThat(sources[RELEASES_MANAGE]).isEqualTo(Permissions.Source.REMOVED)
        assertThat(sources[PROJECT_ACCESS]).isEqualTo(Permissions.Source.ABSENT)
        val cascaded = Permissions.compile(editor, revoked = listOf(TASKS_WRITE))
        assertThat(Permissions.sources(editor, emptySet(), setOf(TASKS_WRITE), cascaded)[APPROVALS_DECIDE])
            .isEqualTo(Permissions.Source.REMOVED)
    }

    @Test
    fun `workspace roles compile to their permissions with personal changes`() {
        assertThat(Permissions.compileWorkspace(WorkspaceRole.OWNER, emptySet(), Permission.WORKSPACE))
            .containsExactlyElementsOf(Permission.WORKSPACE)
        assertThat(Permissions.compileWorkspace(WorkspaceRole.ADMIN, emptySet(), setOf(WORKSPACE_INVITE)))
            .doesNotContain(WORKSPACE_INVITE, WORKSPACE_PEOPLE)
        assertThat(Permissions.compileWorkspace(WorkspaceRole.MEMBER, setOf(WORKSPACE_PEOPLE), emptySet()))
            .containsExactly(WORKSPACE_INVITE, WORKSPACE_PEOPLE)
        assertThat(Permissions.compileWorkspace(WorkspaceRole.MEMBER, setOf(TASKS_WRITE), emptySet())).isEmpty()
    }

    @Test
    fun `every action maps onto a project permission and agents can hold only permissions for service accounts`() {
        assertThat(Capability.entries).allMatch { it.permission.scope == PermissionScope.PROJECT }
        assertThat(Capability.GRANTABLE).allMatch { it.permission.service == Permission.ServiceUse.PRESET }
    }
}
