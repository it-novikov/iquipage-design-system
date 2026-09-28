# Рамки переделки «Планирование → Список» (Sprintique)

Источники: скриншоты before-*, `contracts/planning-view.ts`, `PlanningView.kt`/`ViewText.kt`, `ui/planning/src/*`, тесты, `AGENTS.md`, `engineering/workflow.md`, карточка `.bridge/tasks/20260928-planning-list-redesign` (пустая, `risk: standard`, base `feature/kotlin-backend`).

## 1. Job stories

| # | Когда… я хочу… чтобы… | Приоритет |
|---|---|---|
| J1 | открываю список — сразу видеть, что горит (просрочено, критично, черновик в релизе), чтобы решить, куда идти | P0 |
| J2 | собираю спринт — выделить пачку в бэклоге и перенести/подготовить, чтобы состав сложился без диалогов на каждую | P0 (паритет) |
| J3 | смотрю на эпик — видеть «готово N из M» подзадач, не раскрывая дерево | P1 |
| J4 | триажу бэклог — сменить приоритет/исполнителя/срок в строке, не открывая карточку | P1 |
| J5 | в проекте 200+ задач — скроллить и выделять без подтормаживаний | P1 |
| J6 | отфильтровал по тегу/исполнителю — видеть теги в строке, чтобы понимать, почему задача здесь | P2 |
| J7 | с телефона — видеть номер и ключевые поля в одной компактной строке (сейчас на 390px номер скрыт, чекбокс оторван от названия) | P2 |

## 2. Функциональные пробелы

Что сервер уже отдаёт в `viewRow`: `type, priority, preparation, statusLabel, ownerId/Label, dueValue, childrenCount, depth, outcome, selectable, contextOnly, parentContext`. Не отдаёт: `tagIds` (есть в `PlanningRow`), «готово детей», флаг просрочки. В `group` уже есть `done` и для бэклога — UI его прячет (`!backlog&&` в `group-header.js`).

| Пробел | Ценность | Стоимость | Решение |
|---|---|---|---|
| Приоритет и тип видны только цветом заголовка (`data-task-emphasis`: critical/high/epic; low/normal неотличимы, легенды нет) | J1, J4 | UI-only: `.iq-priority`/`.iq-badge.soft`/`.iq-work-list-type` в `rowMarkup` | **В этот раз** |
| «Просрочено»/«сегодня» на строке | J1 | UI-only: `dueValue < today` и строка не done; тон как в drawer (красный/янтарный); `today()` уже есть в `group-header.js` | **В этот раз** |
| «Готово N из M» у родителя | J3 | Проекция: в `rows()` рядом с `childCounts` добавить `doneChildCounts` через `isDone`, поле `doneChildrenCount` в `viewRow` (~6 строк, additive; семантика та же — считаются дети внутри группы). UI показывает счётчик только если поле пришло | **В этот раз**, отдельным мини-коммитом (см. риски) |
| Быстрая смена приоритета в строке | J4 | UI-only: `quickFieldDialog` уже шлёт `bulk` с `taskIds:[one]`; расширить `['owner','due']` на `priority` (`iq-select`) | **В этот раз** |
| Быстрая смена статуса | J4 | Нужна команда: в `ViewIntent` нет смены статуса (только `taskEdit` с полным `TaskInput`) | **Потом** |
| Теги в строке / быстрая правка тегов | J6 | Проекция (`tagIds` из `PlanningRow`) + справочник имён/цветов (`options kind:'tags'` без тона) + `iq-tag` | **Потом** (P2; не расширять контракт в этой задаче) |
| Кнопка «Показать задачи» у групп вне экрана | J5 | UI-only: `IntersectionObserver` уже грузит при подходе; заменить кнопку на скелет `.iq-loading`, оставив `data-load` для ретрая | **В этот раз** |
| Итоги по бэклогу | J1 | UI-only для «Готово N из M» (поле есть). «Просрочено/без срока/черновиков» — нужна проекция (страницы по 200, клиентский подсчёт врёт) | «Готово» — **в этот раз**; счётчики — **потом** |
| Группировка внутри бэклога (по эпику/исполнителю/приоритету) | J2 | Нужен `groupBy` в `ViewFilters` = контракт → high risk; клиентская группировка ломается на пагинации и windowing | **Потом** |
| Мобильная строка без номера | J7 | UI-only (`planning.css`, `rowMarkup`) | **В этот раз** |

## 3. Не входит

Домен, команды, миграции, `ViewIntent`/`ViewFilters`, Гант/Календарь (`temporal-*`), диалоги (`dialog.js`, `release-dialogs.js`, `quick-field.js` кроме добавления поля `priority`), DS (`vendor/*.tgz`), адаптер `web/planning-adapter.js` (кроме проброса нового поля, если он валидирует). Единственное исключение на сервере — additive read-only поле `doneChildrenCount` в `viewRow`.

## 4. Приёмка

