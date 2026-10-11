# Независимое ревью 2: оставшиеся задачи релиза 1

Дата: 2026-10-11. Ветка `feat/release-1-remaining`, база и текущий HEAD `4ad561343c1ff16a51a7b29fb2b1b57a05990bc9`; проверен рабочий diff, включая новый `TaskBlockers.kt`. Ревью read-only; единственное записанное изменение — этот отчёт. Код, миграции, production и состояние пользовательских задач не менялись.

## Findings

Подтверждённых замечаний P0/P1/P2/P3 в проверенном scope нет. Допуск по этому серверному scope возможен после полного gate и фактической UI-приёмки владельца; этот отчёт не заменяет их и не подтверждает deployment.

## Проверенные границы и строки

Все пути ниже относительно `products/sprintique/`.

| Область | Источники | Результат |
|---|---|---|
| Полный снимок до пагинации | `server/src/main/kotlin/com/sprintique/planning/application/PlanningQueries.kt:42–62`, `server/src/main/kotlin/com/sprintique/planning/application/PlanningStates.kt:71–105` | Проекция блокировок получает исходный `state`, а не отфильтрованные `rows` или `page.items`. Поэтому блокер вне страницы, фильтра поиска или выбранного релиза учитывается. |
| Направление и завершение | `server/src/main/kotlin/com/sprintique/planning/domain/TaskBlockers.kt:10–28`, существующие `server/src/main/kotlin/com/sprintique/planning/domain/PlanningState.kt` и `server/src/main/kotlin/com/sprintique/task/application/TaskLinks.kt` | `fromId` ждёт `toId`. Готовый к выпуску или принятый результат не блокирует и сам не получает сигнал незавершённой работы. Прямые зависимости учитываются без подмены транзитивным деревом. Дубликаты целей не увеличивают счётчик. |
| Архив и вид связи | `server/src/main/kotlin/com/sprintique/planning/application/PlanningStates.kt:99–105` | В снимок входят только `depends` с `archived_at IS NULL`; `related` и архивированные связи не блокируют. Задача в текущей серверной модели не имеет отдельного флага архива; архив релиза не означает завершение её результата. |
| Доступ и согласованность | `server/src/main/kotlin/com/sprintique/planning/application/PlanningStates.kt:54–68`, существующие `server/src/main/kotlin/com/sprintique/identity/application/ProjectAccess.kt`, RLS и `server/src/main/kotlin/com/sprintique/task/application/TaskLinks.kt` | Существующий TASKS_READ/project access выполняется до загрузки и повторно под блокировкой проекта с проверкой действующего credential. Нет нового права или обхода RLS; выборки ограничены projectId. Названия блокеров происходят из того же разрешённого снимка. Изменения задач/связей используют существующий project lock и planning revision. |
| Стоимость расчёта | `server/src/main/kotlin/com/sprintique/planning/domain/TaskBlockers.kt:11–22`, существующие `server/src/main/kotlin/com/sprintique/planning/domain/TemporalRules.kt:10–21` | Добавлен расчёт в памяти примерно O(T + D log D), память O(T + D), без N+1 SQL. Ответ ограничен тремя блокерами, число отражает всех. Загрузка 10001 записей сопровождается отказом при превышении лимита 10000, а не тихой неполной проекцией. Сериализация чтений под существующим project lock не является новым изменением. |
| Контракты и откат | `contracts/planning.ts:90–94`, `contracts/planning-responses.ts:15–17`, `server/src/main/resources/contracts/public-schemas.json` | Поля optional для старых runtime/previews/history; список ограничен тремя элементами. Исторические снимки не получают живую проекцию. Diff не содержит изменений миграций/afterMigrate; новая логика не требует изменения БД. Это согласуется с возвратом на существующий совместимый runtime `eb4574b`, но его операционный запуск здесь не проверялся. |
| Передача и обновление в UI | `web/repository.js:84–98`, `ui/src/board/board.js:186`, `ui/src/board/card.js`, `ui/src/board/task-dialog.js:23–37` | Поля сохранены при распространении planning row; task-link/planning события перечитывают доску. Отсутствующее поле не объявляет задачу свободной. Подсказка с названиями экранируется. Контекст выбора связей берётся из полного taskContext, а не только текущей доски. |
| DS | `package.json:31`, `package-lock.json` | Продукт использует точный пакет `vendor/iquipage-web-0.6.0-vnext.42.tgz`; проверенный UI diff обращается к публичным DS API. |

