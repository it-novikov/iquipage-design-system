# Проектирование и проверка опыта Sprintique

Начните с задачи человека и одной актуальной task/brief/finding card. [Сценарии и точки входа](SCENARIOS.md) помогают найти нужную семью; [CSV inventory](surface-inventory.csv) использует поля переносимого IQUIPAGE template. Это индекс для проверки, а не отчёт о готовности.

## Минимальный контекст

1. Прочитать [правила продукта](../../AGENTS.md), нужный scenario ID и текущую карточку.
2. Записать эпизод/evidence → человеческий результат → причину/другую версию → необходимые гарантии и изменяемые решения → осмысленные варианты → проверку → решение.
3. После выбора открыть релевантный recipe **точной установленной DS**, а не весь комплект материалов. Если discovery/audit/implement/review skills установлены, использовать соответствующий; `sprintique-work` отвечает за порученную работу через MCP и не заменяет продуктовую проработку.

Для подтверждённого ограниченного бага достаточно причины, минимальной правки и прямой приёмки. Для спорного решения сравнить исправление существующего, упрощение, иной механизм или отсутствие новой функции — без искусственных концепций. До опыта назвать, что опровергнет выбранный вариант. «Не строить» не закрывает существующий критический дефект. Полный аудит имеет inventory и значимый walkthrough каждого согласованного семейства; не ждать его окончания для уже доказанного критического исправления.

## Основа и честность свидетельств

Индекс сверён с исходниками `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` от 2026-10-11. В [package.json](../../package.json) объявлен `@iquipage/web` из `vendor/iquipage-web-0.6.0-vnext.52.tgz`. Это факт зависимости, **не проверка vnext.52 или production**. При другой revision пересмотреть затронутые маршруты/fixtures. В skill suite 0.5.7 — исторический baseline, его lock не подменять текущим номером ради PASS.

В каждом запуске фиксировать source commit/dirty diff, фактически обслуживаемый build (либо unknown), exact package/hash, роль/capabilities, feature flags, путь, viewport/theme/input, известные density/zoom, данные/дату/часовой пояс и выполненные шаги. Неизвестные density/zoom обозначать unknown; CSS zoom отличать от browser zoom. Это метаданные baseline, не обязательная матрица сочетаний. Не приравнивать локальный HEAD к неизвестной production revision.

| Свидетельство | Что оно подтверждает |
|---|---|
| Исходники и достижимая цепочка | Правило/потенциальный разрыв указанной revision; не эстетическую оценку или частоту. |
| Screenshot | Показанное содержимое и компоновку данного кадра; не сохранение, keyboard или весь путь. |
| Walkthrough исследователя | Реально выполненное действие в указанной среде; не поведение/спрос реальных пользователей. |
| Наблюдение человека | Его действия и барьеры в данных условиях; не частоту всей аудитории автоматически. |
| Synthetic UI/серверная fixture | Только проверенное поведение с перечисленными подменами и подготовкой данных. |

Сначала записывать текущее наблюдение, затем сверять старые планы. Нулевая сводка или пустая сетка сами по себе не дефект. Не выводить причину из совпадения screenshot и похожей строки локального кода. Для общей DS-правки проверить её public caller и затронутые consumers; прикладные права, admission, история и сохранение остаются в продукте.

## Среды и допустимые действия

| Среда | Граница |
|---|---|
| Read-only аудит работающего продукта | Изучение доступного UI/данных в порученном scope. Не создавать/изменять задачи, финансы, доступ, сообщения и настройки ради эксперимента. Нужный mutating путь проверять в disposable local fixture либо отдельно разрешённой тестовой среде. |
| Временный local preview | Synthetic DB/пользователи, реальные Kotlin HTTP handlers. Разрешённые тестовые изменения касаются только созданной fixture; не подключать пользовательскую базу. |
| Frontend fixture (если появится) | Реальные UI modules и exact DS с явно заданными ответами адаптера. UI feedback проверяем; persistence, grants и доменные переходы этим не подтверждаем. |

Некоторые внешне навигационные действия пишут состояние: выбор релиза доски вызывает `setBoardRelease` ([board.js](../../ui/src/board/board.js)); открытие уведомления отмечает его прочитанным ([notifications.js](../../web/notifications.js)); appearance меняет настройки. В read-only сценарии учитывать это до действия, использовать уже выбранный вид или disposable среду. Простое объявление capture «пассивным» не гарантирует отсутствия серверных эффектов. Существующая авторизация на конкретные тестовые изменения сохраняется.

Сохранение, отправка обсуждения/приглашения, назначение/перенос, закрытие периода, операции Finance, upload и управление агентом — mutating сценарии. Seed service account и его plan не доказывают исполнение внешнего агента или качество модели. Не включать cookies, tokens, browser storage state, письма входа и реальные пользовательские данные в Git/fixture/пример/evidence для распространения.

## Существующие команды local preview

Команды выполнять из `products/sprintique/`. Требуются Node 24, JDK 25, PostgreSQL 18 binaries и доступные Gradle зависимости; значения `/path/to/...` заменить реальными локальными путями. Эти команды не были выполнены только фактом добавления документации.

