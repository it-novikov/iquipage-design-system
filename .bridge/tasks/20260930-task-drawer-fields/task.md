---
bridge: 1
id: 20260930-task-drawer-fields
title: "Drawer задачи: сетка фактов (направление D) и поле интервала плана"
status: review
risk: standard
owner: nvkv71
branch: feature/task-drawer-fields
base: main
created: 2026-09-30
updated: 2026-09-30T18:28:56Z
links:
---

# Drawer задачи: сетка фактов (направление D) и поле интервала плана

## Цель

Какая проблема, у кого и какой проверяемый результат нужен. 2–6 предложений.

## Рамки

- **Входит:** …
- **Не входит:** …
- **Ограничения:** …

## Приёмка

- [x] A1. Блок свойств drawer — сетка фактов по handoff §2: главный ряд Статус·Исполнитель·Срок, затем Приоритет·Тип·Релиз, План·Родитель, Теги во всю ширину; Тип и Релиз всегда; пустые значения тихие и на месте; каждое поле правится в один клик; нет строк-на-поле и «Ещё поля»
- [x] A2. План (plannedStart/plannedEnd) правится в drawer полем интервала (композиция продукта tdr-date-range по §4, DS-GAP-G записан) через существующую команду планирования schedule с preview, CAS и идемпотентностью; правило начало ≤ срок объяснено словами
- [x] A3. Телефон 2 колонки, тёмная тема, только чтение без disabled-контролов, порядок Tab = DOM, Escape возвращает фокус, одна сильная метка — пилюля статуса; шапка drawer не тронута (кроме нужного сетке)
- [x] A4. Проверено на локальном запуске 1440 светлая/тёмная и 390 на заполненной, пустой и перегруженной задачах и в состояниях редактирования; сверено с артефактом; независимое ревью, обоснованное исправлено
- [x] A5. Гейты зелёные без пропусков: npm test продукта, Kotlin unit+integration, корневой verify-vnext; PR в main открыт, не слит

## Передача

- **Состояние:** R1 исправлено, npm test 232/232 до исправлений, verify-vnext PASS до исправлений
- **Сейчас:** S3 — коммит и финальные гейты
- **Дальше:** verify-vnext на коммите, push, PR
- **Незакоммичено:** компилируется, check:styles зелёный, node --test tests/task-plan-field.test.mjs 9/9
- **Рабочая копия:** 11 файл(ов): products/sprintique/docs/ux-ds-alignment.md, products/sprintique/ui/planning/src/operation.js, products/sprintique/ui/src/board/board.css, products/sprintique/ui/src/board/catalog-picker.js, products/sprintique/ui/src/board/task-dialog.js, products/sprintique/web/main.js, products/sprintique/web/planning-host.js, products/sprintique/docs/task-drawer/, products/sprintique/tests/task-plan-field.test.mjs, products/sprintique/ui/src/board/plan-field.js, products/sprintique/ui/src/board/plan-range.js (7 files changed, 237 insertions(+), 56 deletions(-)) · HEAD 2a44351

## План

### S1. Сетка фактов [done]
- **Что:** Перестроить .task-editor-properties в сетку tdr-facts: 9 плиток, родитель из «Связей» в сетку, полноэкранный режим — блок под названием
- **Как:** task-dialog.js, catalog-picker.js, board.css; DS-компоненты внутри .iq-properties[data-columns], раскладка плиток — композиция tdr-
- **Зачем:** Решение владельца: направление D
- **Приёмка:**
  - [x] 9 плиток в порядке handoff
  - [x] check:styles зелёный
- **Покрывает:** A1,A3
- **Итог:** сетка фактов проверена на стенде :4977: 1440 светлая/тёмная, 390, пустая/заполненная/перегруженная, только чтение, полноэкранный; check:styles PASS

### S2. Поле интервала плана [done]
- **Что:** Композиция tdr-date-range: триггер, попап с полями, календарём диапазона, пресетами, помощью; применение через команду schedule
- **Как:** ui/src/board/date-range-field.js + host hook в web (PlanningOperation: preview → commit, журнал идемпотентности)
- **Зачем:** DS-GAP-G: в DS нет iq-date-range-field
- **Приёмка:**
  - [x] План сохраняется и виден в Плане
  - [x] Отмена/Escape не меняют значение
- **Покрывает:** A2
- **Итог:** plan-field.js/plan-range.js; e2e: применение в пределах срока без диалога, поздний план через диалог проверки, создание задачи с планом (SPQ-15), Escape без изменений; tests/task-plan-field.test.mjs 9/9
- **Зависит от:** S1

### S3. Проверка, ревью, гейты, PR [done]
- **Что:** Локальный запуск, сверка с артефактом, независимое ревью, гейты, PR
- **Как:** стенд в colima-sprintique-vnext-qa или локальный dev:local; subagent read-only; verify-vnext
- **Зачем:** Доказательство качества
- **Приёмка:**
  - [x] Скриншоты 1440 светлая/тёмная, 390
  - [x] Гейты зелёные
- **Покрывает:** A4,A5
- **Итог:** 565bd62; verify-vnext PASS 2026-09-30T18-21-29Z (product npm test 233/233, Kotlin integration 32/32, unit 63 up-to-date), check:styles PASS; ревью R1 исправлено
- **Зависит от:** S2

## Решения

- **D1** (2026-09-30) План в drawer сохраняется командой планирования schedule через PlanningOperation (preview → commit, журнал идемпотентности): без второго подтверждения, если preview меняет только задачу; иначе (риск срока, другие эффекты, блокер, устаревший preview) — диалог проверки — существующий путь CAS/идемпотентности, без нового API
- **D2** (2026-09-30) planned_start ≤ due — предупреждение словами, не блокировка: ограничение снято на сервере миграцией V20260927000006
- **D3** (2026-09-30) Исполнитель — iq-select searchable с аватарами вместо iq-combobox — пустое значение без лупы, закрытое поле читается как значение
- **D4** (2026-09-30) Раскладка плиток — только на хостах DS-компонентов внутри .iq-properties[data-columns]; подписи 13px DS вместо 12px — граница DS/check:styles; отступления записаны в fields-handoff.md §7 и DS-GAP-F/G/J/L/M

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