- **A1 Паритет.** Все интенты доступны как раньше: prepare/unprepare/take, move (drag и диалог), reorder (только сорт «Вручную», среди сиблингов), bulk owner/priority/due/tags, start, edit/close/cancel release, history, «Выбрать все по условиям», select-descendants, quick-edit owner/due; V01–V09 в `planning-view.test.ts` зелёные.
- **A2 Клавиатура.** Каждый интент строки достижим Tab/Enter; Shift+клик диапазон работает; фокус восстанавливается после ререндера по `data-focus`; `:focus-visible` виден; нативная семантика `<table>` сохранена (не treegrid).
- **A3 Сигналы в строке.** Приоритет (кроме normal), тип bug/epic, «Черновик», просрочка/сегодня, «готово N из M» у родителя — видны без hover; в тёмной теме контраст ≥ 4.5:1 на токенах `--iq-*`.
- **A4 390px.** Номер, название, статус, исполнитель, срок в строке без горизонтального скролла; тапы ≥ 44px; страница скроллится целиком (`data-page-scroll`).
- **A5 Стиль.** `npm run check:styles` PASS; никаких новых селекторов в DS-внутренности, px-шрифтов, сырых цветов, inline-style.
- **A6 Тесты.** `planning-controller`, `planning-operation`, `frontend-lifecycle` (экспорт `lastChildren` из `markup.js` сохранён) и `npm test` зелёные; новые unit-тесты на `overdue`/`doneChildrenCount` в markup.
- **A7 Производительность.** Сид 250+ строк в одной группе: windowing включается (`rows>100` или всего >200), `TableWindow.columns` совпадает с числом `<td>`, `estimate` соответствует реальной высоте строки (±8px), скролл без скачков, выделение 200 строк < 100 мс.
- **A8 Обратная совместимость.** UI работает с сервером без `doneChildrenCount` (счётчик просто не рисуется); `model.js` принимает новое поле как необязательное.

## 5. Риски

| Риск | Как снять |
|---|---|
| Параллельный бэкенд-агент на `feature/kotlin-backend` (worktree `ux-ds-20260925`, тот же коммит 51f01e6). Конфликтные файлы: `PlanningView.kt`, `ViewText.kt`, `contracts/planning-view.ts` + сгенерённые контракты, `web/planning-adapter.js`, `tests/planning-view.test.ts`, `tests/dev-seed.ts`, `docs/ux-ds-alignment.md`, `README.md` | Сначала UI-only коммиты (`ui/planning/src/*`). Расширение проекции — один изолированный additive-коммит ≤ 30 строк в `PlanningView.kt` и один assert в V01; согласовать с владельцем, кто вливается первым; ребейз ежедневно. Сид и доки — в самом конце |
| DS закреплён `iquipage-web-0.6.0-vnext.20.tgz`; менять нельзя | Только публичные классы: `.iq-work-list-*`, `.iq-badge.soft`, `.iq-priority`, `.iq-tag`, `.iq-progress`, `ui.avatar/badge/progress/menu`; `check:styles` в CI |
| ARIA таблицы | Оставить `<table>`/`<th scope>`/`<caption>`; `thead` скрыт визуально у не-первых групп — сохранить; новые ячейки = новые `<th>` |
| Data-атрибуты — контракт DS-драга и `decorate()`: `data-work-row/-group/-dropzone/-drag/-drop-active`, `data-select/-select-group/-open/-disclose/-quick-edit/-field-task/-focus`, `data-row/-task/-context/-selected/-depth` | Не переименовывать; при добавлении колонок обновить `columns:4` и `estimate:56` в `index.js` |
| Windowing: ряды переменной высоты (теги, обёртка названия) ломают оценку | Высота строки фиксируется однострочными значениями (`text-overflow`), теги — только в «потом» |
| `risk: standard` в карточке; расширение проекции не меняет контракт zod (`rows` не типизирован полем), но трогает публичный ответ | Оставить standard, зафиксировать в «Решениях» карточки, что поле additive и необязательное; при `groupBy`/тегах — поднять до high |

## 6. Демо-данные (`tests/dev-seed.ts`, не менять сейчас)

Не хватает: просрочки (минимальный `due` — `day(2)`); завершённых подзадач (дети эпика в `in_progress`/`review`); третьего уровня; черновика в релизе (`release:'draft'` никуда не назначается — цикл обрабатывает только `active`/`planned`); завершённого релиза (нет `close` → «Архив» пуст); объёма для windowing.
Предложение: `spq-sync` → `due:day(-3)`, `spq-login-bug` → `day(0)`; добавить ребёнка эпика со `status:'ready_for_release'` и внука `parent:'spq-onboarding'`; `spq-cleanup` назначить в `planned` без `prepare` (админ — черновик в релизе); релиз «Релиз 2.3» (−20…−6) с 2 задачами и `plan({kind:'close', acceptAllCandidates:true, …})`; опциональный проект под флагом `SPRINTIQUE_SEED_LARGE` с 250 задачами в бэклоге; одна задача с `legacyOwner` («не участник»).

## Рамки одной страницей

**Входит:** строка с приоритетом/типом/просрочкой/«готово N из M»; quick-edit приоритета; «Готово N из M» и авто-подгрузка вместо кнопки в бэклоге; мобильная строка с номером; additive поле `doneChildrenCount`; unit-тесты и большой сид (в конце).
**Не входит:** статус в строке, теги в строке, группировка бэклога, счётчики бэклога с сервера, Гант/Календарь, диалоги, DS, команды, миграции, `ViewIntent`/`ViewFilters`.
**Ограничения:** только публичные классы DS vnext.20; `<table>`-семантика; data-атрибуты неизменны; `columns`/`estimate` синхронны с разметкой; сервер-коммит один и изолирован; base — `feature/kotlin-backend`.
**Приёмка:** A1–A8 выше; `check:styles`, `npm test`, ручная проверка светлой/тёмной темы и 390px, замер на 250 строках.