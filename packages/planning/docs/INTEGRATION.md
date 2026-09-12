# Подключение Planning consumer к Sprintique vNext

Репозиторий: `it-novikov/iquipage-design-system`. Ветка: `feature/vnext-planning-ui`, PR #3. Старый Sprintique не является источником runtime-кода. Этот документ дополняет BACKEND-BRIEF-R2, не задаёт новый HTTP API.

## Граница пакета
`mountPlanning(root, options)` использует `adapter`, `project`, `viewState` и callbacks общего документа задачи. При переключении маршрута сначала проверить `readyToLeave()`, затем `destroy()`. Отказ ухода сохраняет открытый документ или неопределённую команду. Срок жизни feature обязан принадлежать host-router.

`types/index.d.ts` описывает проекцию и намерения потребителя. На сервере конкретные маршруты, enum, DDL и SDK выбирает backend-агент. Нельзя отправлять универсальную запись таблицы или принимать локальный расчёт ACL за полномочие.

## Адаптер
Обязательны `listGroups`, `listRows`, `destinations`, `preview`, `commit`, `receipt`. Списки получают project ID, фильтр, курсор и AbortSignal. Ответы несут revision; поздняя страница прежней проекции не подмешивается в новую.

Дополнительные capabilities требуют соответствующие методы: `describeRelease`, `settings`, `options`, `selectMatching`, `timeline`. Не объявлять capability без работающего метода. Назначения, подготовка, start, close/cancel, schedule и bulk исполняются тем же preview/commit, а не независимыми PATCH в цикле.

`close` переносит только явно распределённый остаток; создание получателя входит в тот же результат. Принятые дети открытого родителя остаются в старом релизе. Результат закрытия — история плана, не факт deployment. `none` у ребёнка блокирует наследование.

## Подключение временных представлений
Timeline DTO ссылается на канонические task/release/milestone IDs; продукт маппит его на публичный `iq-roadmap`. `iq-plan` читает те же даты. Date-only не преобразуется через локальную полночь. Обычная связь не становится временным ограничением автоматически. Отмена preview не выполняет запись.

**PLN-RECOVERY-01 исправлен:** после подтверждённой записи и ошибки чтения закрытие не откатывает данные и не блокирует уход. `tests/browser-recovery.mjs` проверяет обновление без второго эффекта и отсутствие старого черновика DS.

## Что нельзя переносить в production
`demo/fixture-*`, `demo/planning-rules.js`, собственная тестовая IndexedDB и synthetic identity не являются новым backend. Фикстура обрабатывает команды для UX-проверок; её история и receipt не дают гарантий PostgreSQL или полномочий пользователя.

## Внешние зависимости трека
Новая auth/ACL/SDK/PG-интеграция и source-owned extraction DS принадлежат параллельному агенту. Оконный рендер и перенос строк интегрированы в Frontend R1; их приёмка выполняется текущими наборами list-interactions и large-list, не историческим PN2 отчётом.

## Frontend R1 completion

The calendar committed-result recovery defect is repaired. Pointer and keyboard dragging, a non-drag order dialog, and native table windowing are connected. Use the current public entry and declarations, not old PN2 screenshots or its standalone HTML.

The host must resolve `@iquipage/work-list` to the workspace package and load its public stylesheet after the one IQUIPAGE stylesheet. Build that package before installing/bundling the Planning consumer. The package is additive, source-owned, private and not published in npm; do not copy its code into application components.

`PlanningRow.parentId` supplies sibling identity for ordering; `outcome` protects accepted/cancelled results. A drop never changes hierarchy or workflow status. The same `preview`/`commit` protocol applies to `move` and `reorder`. An automatic sort rejects same-group manual reorder. `options({kind:'positions',taskId,...query})` returns allowed sibling anchors plus `__end__` for the pointer-only order dialog.

All identifiers and capabilities are server/SDK projections, not authorization. The SDK must reject stale revisions and return the result of the original idempotency key after a lost response. A clean client projection is not evidence of a PostgreSQL commit. Do not expose fixture transaction helpers in the real API.

Before replacing the isolated demo adapter, align release ownership, readiness/outcomes, inheritance/explicit no-release, closure disposition, immutable history, timezone/date semantics, selection tokens and bounded page sizes with the backend agent. Date intervals and deadlines are distinct. No literal HTTP route or schema is imposed by this package.

Next integration gate: the new application's actual session/project → SDK adapter → task draft → preparation → release start → board → transfer/closure with conflict, revoked access and lost ACK. Run against real backend storage in addition to the consumer suite. The current branch does not implement that backend on the other agent's behalf.
