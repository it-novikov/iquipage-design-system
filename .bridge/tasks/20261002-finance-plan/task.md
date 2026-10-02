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
updated: 2026-10-02T16:05:57Z
links:
  - https://github.com/it-novikov/iquipage-design-system/pull/47
---

# Финансы: план бюджета, версии, категории и сводка (сервер)

## Цель

В «Финансах» Sprintique есть журнал операций, но нет утверждённого плана, с которым их можно сравнить: система не отвечает, впишется ли проект в бюджет и почему нет. Первая поставка по спецификации `iquipage-finance-concept-v2.md` (раздел 4) добавляет на сервер категории, ссылку операции на релиз, план с неизменяемыми версиями, сводку план/факт/ожидается/прогноз/отклонение по валютам и категориям и объяснения отклонений с необязательной задачей. Результат — миграции 072 и далее, API, Zod-контракты, тесты раздела 5, ADR 0009, обновлённый docs/finance.md и PR в main.

## Рамки

- **Входит:** finance_category (+ перенос текстов категорий), finance_entry.category_id и release_id, finance_plan, finance_plan_version (draft/approved/superseded, триггер заморозки), finance_plan_line, finance_variance_note (+ задача через модуль задач), GET finance-overview, approve/revise с baseRevision, лимиты, события без сумм; в UI только выбор/создание категории в диалоге операции и переименование «Баланс»/«Прогноз»/«Запланировано».
- **Не входит:** экран плана и сводки (отдельный дизайн-раунд), финансовые MCP-инструменты, импорт, уведомления, помесячный план.
- **Ограничения:** миграции с V20261001000072 (068–070 — PR #44, 071 — исправление теста скорости); права только finance.read/finance.write через auth.can, tasks.write для задачи; сервисные аккаунты — только явный грант; агенты — в пределах прав запустившего (#45).

## Приёмка

- [x] A1. Схема: миграции 072+ применяются с нуля; категории перенесены из текстов; триггер замораживает не-черновые версии и их строки даже прямым SQL под runtime-ролью; RLS FORCE через auth.can(finance.read/write)
- [x] A2. Расчёт: факт, ожидается, прогноз, знаковые отклонения доходов и расходов, «не было в плане», просроченные ожидания, валюты раздельно, аннулированные не учитываются, нулевой план без процента; EXPLAIN ANALYZE на 100 000 операций
- [x] A3. Команды: категории, план, черновик, approve (ровно одна утверждённая при гонке), revise, объяснение с задачей ровно один раз; Idempotency-Key, baseRevision, барьер записи, аудит и событие в одной транзакции; события и квитанции без сумм и текстов
- [x] A4. Безопасность: без finance.read нет данных и признаков существования плана; сервисный аккаунт без явного гранта получает отказ; релиз чужого проекта отклоняется
- [x] A5. Гейты: npm test с TEST_S3_CONFIG и LC_ALL=C node scripts/verify-vnext.mjs зелёные (кроме известного WorkbenchCapacityIntegrationTest); ADR 0009, docs/finance.md, контракты и jOOQ обновлены; PR открыт

## Передача

- **Состояние:** UI B2 собран и проверен на стенде 4387, скриншоты в scratchpad/finance-impl-shots
- **Сейчас:** S5 — гейты
- **Дальше:** npm test, verify-vnext, push, описание PR
- **Незакоммичено:** UI и DS — коммитится сейчас
- **Рабочая копия:** 31 файл(ов): libraries/iquipage/README.md, libraries/iquipage/scripts/gates/size-baseline.json, libraries/iquipage/src/styles/foundation.css, libraries/iquipage/tests/vnext30.test.cjs, products/sprintique/contracts/finance.ts, products/sprintique/docs/decisions/0009-finance-plan.md, products/sprintique/docs/finance.md, products/sprintique/docs/ux-ds-alignment.md, products/sprintique/package-lock.json, products/sprintique/server/src/integrationTest/kotlin/com/sprintique/finance/FinancePlanIntegrationTest.kt, products/sprintique/server/src/main/kotlin/com/sprintique/apidoc/ApiDocumentation.kt, products/sprintique/server/src/main/kotlin/com/sprintique/finance/api/FinancePlanController.kt и ещё 19 (28 files changed, 902 insertions(+), 110 deletions(-)) · HEAD 35dcf28
- **Ловушки:**
  - verify-vnext запускает npm test целиком; WorkbenchCapacityIntegrationTest (известный флейк) обрывает прогон до Node-сьютов — их гонять отдельно: node scripts/test.mjs --skip-integration
- **Причина:** planned — claude, 2026-10-02T15:36:05Z: PR #47; HEAD запушен; незакоммичено 0

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

### S3. Тесты [done]
- **Что:** HTTP и интеграционные тесты раздела 5
- **Как:** tests/finance-plan.test.ts, FinancePlanIntegrationTest
- **Зачем:** Приёмка
- **Приёмка:**
  - [x] тесты зелёные
- **Покрывает:** A1,A2,A3,A4
- **Итог:** FP01–FP10 зелёные; Node-сьюты 392/392; интеграционные 45/46 (падает только известный WorkbenchCapacityIntegrationTest)
- **Зависит от:** S2

### S4. UI диалога, документы, гейты, PR [done]
- **Что:** Категория в диалоге, переименования, ADR, docs, EXPLAIN, гейты
- **Как:** npm test, verify-vnext
- **Зачем:** Поставка
- **Приёмка:**
  - [x] гейты зелёные, PR открыт
- **Покрывает:** A5
- **Итог:** PR #47 открыт; гейты в описании PR
- **Зависит от:** S3

### S5. Интерфейс B2 «Шкала, тише» [active]
- **Что:** Обзор, журнал, редактор плана, диалог объяснения, DS vnext.30
- **Как:** ui/finance/src, libraries/iquipage scale/amount/tooltip/combobox, стенд и скриншоты
- **Зачем:** Владелец утвердил дизайн
- **Приёмка:**
  - [ ] кадры совпадают с B2, гейты зелёные кроме известного флейка

## Решения

- **D1** (2026-10-02) Миграции 072–075: категории+release_id (072), план/версии/строки (073), объяснения (074), политики чтения финансов через auth.projects_with один раз на запрос (075) — сводка на 100 000 операций 600 → 23 мс
- **D2** (2026-10-02) Строки черновика заменяются DELETE+INSERT: единственный DELETE runtime-роли в финансах, триггер разрешает его только для черновика — история правок черновика не нужна, утверждённое неизменно
- **D3** (2026-10-02) У объяснения добавлено direction к ключу спецификации: у категории both два отклонения; порог суммы = 1 минимальная единица до решения владельца; недобор дохода >10% тоже требует объяснения
- **D4** (2026-10-02) План на релиз сравнивается с операциями этого релиза; период и релиз плана после утверждения неизменны; finance-* события видят только люди с finance.read (раньше любой человек-участник)
- **D5** (2026-10-02) «Удалить черновик» из дизайна: команда POST …/discard и миграция 076 — DELETE только черновика (и плана, у которого кроме черновика ничего нет)
- **D6** (2026-10-02) DS vnext.30: scale()/ui.scale, ui.amount, строки «подпись<TAB>значение» в iq-tooltip и placement=bottom, iq-combobox creatable, label-hidden у combobox и date-field

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
