# Release 1.0: независимое ревью 1

2026-10-11. Отдельная reviewer-сессия, исходники read-only. Scope: текущий dirty diff `feat/release-1-remaining` к `4ad5613`, SPR-4/8/20–24; AGENTS.md, engineering/workflow.md/review.md и release-1/PLAN.md. Применён targeted code audit по проектному iquipage-review. Изменён только этот отчёт, тесты/сборки не запускались параллельно root gate; production не затрагивался.

## Finding

- **R1-F1 [P2] confirmed, closed по исправленному коду** `ui/src/board/thread-view.js:138` — новые кнопки подтверждения ответа, проверки актуального вопроса и удаления черновика не участвовали в восстановлении focus после `content.innerHTML` replacement. **Решение: fixed.** Новый `thread-focus.js` сохраняет реальный attribute/value вопроса, временно направляет фокус в стабильный thread при disabled action и восстанавливает кнопку после ошибки; исчезнувшее действие переводит фокус на заголовок вопроса. Capture/restore выполняется один раз вокруг всей draw, поэтому перестановка нескольких тредов не стирает pending focus. Проверены тесты question ID vs thread ID, pending/retry, answer/review/discard, caret и выход пользователя из треда. Реальный browser keyboard pass выполняет root отдельно.

Подтверждённых P0/P1 в проверенном diff нет.

## Проверено

TaskBlockers использует полный авторизованный PlanningState до фильтрации/paging, учитывает from→to только активных depends links и незавершённые обе стороны, исключает related и готовые/принятые задачи. Blocker count полный, detail ограничен тремя. PlanningStates lock повторно проверяет TASKS_READ/credential; запросы проекта и RLS сохраняют границу данных. Поля optional, добавляются только к текущей read projection; миграций/записи immutable preview/history нет. Task/taskLinks/planning event mapping приводит к перечитыванию board.

Linked WorkQuestion в существующем discussion использует серверные permissions.canAnswer и baseRevision, сохраняет выбор/текст независимо от redraw, показывает stale draft вместо молчаливой отправки и не удаляет неотправленный ответ после внешнего решения. Серверные полномочия/atomic answer thread use case не заменены клиентским решением. Обычные треды остаются прежними. Проверены new answer bridge и reload, dirty/isBusy, mounted task/work sections.

Type switch автоматически применяет только empty/untouched template; собственный текст требует явной замены с подтверждением. Для сохранённой задачи сравнение производится с шаблоном прежнего типа, а не со всем её описанием. Связи используют effective release, включая authoritative null и inherited membership; другие релизы появляются по запросу, completed choices раскрываются отдельно. Self/archive исключаются; parent cycle проверяется прежней parent constraint на сохранении. Поиск сохраняет выбранный ID и показывает его отдельной строкой.

Public `ui.choiceGroups` использует escaped native radios/fieldset/details. Новый exact DS .41 архив проверен: SHA256 `090e04e22e45cb5a3a20926fb5c6892a2cb11df08274c80eb5b75b02fc9fcf7b`. Product imports/version/lockfile согласованы. Toast duration policy 3500 ms применяется к тонам и actions; прежние hover/focus/hidden-page pause и explicit persistent duration:0 сохранены. Existing shell/navigation используется всеми секциями; staging container теперь дополнительно opacity:0, не меняя mounts/routes/stream handling.

Прочитаны raw результаты: `/tmp/release1-planning-tests.log` 25/25 PASS (включая blocker outside page, count>3, completion, archived link, direction и tenant denial); `/tmp/release1-ui-targeted.log` 67/67 PASS; `/tmp/release1-ds-test.log` 458/458 PASS. `/tmp/release1-full-gate.log` на момент ревью FAILED: library budget assertion увидел новый `iquipage-css-gzip` сверх ожидаемого `icons-gzip`. Этот запуск не подтверждает release gate.

## Итог и границы

**Вердикт: approve по исправленному коду; открытых P0/P1/P2 нет.** Реальный браузер с обеими темами/узким экраном/клавиатурой, staged A→B→C/error transitions, polling drafts/focus и live blocker refresh в этом ревью не выполнялся. Root/Astra выполняют отдельную browser acceptance; code inspection и unit assertions её не заменяют. Полный immutable/detached gate, fresh CI и второе независимое ревью исправленного результата обязательны перед выпуском. Нет утверждения о прохождении production-приёмки.

Повторный targeted pass: финальный DS .42 SHA256 `277e03b1dfe39bd30eca8d0304c2f5147d4cea1cf60fefabc7d9a0bf83e96f53` проверен непосредственно. Collapsible choiceGroups сохраняет доступный legend, скрывая его визуальный дубль summary; CSS удаляет избыточный selector и сохраняет borderless question в thread. Лимит budget не повышался. Свежие raw `/tmp/release1-ui-targeted.log` 72/72 и `/tmp/release1-ds-test.log` 459/459 PASS. `/tmp/release1-full-gate2.log` на момент повторного чтения проходит library-build/tests и product boundaries/build, остальная полная приёмка ещё выполняется.
