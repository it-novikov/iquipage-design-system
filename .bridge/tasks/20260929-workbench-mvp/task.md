---
bridge: 1
id: 20260929-workbench-mvp
title: "Sprintique: Рабочий стол MVP (WP0–WP3)"
status: active
risk: high
owner: it-novikov
branch: feature/workbench
base: main
created: 2026-09-29
updated: 2026-09-29T16:01:00Z
links:
  - https://claude.ai/artifact/RHgUPWLj3TsT7Rq1QRJNQm
---

# Sprintique: Рабочий стол MVP (WP0–WP3)

## Цель

Человек, работающий в нескольких проектах Sprintique, не видит в одном месте, чего ждут от него, над чем он работает и что изменилось в том, за чем он следит: оболочка project-first, а статус и срок не отвечают на вопрос «чего ждут от меня». Нужен глобальный «Рабочий стол» — авторизованная task-centric проекция поверх project-owned Task с линзами «Сейчас» (Нужно действие / Текущая работа: В фокусе, В работе, Жду / Изменилось) и «План» (Сегодня / 7 дней, только чтение). Решение владельца — delivery-plan §21; результат — внешний MVP WP0–WP3 за флагами, с RLS/security/a11y-доказательствами и зелёными гейтами.

## Рамки

- **Входит:** ADR W1–W6 (docs/adr); миграции 028–029 + RLS (task_personal_state, task_wait_state, attention_requests, private_receipts, workbench_preferences, task_activity); `GET /api/v1/workbench` (один snapshot), страницы секций с подписанными курсорами, `GET /api/v1/workbench/plan`; личные команды follow/focus/seen/snooze, запросы (create/patch/resolve/reopen/cancel), «Жду» (POST/PATCH/DELETE); синхронизация с обсуждениями, утверждениями и потерей членства; UI «Сейчас» и «План», маршрут `/workbench/tasks/:projectId/:taskId`, глобальный пункт «Рабочий стол»; флаги `workbench_*`.
- **Не входит:** ассистент, bulk, календари/встречи, портфельный контроль, гипотезы, связи идей (P1), `created_by`, мьют.
- **Ограничения:** только релиз DS из vendor/ (DS-пробелы записать, DS не патчить); продуктовый CSS с префиксом `dsk-` под `check:styles`; миграции additive с `V20260929000028` (025–027 заняты ветками finance, large files, public API/MCP — мерж после них или перенумерация перед мержем); Docker только контекст `colima-sprintique-vnext-qa`; данные стенда и `output/infra/*` не трогать; не мержить.

## Приёмка

- [x] A1. A1. ADR W1–W6 и контракт маршрута/drawer записаны и решают вопросы §2 delivery-plan
- [ ] A2. A2. Миграции 028–029 additive, RLS: личное состояние, ожидание и квитанции видит только владелец; запросы и активность — только участники проекта; jOOQ совпадает со схемой
- [ ] A3. A3. GET /workbench: один snapshot, дедупликация до пагинации, точные счётчики action/current, updates ≤99+, подписанные курсоры (actor/filter/epoch/expiry), no-store, жёсткие лимиты; матрица включения §15 зелёная
- [ ] A4. A4. Личные команды follow/focus/seen/snooze с независимыми ревизиями, ключом повтора и приватной квитанцией, без общих событий; запросы с точным адресатом, CAS, синхронизацией источника и потерей членства; «Жду» с явным opt-in и checkBackAt
- [ ] A5. A5. UI «Сейчас» и «План» на композициях DS, все состояния секций, drawer по /workbench/tasks/:projectId/:taskId с восстановлением фокуса, 390/320, WCAG 2.2 AA
- [ ] A6. A6. Флаги workbench_* в конфигурации сервера: выключены в production по умолчанию, включены в тестах и локально
- [ ] A7. A7. Гейты: npm test продукта с S3, backend unit+integration, корневой verify-vnext — зелёные без пропусков; ревью R1 и R2 записаны; PR открыт

## Передача

- **Состояние:** S1 готов: ADR W1–W6
- **Сейчас:** S2 — миграции 028–029
- **Дальше:** Написать V20260929000028__add_workbench.sql
- **Незакоммичено:** нет
- **Рабочая копия:** 2 файл(ов): products/sprintique/docs/adr/, products/sprintique/docs/workbench/ · HEAD f05dee6

## План

### S1. WP0: ADR и контракт [done]
- **Что:** ADR W1–W6 в docs/adr
- **Как:** решения по §2–§8 delivery-plan, коротко
- **Зачем:** Семантика и privacy-гейты до кода
- **Приёмка:**
  - [x] ADR записаны, коммит
- **Покрывает:** A1
- **Итог:** ADR W1–W6 + README в docs/adr; контракт маршрута — W6

### S2. WP1: миграции и RLS [active]
- **Что:** 028 таблицы+RLS, 029 task_activity+триггеры, jOOQ
- **Как:** additive SQL, afterMigrate REVOKE, test.mjs --jooq
- **Зачем:** Основа проекции и приватности
- **Приёмка:**
  - [ ] Миграции применяются, jOOQ drift зелёный
- **Покрывает:** A2

### S3. WP1–WP2: сервер [todo]
- **Что:** Проекция, курсоры, план, личные команды, запросы, ожидание, флаги
- **Как:** модуль workbench (application/api), HTTP-тесты workbench*.test.ts, unit-тесты курсора и горизонта
- **Зачем:** Контракт §4–§8
- **Приёмка:**
  - [ ] Тесты §15 зелёные, R1 проведено
- **Покрывает:** A3,A4,A6

### S4. WP3: UI Сейчас и План [todo]
- **Что:** web/workbench/*, dsk-* CSS, маршрут, глобальный пункт
- **Как:** композиции PR #19, drawer задачи, стенд
- **Зачем:** Внешний MVP
- **Приёмка:**
  - [ ] Скриншоты 1440 светлая/тёмная, 390/320; клавиатура
- **Покрывает:** A5

### S5. Гейты, ревью R2, PR [todo]
- **Что:** npm test, verify-vnext, R2, PR
- **Как:** полные гейты, субагент-ревью
- **Зачем:** Release gate
- **Приёмка:**
  - [ ] Гейты зелёные, PR открыт
- **Покрывает:** A7

## Решения

- **D1** (2026-09-29) ADR лежат в products/sprintique/docs/adr/ (W1–W6), как велено в задаче, а не в docs/decisions — отдельная серия решений Рабочего стола со ссылкой из README

## Вопросы

Пока нет.

## Контекст

- Контракт: `products/sprintique/docs/workbench/{solution-brief,delivery-plan,design-handoff}.md`; ADR: `products/sprintique/docs/adr/`.
- Дизайн: scratchpad сессии `workbench/project/*.dc.html`, `workbench.css`; артефакт https://claude.ai/artifact/RHgUPWLj3TsT7Rq1QRJNQm.
- Node 24: `export PATH=/opt/homebrew/opt/node@24/bin:$PATH`; JDK 25: `/opt/homebrew/opt/openjdk@25`.
- jOOQ после миграций: `cd products/sprintique && LC_ALL=C node scripts/test.mjs --jooq`.
- Гейт продукта: `cd products/sprintique && LC_ALL=C TEST_S3_CONFIG=/Users/nvkv71/iquipage-work/ux-ds-20260925/products/sprintique/output/infra/storage.json npm test`; корень: `LC_ALL=C TEST_S3_CONFIG=… node scripts/verify-vnext.mjs`.
- Только workbench-тесты: `LC_ALL=C node scripts/test.mjs --skip-integration --only=workbench.test.ts`.
