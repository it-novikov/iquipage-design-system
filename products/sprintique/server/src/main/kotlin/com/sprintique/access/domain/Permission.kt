package com.sprintique.access.domain

/** Where a permission applies: inside one project, or to the workspace itself. */
enum class PermissionScope { PROJECT, WORKSPACE }

/**
 * A named permission of the fixed catalog (docs/access/access-and-invitations.md, section 3), in the order people see
 * it. A permission includes the ones in [includes]. [service] says what a principal other than a person may hold:
 * [ServiceUse.PRESET] through any preset, [ServiceUse.EXPLICIT] only when added one by one (finance), [ServiceUse.NEVER]
 * never. The database holds the same catalog (auth.permission_catalog and auth.permission_implies).
 */
enum class Permission(
    val wire: String,
    val scope: PermissionScope,
    val group: String,
    val title: String,
    val description: String,
    private val includesWire: List<String> = emptyList(),
    val service: ServiceUse = ServiceUse.NEVER,
) {
    TASKS_READ(
        "tasks.read", PermissionScope.PROJECT, "Задачи", "Видеть задачи",
        "Список, карточки, история, планирование в режиме чтения. Есть у каждого участника проекта.",
        service = ServiceUse.PRESET,
    ),
    TASKS_WRITE(
        "tasks.write", PermissionScope.PROJECT, "Задачи", "Создавать и менять задачи",
        "Название, описание, статус, исполнитель, связи, теги задач.", listOf("tasks.read"), ServiceUse.PRESET,
    ),
    THREADS_WRITE(
        "threads.write", PermissionScope.PROJECT, "Обсуждения", "Писать в обсуждениях",
        "Вопросы, комментарии, ответы и решение вопросов.", listOf("tasks.read"), ServiceUse.PRESET,
    ),
    RELEASES_MANAGE(
        "releases.manage", PermissionScope.PROJECT, "Планирование и релизы", "Управлять релизами и спринтами",
        "Создавать, закрывать и переносить релизы, применять планы.", listOf("tasks.write"), ServiceUse.PRESET,
    ),
    MAPS_READ(
        "maps.read", PermissionScope.PROJECT, "Карты идей", "Видеть карты", "Открывать карты идей проекта.",
        listOf("tasks.read"), ServiceUse.PRESET,
    ),
    MAPS_WRITE(
        "maps.write", PermissionScope.PROJECT, "Карты идей", "Менять карты",
        "Рисовать, переносить и удалять объекты карт.", listOf("maps.read"), ServiceUse.PRESET,
    ),
    FINANCE_READ(
        "finance.read", PermissionScope.PROJECT, "Финансы", "Видеть финансы",
        "Журнал операций, план и сводка. Сервисным аккаунтам — только явно.", listOf("tasks.read"), ServiceUse.EXPLICIT,
    ),
    FINANCE_WRITE(
        "finance.write", PermissionScope.PROJECT, "Финансы", "Вести журнал финансов",
        "Вести операции, категории и план, утверждать план. Сервисным аккаунтам — только явно.", listOf("finance.read"),
        ServiceUse.EXPLICIT,
    ),
    APPROVALS_DECIDE(
        "approvals.decide", PermissionScope.PROJECT, "Агенты", "Решать по предложениям агентов",
        "Подтверждать или отклонять планы агентов.", listOf("tasks.write"),
    ),
    AGENTS_MANAGE(
        "agents.manage", PermissionScope.PROJECT, "Агенты", "Управлять агентами в проекте",
        "Подключать агентов и сервисные аккаунты к проекту, менять их права и отключать.", listOf("tasks.read"),
    ),
    MEMBERS_INVITE(
        "members.invite", PermissionScope.PROJECT, "Участники и приглашения", "Приглашать в проект",
        "Только с правами не шире своих. Приглашённый входит в пространство гостем.", listOf("tasks.read"),
    ),
    MEMBERS_MANAGE(
        "members.manage", PermissionScope.PROJECT, "Участники и приглашения", "Менять права участников",
        "Пресеты, права, добавление из пространства и удаление из проекта.", listOf("members.invite"),
    ),
    PROJECT_SETTINGS(
        "project.settings", PermissionScope.PROJECT, "Настройки проекта", "Настраивать проект",
        "Название, аватар, теги, шаблоны задач, параметры планирования.", listOf("tasks.read"),
    ),
    PROJECT_ACCESS(
        "project.access", PermissionScope.PROJECT, "Настройки проекта", "Управлять доступом",
        "Всё, что делает администратор проекта. Нельзя дать гостю.", listOf("members.manage", "project.settings"),
    ),
    WORKSPACE_INVITE(
        "workspace.invite", PermissionScope.WORKSPACE, "Люди", "Приглашать в пространство",
        "Письма и ссылки-приглашения с пресетами не шире своих.",
    ),
    WORKSPACE_PEOPLE(
        "workspace.people", PermissionScope.WORKSPACE, "Люди", "Управлять людьми",
        "Роли и права в пространстве, гости, отзыв приглашений, удаление.", listOf("workspace.invite"),
    ),
    PROJECTS_CREATE(
        "projects.create", PermissionScope.WORKSPACE, "Проекты", "Создавать проекты",
        "Создатель становится администратором проекта.",
    ),
    PROJECTS_OVERSEE(
        "projects.oversee", PermissionScope.WORKSPACE, "Проекты", "Видеть все проекты и входить в них",
        "Каталог всех проектов; вход в любой проект как администратор — с записью в его историю.",
    ),
    WORKSPACE_SETTINGS(
        "workspace.settings", PermissionScope.WORKSPACE, "Настройки пространства", "Настраивать пространство",
        "Название, часовой пояс, правила, пресеты прав.",
    ),
    ;

    /** The permissions this one includes directly. */
    val includes: Set<Permission> get() = includesWire.mapTo(linkedSetOf()) { fromWire(it)!! }

    enum class ServiceUse { PRESET, EXPLICIT, NEVER }

    companion object {
        val PROJECT: List<Permission> = entries.filter { it.scope == PermissionScope.PROJECT }
        val WORKSPACE: List<Permission> = entries.filter { it.scope == PermissionScope.WORKSPACE }

        fun fromWire(value: String): Permission? = entries.firstOrNull { it.wire == value }
    }
}
