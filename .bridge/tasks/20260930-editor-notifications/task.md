---
bridge: 1
id: 20260930-editor-notifications
title: "Релиз 1.0: ссылки при вставке (SPR-5), автоскрытие уведомлений (SPR-8), пустой шаблон описания (SPR-12)"
status: active
risk: standard
owner: nvkv71
branch: feature/editor-notifications
base: main
created: 2026-09-30
updated: 2026-09-30T21:02:42Z
links:
---

# Релиз 1.0: ссылки при вставке (SPR-5), автоскрытие уведомлений (SPR-8), пустой шаблон описания (SPR-12)

## Цель

Три задачи владельца из релиза Sprintique «Релиз 1.0». SPR-5: вставленная в Markdown-редактор ссылка сразу становится ссылкой. SPR-8: уведомления в правом нижнем углу («Задача создана») не исчезали — должны уходить сами, с паузой при наведении и фокусе. SPR-12: нетронутый текст шаблона описания при создании задачи не сохраняется. Результат: DS 0.6.0-vnext.25 принят в продукте, проверено в браузере, гейты зелёные, PR в main.

## Рамки

- **Входит:** DS `iq-markdown-editor`, инлайн-редактор текста карты, политика URL рендера Markdown (http, mailto), DS `notify()`; продукт — диалог новой задачи и помощник шаблонов; релиз DS и принятие tarball.
- **Не входит:** автоссылки для голых URL в рендере (GFM), новый визуальный дизайн уведомлений, серверные изменения.
- **Ограничения:** версия DS после vnext.24 (PR #24 влит); локальная волна 2 планировала vnext.25 — ей нужна следующая; Docker только через colima-sprintique-vnext-qa; чужие стенды и output/infra не трогать.

## Приёмка

- [ ] A1. SPR-5: вставка http(s)/mailto-ссылки в iq-markdown-editor и инлайн-редактор карты: без выделения — ссылка с адресом в тексте, поверх выделения — [текст](url); обычный текст без изменений; отмена одним шагом; ссылка кликабельна в предпросмотре
- [ ] A2. SPR-8: DS notify скрывается сам: info/success 5 с, warning 8 с, danger 10 с; действие-переход (Открыть) 10 с; действие-отмена (undo) остаётся до закрытия; пауза при наведении/фокусе/скрытой вкладке; Escape и кнопка закрывают; role status/alert; reduced motion
- [ ] A3. SPR-12: новая задача с нетронутым текстом шаблона (любой тип и стартовый шаблон, пробелы нормализованы) сохраняется с пустым описанием; любое изменение — сохраняется всё
- [ ] A4. DS 0.6.0-vnext.25 (после vnext.24 из PR #24) собран, протестирован, упакован в vendor продукта; старый tarball удалён; lockfile обновлён
- [ ] A5. Проверено в браузере на локальном запуске; независимое read-only ревью, обоснованное исправлено; гейты зелёные без пропусков (DS npm test, продукт npm test + Kotlin, verify-vnext); PR в main открыт, не слит

## Передача

- **Состояние:** Ревью R1: 3×P2 и P3 исправлены (ссылки не ломаются, многострочные выделения, docs URL, resume, duration, фокус, !task, legacyChecklists); DS npm test 385/385; повторная проверка в браузере ОК; стенд остановлен
- **Сейчас:** S5 — гейты
- **Дальше:** npm test продукта, verify-vnext, коммит, PR
- **Незакоммичено:** DS+продукт, компилируется, тесты зелёные
- **Рабочая копия:** 27 файл(ов): libraries/iquipage/PROVENANCE.json, libraries/iquipage/README.md, libraries/iquipage/docs/DAILY-WORK-API.md, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/modules/app.js, libraries/iquipage/src/modules/components.js, libraries/iquipage/src/modules/editor.js, libraries/iquipage/src/modules/markdown.js, libraries/iquipage/src/modules/whiteboard-studio.js, libraries/iquipage/tests/markdown056.test.cjs и ещё 15 (24 files changed, 198 insertions(+), 51 deletions(-)) · HEAD f25dff0
- **Ловушки:**
  - Локальный стенд: PREVIEW_PORT=4417 JAVA_HOME=/opt/homebrew/opt/openjdk@25 LC_ALL=C npm run dev:local; порт 4391 занят чужим стендом
  - Уведомление под неподвижным указателем: Chrome шлёт синтетический pointermove при смене раскладки — пауза только после сдвига указателя ≥4px
  - Стенд на localhost делит cookie с чужими стендами (порт не различается) — поднимать с PREVIEW_API_NAME=1 и открывать 127.0.0.1

## План

### S1. SPR-5 ссылка при вставке [done]
- **Что:** Обработчик paste в iq-markdown-editor и в инлайн-редакторе карты; общий чистый помощник в markdown.js; рендер http/mailto
- **Как:** markdown.js markdownPasteLink + safeMarkdownURL; editor.js; whiteboard-studio.js; тесты DS
- **Зачем:** SPR-5
- **Приёмка:**
  - [x] тесты DS зелёные
  - [x] проверено в браузере
- **Покрывает:** A1
- **Итог:** markdownPasteLink + pasteLink в editor.js и whiteboard-studio.js; tests/vnext25.test.cjs; DS npm test 380/380 (браузер — в S5)

### S2. SPR-8 автоскрытие уведомлений [done]
- **Что:** Длительности по тону, undo-действие до закрытия, пауза при скрытой вкладке, Escape
- **Как:** components.js notify, types/core.d.ts, demo-вызовы undo:true
- **Зачем:** SPR-8
- **Приёмка:**
  - [x] тесты DS зелёные
  - [x] проверено в браузере
- **Покрывает:** A2
- **Итог:** toastDuration/TOAST_DURATION, пауза hover/focus/hidden, Escape; DS npm test 380/380

### S3. SPR-12 пустой шаблон [done]
- **Что:** Нетронутый шаблон описания при создании задачи сохраняется пустым
- **Как:** task-templates.js withoutUntouchedTemplate + task-dialog.js; tests/task-templates.test.mjs
- **Зачем:** SPR-12
- **Приёмка:**
  - [x] тест продукта зелёный
  - [x] проверено в браузере
- **Покрывает:** A3
- **Итог:** withoutUntouchedTemplate в task-templates.js, task-dialog.js; tests/task-templates.test.mjs 5/5 (браузер — в S5)

### S4. Релиз DS vnext.25 и принятие в продукте [done]
- **Что:** Версия, сборка, npm pack в vendor, lockfile
- **Как:** рецепт BOUNDARIES
- **Зачем:** Граница DS/продукт
- **Приёмка:**
  - [x] npm test DS зелёный
- **Покрывает:** A4
- **Итог:** DS 0.6.0-vnext.25: npm test 380/380, npm pack в vendor, vnext.24.tgz удалён, lockfile integrity пересчитан, npm ci + build + check:boundaries PASS
- **Зависит от:** S1,S2

### S5. Проверка, ревью, гейты, PR [active]
- **Что:** Браузер, ревью subagent, гейты, PR
- **Как:** локальный стенд; verify-vnext
- **Зачем:** Доказательство
- **Приёмка:**
  - [ ] гейты зелёные
  - [ ] PR открыт
- **Покрывает:** A5
- **Зависит от:** S3,S4

## Решения

- **D1** (2026-09-30) SPR-5: safeMarkdownURL теперь пропускает http: и mailto: (раньше только https) — задача требует http(s)/mailto-ссылок, а без этого вставленная http-ссылка не стала бы кликабельной; учётные данные, пробелы, обратные слэши и прочие схемы по-прежнему отклоняются, mailto открывается без target=_blank
- **D2** (2026-09-30) SPR-5: без выделения вставляется автоссылка <url> (текст = URL, без экранирования _ и *), поверх выделения — [текст](url) с экранированием [] и (); внутри кода, в адресе ссылки, поверх URL и через абзацы — обычная вставка
- **D3** (2026-09-30) SPR-8: info/success 5 с, warning 8 с, danger 10 с, действие-переход (Открыть) 10 с; только action.undo держит уведомление до закрытия (окно отмены A11Y-01 сохранено); демо-вызовы «Отменить» в DS помечены undo:true
- **D4** (2026-09-30) Версия DS 0.6.0-vnext.25: PR #24 (vnext.24) влит в main; локальная волна 2 планировала vnext.25 — при её выпуске нужна vnext.26

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
