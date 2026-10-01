---
bridge: 1
id: 20261001-planning-containers
title: "Планирование R4.1: контейнеры, дерево эпиков, оценки, перенос удержанием (DS vnext.28)"
status: review
risk: high
owner: nvkv71
branch: feature/planning-containers
base: main
created: 2026-10-01
updated: 2026-10-01T23:09:17Z
links: https://github.com/it-novikov/iquipage-design-system/pull/43
---

# Планирование R4.1: контейнеры, дерево эпиков, оценки, перенос удержанием (DS vnext.28)

## Цель

Экран «Планирование» Sprintique заменяется утверждённым владельцем раундом 4.1 (макет scratchpad planning-r4/index.html): одна страница из карточек-контейнеров (идущий спринт, следующие спринты, релизы, бэклог), дерево эпиков в языке iq-tree, оценки во времени или SP по настройке проекта, перенос удержанием ряда между контейнерами с отменой, завершение спринта диалогом. Результат: работающий экран на сервере с переносом, суммами, политикой дат r4 и правами; DS 0.6.0-vnext.28 с T1–T4; скриншоты кадров макета.

## Рамки

- **Входит:** DS T1–T4 и релиз vnext.28; сервер (миграции V20261001000050–055, estimate, goal, estimateFormat, containers, move/undo, даты, завершение, права); новый UI; оценка в панели задачи; тесты; PR.
- **Не входит:** ёмкость, вкладки, фильтры, «показать ещё», таймлайн; мобильная вёрстка; редизайн списка свойств панели задачи (ветка feature/task-fields-list).
- **Ограничения:** миграции только 050–055; DS-версия vnext.28 (vnext.27 занята); не трогать чужие worktree и стенд; Docker только colima-sprintique-vnext-qa.

## Приёмка

Пока нет.

## Передача

- **Состояние:** Сервер, DS vnext.28, UI, панель задачи, тесты и кадры готовы; main (#40, #41) влит
- **Сейчас:** PR открыт, ждёт ревью владельца
- **Дальше:** Ревью PR; при необходимости перевести галочку готовых рядов в серый тон (одна строка DS)
- **Незакоммичено:** нет
- **Рабочая копия:** 1 файл(ов): products/sprintique/ui/planning/src/index.js (3 files changed, 10 insertions(+), 6 deletions(-)) · HEAD b43f75e
- **Ловушки:**
  - Старый UI планирования используется вне ui/planning: web/release-create.js и web/planning-host.js (operation.js, dialog.js, release-dialogs.js), web/settings.js (settingsDialog, timeZoneField), web/main.js (project-navigation.js, navigation.css, planning.css), тесты planning-operation, task-plan-field, planning-controller, frontend-lifecycle (temporal-*, markup.js)
  - WorkbenchCapacityIntegrationTest — порог времени, падает под нагрузкой и на main
- **Проверка:** products/sprintique: TEST_S3_CONFIG=… npm test; корень: LC_ALL=C TEST_S3_CONFIG=… node scripts/verify-vnext.mjs

## План

### S1. DS T1–T4 и релиз vnext.28 [done]
- **Что:** iq-tree: колонки, статус-глиф, перенос удержанием, черта Готово, приглушённый ряд; релиз 0.6.0-vnext.28 и принятие в продукте
- **Как:** libraries/iquipage, отдельный worktree planning-r4-ds
- **Зачем:** DS-GAP-T1..T4 из макета R4.1
- **Приёмка:**
  - [x] тесты DS зелёные
  - [x] vnext.28 в vendor продукта
- **Итог:** DS 0.6.0-vnext.28 на vnext.27 из PR #41: tree-columns, statusGlyph, bindTreeDrag, tree-divider; 396/396 тестов DS

### S2. Сервер: проекция контейнеров, перенос, оценки, политика дат, завершение [done]
- **Что:** миграции 050–055, estimate, goal, planning.estimateFormat, /planning/view/containers, /planning/view/move + undo, r4-политика дат, завершение с исключениями, права
- **Как:** worktree planning-r4-server
- **Зачем:** API макета §8
- **Приёмка:**
  - [x] интеграционные тесты переноса, сумм, формата, завершения, прав
- **Итог:** containers/move/undo, оценки, цель, r4.0, завершение; миграция V20261001000050; planning-containers.test.ts C01–C08

### S3. UI Планирования R4.1 [done]
- **Что:** контейнеры, дерево, выделение, DnD, клавиатура, даты, оценки, диалог завершения, состояния; оценка в панели задачи; формат оценок в настройках
- **Как:** ui/planning/src заново, web/planning-*
- **Зачем:** утверждённый макет
- **Приёмка:**
  - [x] скриншоты 8 кадров
  - [x] UI unit-тесты
- **Итог:** новый экран, оценка в панели после «Приоритета», 8 кадров в planning-impl-shots

### S4. Гейты, самопроверка, PR [active]
- **Что:** npm test продукта, verify-vnext, два прохода ревью, PR
- **Как:** Node 24, TEST_S3_CONFIG
- **Зачем:** приёмка
- **Приёмка:**
  - [ ] оба гейта зелёные

## Решения

- **D1** (2026-10-01) Готовая галочка в приглушённых рядах — в тоне success, как в ds.md и в формулировке владельца «success check»; в утверждённом кадре r41 она серая — переключается одной строкой CSS DS
- **D2** (2026-10-01) Значения ячеек — 13 px (label), как в утверждённом макете; ds.md говорил meta (12 px) — макет главнее
- **D3** (2026-10-01) DS собран поверх библиотеки из ветки PR #41 (vnext.27, c3be5b2): vnext.28 включает её изменения; если #41 сольют позже, конфликт в libraries/iquipage решается в пользу этой ветки
- **D4** (2026-10-01) Серверные проекции старого экрана (groups/rows/timeline/selection/options) оставлены: это публичный API; удалён только старый UI и его тесты

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
