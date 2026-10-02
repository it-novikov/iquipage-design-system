---
bridge: 1
id: 20261002-finance-plan
title: "Финансы: план бюджета, версии, категории и сводка (сервер)"
status: active
risk: high
owner: it-novikov
branch: feature/finance-plan
base: main
created: 2026-10-02
updated: 2026-10-02T15:21:11Z
links:
---

# Финансы: план бюджета, версии, категории и сводка (сервер)

## Цель

В «Финансах» Sprintique есть журнал операций, но нет утверждённого плана, с которым их можно сравнить: система не отвечает, впишется ли проект в бюджет и почему нет. Первая поставка по спецификации `iquipage-finance-concept-v2.md` (раздел 4) добавляет на сервер категории, ссылку операции на релиз, план с неизменяемыми версиями, сводку план/факт/ожидается/прогноз/отклонение по валютам и категориям и объяснения отклонений с необязательной задачей. Результат — миграции 072 и далее, API, Zod-контракты, тесты раздела 5, ADR 0009, обновлённый docs/finance.md и PR в main.

## Рамки

- **Входит:** finance_category (+ перенос текстов категорий), finance_entry.category_id и release_id, finance_plan, finance_plan_version (draft/approved/superseded, триггер заморозки), finance_plan_line, finance_variance_note (+ задача через модуль задач), GET finance-overview, approve/revise с baseRevision, лимиты, события без сумм; в UI только выбор/создание категории в диалоге операции и переименование «Баланс»/«Прогноз»/«Запланировано».
- **Не входит:** экран плана и сводки (отдельный дизайн-раунд), финансовые MCP-инструменты, импорт, уведомления, помесячный план.
- **Ограничения:** миграции с V20261001000072 (068–070 — PR #44, 071 — исправление теста скорости); права только finance.read/finance.write через auth.can, tasks.write для задачи; сервисные аккаунты — только явный грант; агенты — в пределах прав запустившего (#45).

## Приёмка

- [ ] A1. Схема: миграции 072+ применяются с нуля; категории перенесены из текстов; триггер замораживает не-черновые версии и их строки даже прямым SQL под runtime-ролью; RLS FORCE через auth.can(finance.read/write)
- [ ] A2. Расчёт: факт, ожидается, прогноз, знаковые отклонения доходов и расходов, «не было в плане», просроченные ожидания, валюты раздельно, аннулированные не учитываются, нулевой план без процента; EXPLAIN ANALYZE на 100 000 операций
- [ ] A3. Команды: категории, план, черновик, approve (ровно одна утверждённая при гонке), revise, объяснение с задачей ровно один раз; Idempotency-Key, baseRevision, барьер записи, аудит и событие в одной транзакции; события и квитанции без сумм и текстов
- [ ] A4. Безопасность: без finance.read нет данных и признаков существования плана; сервисный аккаунт без явного гранта получает отказ; релиз чужого проекта отклоняется
- [ ] A5. Гейты: npm test с TEST_S3_CONFIG и LC_ALL=C node scripts/verify-vnext.mjs зелёные (кроме известного WorkbenchCapacityIntegrationTest); ADR 0009, docs/finance.md, контракты и jOOQ обновлены; PR открыт

## Передача

- **Состояние:** Сервер, контракты, миграции 072–075, тесты FP01–FP10 и FinancePlanIntegrationTest написаны и зелёные; ADR 0009 и docs/finance.md написаны
- **Сейчас:** S3 — полный прогон и EXPLAIN
- **Дальше:** jOOQ после 075, EXPLAIN на итоговом jar, коммит, гейты, PR
- **Незакоммичено:** всё: компилируется, тесты зелёные
- **Рабочая копия:** 61 файл(ов): products/sprintique/contracts/finance.ts, products/sprintique/docs/access/access-and-invitations.md, products/sprintique/docs/finance.md, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/App.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/indexes/Indexes.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/keys/Keys.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/routines/references/Routines.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/FinanceEntry.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/FinanceEntryVersion.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Projects.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Releases.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Tasks.kt и ещё 49 (34 files changed, 3193 insertions(+), 212 deletions(-)) · HEAD 4756b27
- **Ловушки:**
  - verify-vnext запускает npm test целиком; WorkbenchCapacityIntegrationTest (известный флейк) обрывает прогон до Node-сьютов — их гонять отдельно: node scripts/test.mjs --skip-integration

## План

### S1. Миграции и jOOQ [done]
- **Что:** Категории, release_id, план, версии, строки, объяснения, политики
- **Как:** SQL-миграции 072-075, afterMigrate, rollback, generateJooq
- **Зачем:** Данные и границы БД
- **Приёмка:**
  - [x] миграции применяются с нуля, jOOQ drift зелёный
- **Покрывает:** A1
- **Итог:** V20261001000072–075 применяются с нуля (--jooq), jOOQ перегенерирован; FinancePlanIntegrationTest 3/3 (перенос категорий с версии 067, заморозка для роли владельца, откат)

### S2. Сервер и контракты [done]
- **Что:** Сервисы, контроллер, Zod, OpenAPI
- **Как:** по образцу finance ledger
- **Зачем:** API спецификации 4.5
- **Приёмка:**
  - [x] ./gradlew check зелёный
- **Покрывает:** A2,A3
- **Итог:** FinancePlanController: 10 маршрутов; ./gradlew check зелёный, ContractParityTest включает 8 новых контрактов
- **Зависит от:** S1

### S3. Тесты [active]
- **Что:** HTTP и интеграционные тесты раздела 5
- **Как:** tests/finance-plan.test.ts, FinancePlanIntegrationTest
- **Зачем:** Приёмка
- **Приёмка:**
  - [ ] тесты зелёные
- **Покрывает:** A1,A2,A3,A4
- **Зависит от:** S2

### S4. UI диалога, документы, гейты, PR [todo]
- **Что:** Категория в диалоге, переименования, ADR, docs, EXPLAIN, гейты
- **Как:** npm test, verify-vnext
- **Зачем:** Поставка
- **Приёмка:**
  - [ ] гейты зелёные, PR открыт
- **Покрывает:** A5
- **Зависит от:** S3

## Решения

- **D1** (2026-10-02) Миграции 072–075: категории+release_id (072), план/версии/строки (073), объяснения (074), политики чтения финансов через auth.projects_with один раз на запрос (075) — сводка на 100 000 операций 600 → 23 мс
- **D2** (2026-10-02) Строки черновика заменяются DELETE+INSERT: единственный DELETE runtime-роли в финансах, триггер разрешает его только для черновика — история правок черновика не нужна, утверждённое неизменно
- **D3** (2026-10-02) У объяснения добавлено direction к ключу спецификации: у категории both два отклонения; порог суммы = 1 минимальная единица до решения владельца; недобор дохода >10% тоже требует объяснения
- **D4** (2026-10-02) План на релиз сравнивается с операциями этого релиза; период и релиз плана после утверждения неизменны; finance-* события видят только люди с finance.read (раньше любой человек-участник)

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