## Проверки и пределы

- Независимо выполнен `node --test products/sprintique/tests/release1-ui.test.mjs`: 4/4 PASS. Проверены группировка задач по эффективному релизу, поиск в других релизах, завершённые задачи, authoritative null release и защита изменённого человеком описания.
- Прочитан новый HTTP-сценарий `tests/planning.test.ts` для блокера вне страницы, направления, четырёх блокеров при трёх показанных, завершения, архивирования и запрета чужому проекту. Его выполнение здесь не повторялось: полный gate уже выполняет root.
- Принятый `result=accepted`, повторное открытие блокера, разные релизы и максимальные 10000 задач/связей дополнительно оценены по коду; отдельного независимого runtime/load-теста здесь нет. Не заявляется измеренная задержка при максимальном размере проекта.
- Ревью UI ограничено связанными изменениями выбора связей, карточки, обновления данных и стыком обсуждений/agent work. Независимого браузерного прогона всех семи SPR-4/8/20–24, клавиатурных сценариев и визуальной приёмки нет.
- Исторические документы и proposed ADR не считались доказательством работающего production или отдельного согласования. Полный gate, detached product и совместимый rollback должны подтверждаться своими результатами.

Проверенный снимок ключевых файлов (SHA-256):

```text
TaskBlockers.kt       b0aacbd46e94ed81291032e4d2e38e3c117ba352bafdce726e590baf0e200a0c
PlanningQueries.kt   8b01b0a71d3dc078470d4c1e38426aa516160ddb3269bd02bcc3611513b6a0c6
planning-responses.ts f15132eaa1d304bafa9fb730ea65d77e375254e7fe91e0418e7d8759e48d73f1
```


## Финальный повтор: focus и DS .42

Подтверждённых новых P0–P3 нет. Backend и контракт проекции блокировок не изменились относительно рассмотренного выше снимка.

- `ui/src/board/thread-focus.js:6–25` и `thread-view.js:173–179`: фокус сохраняется вокруг всего синхронного `draw`, до возможной замены/переноса article. Кнопка восстанавливается по собственному action-id вопроса, а не id треда; при временно disabled кнопке фокус остаётся на article, после успеха — на заголовке сохранённого вопроса. Сохраняются caret textarea и фокус заголовка на следующем обновлении; уход пользователя из треда очищает pending focus и не возвращает его назад.
- `libraries/iquipage/src/modules/ui.js:145–154`: collapsed choice group использует публичные native `details/summary` и `radioGroup`; визуальное имя показано один раз в summary, fieldset сохраняет имя через sr-only legend. Текст и значения экранированы, native radio остаются одной именованной группой. Публичные declarations `ChoiceGroup`/`choiceGroups`/`legendHidden` присутствуют и в исходниках, и внутри принятого tarball.
- `libraries/iquipage/src/styles/work-story.css:8,24`: удалён избыточный селектор `.iq-work-entry .iq-work-byline`, который покрывается `.iq-work-byline`; не обнаружено конкурирующего override для этого контекста. Правило прямого work question внутри thread объединено с существующим border/padding reset, без локального product обхода DS. Size baseline не менялся.
- Независимый запуск `node --test products/sprintique/tests/thread-focus.test.mjs libraries/iquipage/tests/vnext40.test.cjs`: 8/8 PASS. Это unit/protocol проверки, не независимое браузерное доказательство переноса focus native DOM и screen reader поведения.
- Read-only size gate текущего dist: core gzip 185053 ≤ 185291, CSS gzip 101608 ≤ 101612, icons gzip 56097 ≤ 57218 — PASS. CSS запас 4 байта относительно текущего ratchet, новых изменений после этого измерения сюда не включено.
- Package/library versions, product dependency и lockfile согласованы на exact `0.6.0-vnext.42`; содержимое `package/package.json` tarball также .42. Проверенный SHA-256 `vendor/iquipage-web-0.6.0-vnext.42.tgz`: `277e03b1dfe39bd30eca8d0304c2f5147d4cea1cf60fefabc7d9a0bf83e96f53`.

Полный root gate2, detached product, финальная упаковка и реальный браузерный focus walkthrough здесь не повторялись. Final review не означает подтверждение deployment или состояния production. Единственная запись ревьюера — дополнение этого отчёта.
