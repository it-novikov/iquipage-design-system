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
updated: 2026-10-11T09:20:23Z
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

- [x] A1. Семь подтверждённых требований выполнены, права, черновики и данные сохранены.
- [x] A2. Блокировка рассчитана сервером до фильтрации/пагинации, изменения зависимости/готовности отражаются на доске.
- [x] A3. Новый UI проверен реальным HTTP/браузером, light/dark/mobile/keyboard; семь review задач сохраняют паритет.
- [x] A4. Два независимых ревью без P0/P1, exact DS package, full isolated/detached gate и CI на неизменном source tree.
- [x] A5. Проверенный образ запушен и выложен с fresh backup, совместимым откатом и наблюдением; задачи на review владельца.

## Передача

- **Состояние:** Реализация и выпуск завершены; семь задач review владельца
- **Сейчас:** Production0664373, observation PASS, собственные планы выполнены
- **Дальше:** Человеческая проверка SPR4/8/20–24 и PR65 поверх PR64
- **Незакоммичено:** Новая backend projection/contracts/schema/test, UI/DS изменения Astra и release plan.
- **Рабочая копия:** 3 файл(ов): products/sprintique/docs/release-1/BROWSER-ACCEPTANCE.md, products/sprintique/docs/release-1/PLAN.md, products/sprintique/docs/release-1/RELEASE-EVIDENCE.md (4 files changed, 34 insertions(+), 14 deletions(-)) · HEAD 0664373 · снято 2026-10-11T09:20:23Z
- **Проверка:** CI38125310722 SUCCESS; DS459/product483/detached483; 21 samples /600s ready, exact image, restarts0/ERROR0; receipts и release evidence сохранены
- **Причина:** review — codex, 2026-10-11T09:20:23Z, передано human:it-novikov: Все семь задач review, PR65 готов к проверке; production0664373 и десятиминутное наблюдение PASS. PR64/65 не сливались.

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

### S3. Приёмка и выпуск [done]
- **Что:** full gate, два ревью, PR/push, production.
- **Как:** отдельный fixture PG/S3, detached extraction, backup/image readiness/observation.
- **Зачем:** подтвердить доставку проверенной версии.
- **Приёмка:**
  - [x] A1–A5 подтверждены текущими evidence.
- **Итог:** CI SUCCESS, full isolated483/detached483 и DS459, main/fallback runtime PASS; SHA0664373 выложен с fresh backup, 10 минут /21 выборка PASS. Все семь задач review от Codex, принятие за владельцем.
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