```bash
npm ci --ignore-scripts
npm run build
PG_BIN=/path/to/postgresql-18/bin SPRINTIQUE_JAVA_HOME=/path/to/jdk-25 PREVIEW_WIKI=1 PREVIEW_WORK=1 PREVIEW_RELEASE1=1 PREVIEW_MATERIALS=1 npm run preview:fixture
```

`preview:fixture` и `dev:local` — один [scripts/test.mjs --preview](../../scripts/test.mjs). Он создаёт временный PostgreSQL cluster, проверяет экспорт contracts, запускает Gradle `check localBootJar`, миграции и [tests/preview.ts](../../tests/preview.ts). Node API suites в preview-режиме не выполняются. Web берётся из заранее собранного `dist` ([kotlin-app.ts](../../tests/support/kotlin-app.ts)); команда не собирает фронтенд сама.

Обычный адрес — `http://localhost:4311`; локальный artifact поддерживает synthetic вход, описанный в `preview.ts`. `PREVIEW_PORT` меняет порт. `PREVIEW_API_NAME=1` разделяет UI `127.0.0.1` и API `localhost` на одном процессе; тогда учитывать origin/cookie ограничения. Default preview не запускает worker. Без `TEST_S3_CONFIG` либо `output/infra/storage.json` файловые загрузки и обложки недоступны. Реальные OAuth/почта/Telegram/API провайдера не подтверждаются таким стендом.

Для отдельных ролей Settings есть другой fixture:

```bash
PG_BIN=/path/to/postgresql-18/bin SPRINTIQUE_JAVA_HOME=/path/to/jdk-25 npm run preview:settings
```

Он использует [settings-preview.ts](../../tests/settings-preview.ts), default `http://localhost:4383/__preview/admin` и `/__preview/reader`, проект `spr`, synthetic task/tags. Это не тот же богатый admin dataset обычного preview. Rich seed `admin` и generated `browser-state.json` fixture user тоже не взаимозаменяемы.

`npm run dev` запускает Vite с proxy `/api` и `/auth` на `127.0.0.1:4311` ([vite.config.ts](../../vite.config.ts)); сам по себе не создаёт authenticated данные и не является standalone mock UI. `local:start` запускает отдельный постоянный owned local stand с инфраструктурой — он не нужен для обычного просмотра synthetic preview. Не заменять `npm run build` на Vite-only и не называть это полным gate: отдельная bundle-сборка подтверждает только bundle.

`npm test` — реальный server/API набор с prerequisites, не лёгкий browser smoke. Если нужных JDK/PG/browser нет, записать конкретный BLOCKED и продолжить доступную часть. Не обходить запрет среды на origin/file URL альтернативным браузером, raw CDP или туннелем.

## Данные и воспроизводимость

[dev-seed.ts](../../tests/dev-seed.ts) создаёт пять проектов (`spq`, `mob`, `web`, `rsr`, `idea`), участников, задачи, релизы, карты, Finance и Workbench. Дополнения: `PREVIEW_WIKI=1` — каталог/поиск/история; `PREVIEW_WORK=1` — agent-work task/plan; `PREVIEW_RELEASE1=1` действует **внутри PREVIEW_WORK**; `PREVIEW_MATERIALS=1` — материалы задач. Источники и границы каждого — в SCENARIOS.md.

Seed создаёт часть данных напрямую через API/admin SQL. В частности, для release-задач явно выполняет `prepare` и `assign`, затем `start`; это не доказывает, что человек может получить тот же результат из Planning. Новый пользовательский путь должен начинаться с создания новой задачи через UI, а не с уже подготовленной seed-задачи. Dates вычисляются относительно запуска, IDs частично случайны: для сравнения фиксировать clock/timezone/data profile либо создавать отдельную детерминированную fixture; не выдавать меняющиеся seed за стабильный screenshot baseline.

Если проявился конкретный пробел обратной связи, начать отдельную frontend fixture с реальных `mountPlanning`, `mountTaskBoard`, `openTaskDialog` и public DS; `adapter.containers()` — типизированная projection, unsupported mutations явно отклоняются. Добавлять только необходимые сценарные ответы/задержки/ошибки. Не создавать второй backend/domain engine и не включать preview switches в production entry. Все семейства не считать поддержанными, пока их entry, зависимости, callbacks и сценарии не подключены и не пройдены.

## Что требуется когда

В обычной правке — её meaningful путь, реальный render для UI, применимые semantic/keyboard/focus/narrow состояния и известная затронутая регрессия. Общая DS-правка включает узкую проверку impacted consumers на том же пакете. Перед релизом — согласованная расширенная проверка реальных Safari, Firefox, iOS touch, VoiceOver и других целевых screen reader сценариев; раньше только когда конкретный дефект требует этой среды. Playwright WebKit не переименовывать в Safari, mouse — в touch.

Новый объясняющий онбординг после входа остаётся в конце и реализуется только после отдельного явного согласования владельца. Это не отменяет проверки существующего sign-in и текущих разрешённых действий. Приёмка карточки ссылается на scenario/surface и plan/check IDs; эта документация не меняет schema 2.0 и не выдаёт release approval.
