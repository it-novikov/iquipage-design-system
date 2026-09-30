---
bridge: 1
id: 20260930-assign-service-account
title: "SPR-7: сервисный аккаунт как исполнитель задачи"
status: active
risk: standard
owner: nvkv71
branch: feature/assign-service-account
base: main
created: 2026-09-30
updated: 2026-09-30T19:06:08Z
links:
---

# SPR-7: сервисный аккаунт как исполнитель задачи

## Цель

Какая проблема, у кого и какой проверяемый результат нужен. 2–6 предложений.

## Рамки

- **Входит:** …
- **Не входит:** …
- **Ограничения:** …

## Приёмка

- [ ] A1. Сервер: исполнителем может быть сервисный аккаунт-участник проекта с правом редактировать задачи (роль editor и владелец не ниже editor), не приостановленный и не удалённый; иначе 422 TASK_OWNER с понятным русским текстом; снять исполнителя можно всегда; прежний исполнитель остаётся при правке других полей
- [ ] A2. Задача показывает вид и состояние исполнителя (ownerKind, ownerState: active/suspended/deleted/former); приостановленный или удалённый аккаунт остаётся исполнителем и помечен в drawer, в списке планирования и на доске
- [ ] A3. Выборы исполнителя (drawer, создание, фильтр доски, список планирования) показывают сервисные аккаунты отдельной группой «Сервисные аккаунты» со значком и владельцем; подпись «Имя (сервисный аккаунт)»
- [ ] A4. MCP: search_tasks и create/update_task принимают assigneeId "me"; get_task и search_tasks отдают assigneeKind и assigneeState; аудит и outbox подписаны действующим принципалом
- [ ] A5. Тесты сервера и UI-логики; проверка в браузере на локальном запуске; независимое ревью; гейты npm test, Kotlin unit+integration, verify-vnext зелёные; PR в main открыт, не слит

## Передача

- **Состояние:** Задача заведена, работа не начата.
- **Сейчас:** Сервер (Assignees, проекция задачи, планирование, MCP) и UI (assignees.js, drawer, фильтр доски, карточки, планирование) сделаны; assignees.test.ts 4/4, assignee-options 6/6, mcp-oauth и planning зелёные
- **Дальше:** Проверка в браузере на локальном запуске, затем ревью, гейты, PR
- **Незакоммичено:** нет
- **Рабочая копия:** 22 файл(ов): products/sprintique/contracts/index.ts, products/sprintique/server/src/main/kotlin/com/sprintique/mcp/application/McpTools.kt, products/sprintique/server/src/main/kotlin/com/sprintique/mcp/application/TaskTools.kt, products/sprintique/server/src/main/kotlin/com/sprintique/planning/application/Planning.kt, products/sprintique/server/src/main/kotlin/com/sprintique/planning/application/PlanningStates.kt, products/sprintique/server/src/main/kotlin/com/sprintique/planning/application/PlanningView.kt, products/sprintique/server/src/main/kotlin/com/sprintique/planning/application/ViewText.kt, products/sprintique/server/src/main/kotlin/com/sprintique/planning/domain/PlanningState.kt, products/sprintique/server/src/main/kotlin/com/sprintique/task/application/Tasks.kt, products/sprintique/server/src/main/kotlin/com/sprintique/workspace/application/Membership.kt, products/sprintique/tests/planning.test.ts, products/sprintique/ui/planning/src/markup.js и ещё 10 (18 files changed, 165 insertions(+), 59 deletions(-)) · HEAD bdf04f9

## План

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
