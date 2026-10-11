---
bridge: 1
id: 20261011-task-materials
title: "SPR-16: дизайн и документация задачи"
status: active
risk: high
owner: human:it-novikov
branch: feat/task-materials
base: main
created: 2026-10-11
updated: 2026-10-11T13:13:58Z
links:
---

# SPR-16: дизайн и документация задачи

## Цель

Человек находит несколько макетов и документов прямо в задаче. Пустые группы занимают только компактные действия добавления; заполненные содержат именованные ссылки без длинных адресов и лишних инструкций.

## Рамки

Реализовать HTTP(S)-материалы двух категорий, серверное сохранение, изменение, архив и восстановление, новые/существующие задачи и все состояния. UI выполняет GPT6 Astra через exact публичную DS. Root выполняет контракт, backend, миграцию, права и поставку. Вики и её права отдельно в SPR-17. Не менять описание, файлы, связи задач и принятые отступы.

## Приёмка

- [ ] A1. Пустой, заполненный и readonly интерфейс компактен; несколько ссылок открываются и сохраняются после reload.
- [ ] A2. Изменение, перенос категории, архив/восстановление, ошибки и новый task draft не теряют пользовательский текст и фокус.
- [ ] A3. Существующие права задачи, initiator/grant и RLS соблюдаются; accepted result защищён; безопасный URL, CAS и idempotency проверены.
- [ ] A4. Exact DS, contracts/build/test, два независимых ревью и полный gate на неизменном source пройдены.
- [ ] A5. PR слит, резервная копия и совместимый rollback проверены; образ, readiness и production-сценарий подтверждены.

## Передача

- **Состояние:** API11/11 UI43/43 pass; URI R1 closed; generated jOOQ078 updated. Isolated077->078 upgrade and compatible backend with prior web retain old task and post-upgrade material.
- **Сейчас:** Full gate rerun with required QA S3; build main/fallback amd64 images.
- **Дальше:** Independent final reviews on full gate and container rollback proof.
- **Рабочая копия:** 29 файл(ов): products/sprintique/scripts/export-contracts.ts, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/App.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/indexes/Indexes.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/keys/Keys.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Tasks.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/references/Tables.kt, products/sprintique/server/src/main/resources/contracts/public-schemas.json, products/sprintique/tests/dev-seed.ts, products/sprintique/tests/frontend-lifecycle.test.mjs, products/sprintique/ui/src/board/board.css, products/sprintique/ui/src/board/task-dialog.js, products/sprintique/web/repository.js и ещё 17 (12 files changed, 522 insertions(+), 18 deletions(-)) · HEAD 01bbdb2
- **Ловушки:**
  - Worktree had no output/infra/storage.json; pass absolute TEST_S3_CONFIG from existing owned QA stand or notification worker tests cannot run.

## План

### S1. Контракт и сервер [done]
- **Что:** Независимый агрегат материалов с migration078 и typed HTTP.
- **Как:** PlanningStates.lock, существующие capabilities, RLS, CAS, ledger, audit/outbox в одной транзакции; meaningful security/concurrency tests.
- **Зачем:** Не смешивать материалы с описанием и не терять данные при повторе или чужом редактировании.
- **Приёмка:**
  - [x] Backend, контракт, ADR и безопасный rollback реализованы и проверены.
- **Покрывает:** A3
- **Итог:** Контракт и ADR проверены, API11/11; actual078 контейнер и резервный интерфейс сохраняют задачу и материал.

### S2. Интерфейс [done]
- **Что:** Компактные дизайн/документация после описания.
- **Как:** Astra по TASK-MATERIALS-UI.md, root предоставляет repository API; реальные desktop/mobile, темы и клавиатура на synthetic backend.
- **Зачем:** Найти материал одним действием, добавить без цепочки меню.
- **Приёмка:**
  - [x] Новая и существующая задача, ошибка, повтор, конфликт и readonly проверены.
- **Покрывает:** A1,A2
- **Итог:** Astra: meaningful UI43/43, actual synthetic создание, правка, конфликт, архив, повтор и mobile/themes.

### S3. Приёмка и поставка [active]
- **Что:** Ревью, gate, слияние и выкладка.
- **Как:** Два независимых ревью, exact image, backup, compatible078 fallback, минимум пять минут наблюдения.
- **Зачем:** Доставить проверенный результат с сохранением данных.
- **Приёмка:**
  - [ ] Все проверки, слияние, rollback proof и production подтверждены.
- **Покрывает:** A4,A5
- **Зависит от:** S1,S2

## Решения

Разрешение владельца на реализацию, push, merge и deploy дано в чате. Отдельная ветка основана на проверенном head PR67, его слияние необходимо перед публикацией SPR-16. Риск high из-за нового контракта и схемы. TASK-MATERIALS-CONTRACT.md фиксирует текущие инженерные пределы, безопасность URL, права и защиту принятого результата. Перед runtime дополнить ADR реальной канонизацией и retry semantics. Не считать исследования свидетельством реализации.

## Контекст

Существующие TASKS_READ/WRITE и текущие права инициатора; не создавать новый доступ. Выборка только одной задачи с пределом100 активных материалов. Прежний ledger077 несовместим с078: fallback обязан поддерживать078, его проверяем изолированно до production. После выкладки обратная миграция не используется. Условие отката: readiness, image/web mismatch, повторные ошибки или restarts; сохранить базу и новые материалы. Native work plan ведётся собственной учёткой Codex, approval человека не выставлять.

## Вопросы

Для SPR-16 открытых вопросов нет. Wiki targets и выбор доступа SPR-17 в этот контракт не входят.
