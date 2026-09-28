---
bridge: 1
id: 20260928-planning-list-redesign
title: "Раздел «Планирование»: список релизов и задач заново"
status: review
risk: standard
owner: it-novikov
branch: feature/planning-list-redesign
base: feature/kotlin-backend
created: 2026-09-28
updated: 2026-09-28T08:58:40Z
links:
  - https://github.com/it-novikov/iquipage-design-system/pull/19
  - https://claude.ai/artifact/LVmWeMMnjeY3p5XiTEkaj5
---

# Раздел «Планирование»: список релизов и задач заново

## Цель

Раздел «Планирование → Список» не соответствует уровню продукта: контейнеры релизов и спринтов — тяжёлые карточки с трёхъярусной шапкой, факты не выровнены, связь родительской задачи и подзадач нарисована «ёлочкой» из линий и заливок, приоритет закодирован только цветом названия, мягкие бейджи статусов нечитаемы в тёмной теме, а разметка копирует композиции IQUIPAGE вместо того, чтобы их переиспользовать. Совет (продуктовый дизайнер с UX-исследователем, арт-директор, продакт, DS-лид) разобрал раздел по скриншотам и коду; отчёты — в `.bridge/tasks/20260928-planning-list-redesign/reviews/`.

Результат: список переделан на публичных композициях и токенах DS 0.6.0-vnext.20 без изменения DS, с полным паритетом функций, читаемый в обеих темах и на 390px, с иерархией в языке доски («готово N из M», раскрытие без линий) и одним главным действием на контейнер.

## Рамки

- **Входит:**
  - `ui/planning/src/{index,markup,group-header,planning}.{js,css}`: шапка в два ряда, секции релизов/спринтов/бэклога на канве (`.iq-section`-анатомия), строка задачи с сигналом типа/приоритета, ключом-текстом, ручкой ⋮⋮, тонированным сроком, `ui.personAvatar`, «готово N из M» у родителя, отступ без линий для подзадач, `.iq-empty.compact`, плавающая панель выделения, автоподгрузка групп.
  - `quick-field.js`: поле «Приоритет» тем же preview/commit-контрактом.
  - Один изолированный additive-коммит в `PlanningView.kt`: `done`, `doneChildrenCount`, `parentTitle` у строки; `drafts`, `unassigned` у группы. Поля необязательные, UI работает и без них.
  - `model.js`: новые поля как необязательные; unit-тесты на чистые помощники разметки; `docs/ux-ds-alignment.md` (раздел Planning).
