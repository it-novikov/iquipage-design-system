---
bridge: 1
id: 20261011-spr-14-agent-work-plan
title: "SPR-14: исследование и план агентской работы"
status: active
risk: high
owner: it-novikov
branch:
base:
created: 2026-10-11
updated: 2026-10-11T05:23:00Z
links:
---

# SPR-14: исследование и план агентской работы

## Цель

Исследовать SPR-14 и связанную SPR-4, подготовить согласуемый план работы людей и агентов, DS gaps и подзадачи. Перед изменением контрактов и прав получить решение владельца. Работать в платформе только от отдельного сервисного аккаунта Codex.

## Рамки

- **Входит:** чтение текущего кода и задач, три экспертных исследования, план revision 1, настройка собственного MCP-коннектора Codex.
- **Не входит:** реализация продукта до согласования high-risk scope; действия в задачах от имени человека.
- **Ограничения:** UI реализует GPT 6 Astra; DS-first; собственный сервисный аккаунт; секреты вне Git.

## Приёмка

- [x] A1. План содержит факты, DS gaps, этапы P01–P12, приёмку и rollback.
- [x] A2. Создан отдельный Codex и OAuth-коннектор sprintique; подтверждены права.
- [x] A3. Владелец согласовал revision 1, подзадачи созданы собственной учётной записью.

## Передача

- **Состояние:** План r1 подготовлен; собственный Codex и MCP OAuth подключены; пользователь запретил вести задачи от его имени
- **Сейчас:** S1 завершён: три эксперта и фактическая проверка аккаунта
- **Дальше:** Получить согласование r1, загрузить новые MCP tools и создать подзадачи как Codex
- **Незакоммичено:** Только документы; код продукта не менялся
- **Рабочая копия:** 34 файл(ов): engineering/bridge/PROTOCOL.md, engineering/bridge/src/cli.mjs, engineering/bridge/src/secrets.mjs, libraries/iquipage/PROVENANCE.json, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/scripts/build.mjs, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/manifest.json, libraries/iquipage/tests/vnext38.test.cjs, libraries/iquipage/tokens/semantic.json, libraries/iquipage/types/core.d.ts и ещё 22 (22 files changed, 87 insertions(+), 32 deletions(-)) · HEAD 9543147 · снято 2026-10-11T05:23:00Z
- **Ловушки:**
  - Карточка agent-bridge.md историческая: её ограничения противоречат текущим ai_agent_runs; README pin .28 устарел, package.json реально .38
- **Проверка:** bridge check 20261011-spr-14-agent-work-plan; codex mcp list
- **Причина:** planned — codex, 2026-10-11T05:23:00Z: Discovery завершено; реализация идёт в feat/spr-14-agent-work. UI GPT 6 Astra, backend и bridge работают параллельно.

## План

### S1. Исследование и собственный коннектор [done]
- **Что:** Сверить код, две задачи, DS и два механизма исполнения; подготовить план; подключить Codex.
- **Как:** Три эксперта, read-only VPS, штатный codex mcp add и OAuth.
- **Зачем:** Не дублировать существующее и не действовать от имени владельца.
- **Приёмка:**
  - [x] План записан в docs/agent-work/SPR-14-PLAN.md
  - [x] codex mcp list показывает OAuth; отдельный аккаунт подтверждён без чтения secrets
- **Покрывает:** A1, A2
- **Итог:** revision 1; Codex sa_6135255f-3b27-44b9-8220-3c6891930433, OAuth read/write, семь проектов, без admin/finance.

### S2. Согласование и постановка подзадач [done]
- **Что:** Утвердить P01–P12 и создать подзадачи по MCP как Codex.
- **Как:** Решение владельца по r1, затем typed create_task со ссылкой на SPR-14 и зависимостями.
- **Зачем:** Согласовать новые контракты, права и пользовательские сценарии.
- **Приёмка:**
  - [x] Есть явное согласование r1 и подтверждённые ключи подзадач
- **Покрывает:** A3
- **Итог:** План утверждён владельцем; Codex создал SPR-25–SPR-36 через MCP, SPR-14 in_progress и назначен Codex
- **Зависит от:** S1

## Решения

- **D1** (2026-10-11) P01–P12 утверждены владельцем; UI GPT 6 Astra, рабочий текст связный без буллетов и технического шума; только собственный Codex в платформе

## Вопросы

- **Q1** [answered] Утвердить revision 1 и scope P01–P12, включая work.write, версии навыков и связь SPR-4? → it-novikov
  Ответ: Владелец согласовал 2026-10-11: В остальном ок, давай пробовать. Уточнение: связный человекочитаемый текст без буллетов/нейрослопа, минимум шума и только значимое в быстром доступе.

## Контекст

- products/sprintique/docs/agent-work/SPR-14-PLAN.md — предложение r1
- https://sprintique.iqui.page/?project=sprintique#/task/SPR-14
- codex mcp get sprintique; codex mcp list — проверка конфигурации, не выводить credentials
