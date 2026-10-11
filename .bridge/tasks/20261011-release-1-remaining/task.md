---
bridge: 1
id: 20261011-release-1-remaining
title: "Релиз 1.0: оставшиеся задачи и проверка паритета"
status: active
risk: high
owner: it-novikov
branch: feat/release-1-remaining
base: feat/spr-14-agent-work
created: 2026-10-11
updated: 2026-10-11T08:33:37Z
links:
---

# Релиз 1.0: оставшиеся задачи и проверка паритета

## Цель

Закрыть оставшиеся готовые задачи релиза 1.0: SPR-4, SPR-8, SPR-20–SPR-24. Пользователь поручил работу в прежнем формате: UI выполняет GPT 6 Astra, остальную реализацию и поставку ведёт Codex. Сохранить уже выложенный SPR-14 и проверить семь ранее выполненных задач на регрессии.

## Рамки

- **Входит:** треды/вопросы, toast 3500 ms, staging loader, шаблоны по типу, contextual link search, общий header, actual blocker на доске; паритет SPR-5/6/7/9/10/12/13; DS release, независимые ревью, полный гейт, push/deploy.
- **Не входит:** задачи вне релиза 1.0, повторное принятие SPR-14 за человека, новые полномочия/интеграции, переработка работающего UI без причины.
- **Ограничения:** собственный аккаунт Codex; краткий текст; DS public exact tarball; синтетические тесты; applied migrations immutable; UI/DS только Astra, backend/проверки/операции root.

## Приёмка

- [ ] A1. Семь подтверждённых требований выполнены, права, черновики и данные сохранены.
- [ ] A2. Блокировка рассчитана сервером до фильтрации/пагинации, изменения зависимости/готовности отражаются на доске.
- [ ] A3. Новый UI проверен реальным HTTP/браузером, light/dark/mobile/keyboard; семь review задач сохраняют паритет.
- [ ] A4. Два независимых ревью без P0/P1, exact DS package, full isolated/detached gate и CI на неизменном source tree.
- [ ] A5. Проверенный образ запушен и выложен с fresh backup, совместимым откатом и наблюдением; задачи на review владельца.

## Передача

- **Состояние:** UI .42 и сервер готовы; два независимых ревью без открытых замечаний; окончательная browser acceptance пройдена.
- **Сейчас:** Полный isolated/detached гейт и проверка amd64 образа
- **Дальше:** После PASS опубликовать PR, проверить CI и выложить с резервной копией
- **Незакоммичено:** Новая backend projection/contracts/schema/test, UI/DS изменения Astra и release plan.
- **Рабочая копия:** 52 файл(ов): libraries/iquipage/PROVENANCE.json, libraries/iquipage/README.md, libraries/iquipage/docs/work-story.md, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/modules/components.js, libraries/iquipage/src/modules/ui.js, libraries/iquipage/src/styles/work-story.css, libraries/iquipage/tests/vnext25.test.cjs, libraries/iquipage/tests/vnext38.test.cjs, libraries/iquipage/tests/wave0-a11y.test.cjs и ещё 40 (41 files changed, 584 insertions(+), 110 deletions(-)) · HEAD 4ad5613
- **Проверка:** HTTP25/25, DS459/459, UI72/72, browser Enter→article pending→H3 success; CSS budget без повышения; fullgate2 выполняется

## План

### S1. Требования и контракты [done]
- **Что:** прочитать карточки, reference SPR-4 и базу; связать критерии с существующими правами/данными.
- **Как:** own native MCP inventory; backend полный project snapshot; Astra UI source/reference diagnosis.
- **Зачем:** исключить дублирование и потерю поведения.
- **Приёмка:**
  - [x] Семь ready задач назначены Codex, scope/контракты/проверки записаны.
- **Итог:** Все14карточек прочитаны, семьreadyназначеныCodex/in_progress. UIAstra подтвердил reference и frontendroot causes; серверный additive blocker контракт согласован.

### S2. Реализация [done]
- **Что:** семь fixes и недостающие DS primitives.
- **Как:** Astra frontend/DS, root Kotlin/contracts/HTTP regressions; additive read projection без миграций.
- **Зачем:** функциональный чистый UI.
- **Приёмка:**
  - [x] Targeted проверки и реальный вертикальный сценарий проходят.
- **Итог:** Семь исправлений выполнены. Exact DS .42, HTTP25/25, UI72/72, DS459/459 и реальный браузерный сценарий с фокусом прошли; два независимых ревью без открытых замечаний.
- **Зависит от:** S1
- **Покрывает:** A1, A2, A3

### S3. Приёмка и выпуск [active]
- **Что:** full gate, два ревью, PR/push, production.
- **Как:** отдельный fixture PG/S3, detached extraction, backup/image readiness/observation.
- **Зачем:** подтвердить доставку проверенной версии.
- **Приёмка:**
  - [ ] A1–A5 подтверждены текущими evidence.
- **Зависит от:** S2
- **Покрывает:** A4, A5

## Решения

- **D1** (2026-10-11) Пользователь поручил все оставшиеся задачи релиза1.0 в прежнем формате; push/deploy разрешены исходной постановкой и сохраняются для продолжения.
- **D2** (2026-10-11) SPR-14 и прежние review задачи не возвращаются в реализацию без найденной регрессии. Новая ветка основана на4ad5613, не теряет выложенный runtime eb4574b.
- **D3** (2026-10-11) SPR-24 — additive read projection на существующей authorized PlanningState; preview/history остаются immutable, новые таблицы и полномочия не требуются.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