- **Не входит:** домен, команды, миграции, `ViewIntent`/`ViewFilters`, Гант и Календарь (`temporal-*`), диалоги релизов и операций, DS (`vendor/*.tgz`, `libraries/iquipage`), статус и теги в строке, группировка бэклога, изменения доски.
- **Ограничения:**
  - Только публичные классы и токены DS; `npm run check:styles` зелёный; никаких `color-mix`, raw px и inline-стилей.
  - Нативная `<table>`-семантика, `data-*` контракт DS-драга и `decorate()` не переименовывать; `columns`/`estimate` `TableWindow` синхронны с разметкой.
  - База — `feature/kotlin-backend` (PR #17, там параллельно работает другой агент): серверный коммит один и маленький, сид и документация — в конце.

## Приёмка

- [x] A1. A1. Паритет: все интенты списка доступны как раньше (prepare/unprepare/take, move drag+диалог, reorder, bulk, start, edit/close/cancel/history релиза, выбор по условиям, quick-edit owner/due/priority); V01–V09 planning-view зелёные
- [x] A2. A2. Клавиатура и семантика: каждый интент строки достижим Tab/Enter, Shift-диапазон, фокус восстанавливается по data-focus, :focus-visible виден, нативная <table>
- [x] A3. A3. Сигналы в строке видны без hover: приоритет high/critical, тип epic/bug, черновик, просрочка/сегодня, «готово N из M» у родителя; контраст ≥4.5:1 в обеих темах
- [x] A4. A4. 390px: ключевые поля строки без горизонтального скролла, цели ≥44px, страница скроллится целиком
- [x] A5. A5. Стиль: npm run check:styles PASS; только публичные классы/токены DS, без color-mix, raw px, inline-стилей
- [ ] A6. A6. Тесты: консьюмерские unit-тесты и npm test зелёные; новые тесты на помощники разметки
- [x] A7. A7. Производительность: 250+ строк в группе — windowing включается, estimate соответствует высоте строки, скролл без скачков
- [x] A8. A8. Совместимость: UI работает с сервером без новых полей проекции

## Передача

- **Состояние:** S1–S5 готовы; PR #19 черновик
- **Сейчас:** Ожидание ревью владельца
- **Дальше:** Владелец решает: запустить полный npm test и открыть DS-GAP по .iq-badge.soft.warning/.success в libraries/iquipage
- **Незакоммичено:** нет
- **Рабочая копия:** нет · HEAD 5b8a797 · снято 2026-09-28T08:58:40Z
- **Ловушки:**
  - Стенд после перезапуска сервера теряет сессию браузера: войти заново кнопкой «войти как admin»
  - Playwright для снимков берётся из /Users/nvkv71/Desktop/Skillotheque/Sprintique/node_modules (абсолютный import), скрипт scratchpad/capture.mjs
- **Причина:** planned — claude, 2026-09-28T08:58:40Z: Полный гейт npm test и DS-GAP — на решение владельца

## План

### S1. Бриф и рамки [done]
- **Что:** Свести отчёты совета в один бриф, сохранить отчёты и скриншоты «до» в карточку
- **Как:** reviews/*.md, before-*.png
- **Зачем:** Решения должны быть проверяемы после сессии
- **Приёмка:**
  - [x] Отчёты и скриншоты «до» лежат в reviews/, решения записаны
- **Покрывает:** A5
- **Итог:** reviews/UX.md, AD.md, PM.md, DS.md и 4 снимка «до» в карточке; решения 1–4 записаны

### S2. Проекция: additive-поля [done]
- **Что:** done, doneChildrenCount, parentTitle у строки; drafts, unassigned у группы
- **Как:** PlanningView.kt + assert в V01; ./gradlew check; отдельный коммит
- **Зачем:** Иерархия и факты готовности без клиентского пересчёта по страницам
- **Приёмка:**
  - [x] Поля приходят в rows/groups, V01 проверяет их; ./gradlew check зелёный
- **Покрывает:** A8
- **Итог:** PlanningView.kt: done, doneChildrenCount, parentTitle (строка), drafts, unassigned (группа); assert в V01; ktlint, detekt, compileKotlin зелёные

### S3. Список заново [done]
- **Что:** index/markup/group-header/planning.css/model/quick-field
- **Как:** публичные композиции DS; стенд 4341; скриншоты после
- **Зачем:** Основной результат задачи
- **Приёмка:**
  - [x] Стенд 4341: скриншоты после в обеих темах и на 390px, все интенты доступны
- **Покрывает:** A1,A2,A3,A4,A5
- **Итог:** markup.js, group-header.js, planning.css, index.js, model.js переписаны; check:styles PASS; 44/44 unit; стенд 4341: выделение диапазоном, drag за ручку → диалог состава, раскрытие эпика, quick-edit срока; снимки после в reviews/

### S4. Проверки [done]
- **Что:** check:styles, unit-тесты, npm test, 250 строк, обе темы, 390px
- **Как:** команды из «Контекст»; playwright-снимки
- **Зачем:** Release gate
- **Приёмка:**
  - [x] check:styles PASS, unit-тесты и npm test зелёные, 250 строк без скачков
- **Покрывает:** A6,A7
- **Итог:** check:styles PASS; unit 44/44; HTTP planning-view + planning 77/77 против Kotlin; ktlint/detekt/compileKotlin зелёные; 254 строки: 18–19 в DOM, кадр 11 мс; снимки светлая/тёмная/390px в reviews/

### S5. Документация и PR [done]
- **Что:** ux-ds-alignment.md, карточка, PR на feature/kotlin-backend
- **Как:** gh pr create --draft
- **Зачем:** Передача владельцу
- **Приёмка:**
  - [x] PR открыт, карточка в review
- **Покрывает:** A1
- **Итог:** PR #19 (draft) на feature/kotlin-backend: https://github.com/it-novikov/iquipage-design-system/pull/19; ux-ds-alignment.md дополнен

## Решения

- **D1** (2026-09-28) Контейнеры — секции на канве, не карточки — принцип DS «Ритм сильнее оболочки. Не каждому элементу нужна карточка» и мнение арт-директора; состояние передаёт бейдж, не рамка и не фон
- **D2** (2026-09-28) Подзадачи — отступ без линий и заливок, родитель показывает «готово N из M» — язык доски и iq-relation-map; линии рвутся на страницах и windowing
- **D3** (2026-09-28) DS-GAP: .iq-badge.soft.warning и .soft.success нечитаемы (--iq-warning-bg/--iq-success-bg равны fill), в тёмной теме текст исчезает — продукт временно переопределяет эти две пары токенами --iq-tag-amber/-green, DS нужно исправить в следующей версии
- **D4** (2026-09-28) Быстрые правки остаются диалогами preview/commit (добавлен приоритет); поповеры — отдельная задача, чтобы не менять контракт операций
- **D5** (2026-09-28) Быстрая правка приоритета в строке не добавлена: в строке нет колонки приоритета, а для выделения уже есть «Изменить приоритет» в панели — иначе появилась бы третья точка входа без места

## Вопросы

Пока нет.

## Контекст

- Отчёты совета: `.bridge/tasks/20260928-planning-list-redesign/reviews/` (UX.md, AD.md, PM.md, DS.md).
- Скриншоты «до»: `reviews/before-*.png`.
- Код: `products/sprintique/ui/planning/src/`, хост `web/planning-host.js`, проекция `server/.../planning/application/PlanningView.kt`.
- Стенд: `cd products/sprintique && npm run build && LC_ALL=C LANG=C PREVIEW_PORT=4341 node scripts/test.mjs --preview` (JDK 25 в `/opt/homebrew/opt/openjdk@25`), вход admin/admin, `#planning`.
- Проверки: `npm run check:styles`; `LC_ALL=C node --import tsx --test tests/planning-controller.test.mjs tests/planning-operation.test.mjs tests/frontend-lifecycle.test.mjs`; полный гейт `npm test`.
