# IQUIPAGE Design System и Sprintique

Рабочий репозиторий дизайн-системы IQUIPAGE, продукта Sprintique на ней и набора агентских скиллов для discovery, UX-аудита, внедрения и code review.

## Текущее состояние (27.09.2026)

- **Дизайн-система** развивается в `libraries/iquipage`: исходники `@iquipage/web` линии 0.6, сейчас **0.6.0-vnext.17**. Журнал версий — [CHANGES-0.6](libraries/iquipage/docs/CHANGES-0.6.md), API — [README библиотеки](libraries/iquipage/README.md).
- **Sprintique** — самостоятельный продукт в `products/sprintique` (Node 24, Fastify, PostgreSQL с RLS, S3): доска задач, планирование, карты, настройки, агенты. Подключает только упакованный релиз DS из `products/sprintique/vendor`. Проверен локально, это не production. Начните с [README продукта](products/sprintique/README.md).
- **Где мы сейчас:** [статус](docs/vnext/STATUS.md) и [handoff](docs/vnext/HANDOFF.md) описывают состояние, открытые PR, способ запустить стенд и следующие шаги. Решения по интерфейсу собраны в [UX и DS](products/sprintique/docs/ux-ds-alignment.md).
- `design-system/` — закреплённая историческая поставка 05.7 (`0.5.7`), не редактируется. `packages/` и `deliveries/` — исторические модули и поставки прошлых этапов.

## Что находится внутри

```text
.
├── libraries/iquipage/   # Исходники DS 0.6 (Web Components, ESM, CSS, токены, типы, тесты)
├── products/sprintique/  # Продукт Sprintique: backend, web, ui, миграции, тесты, vendor DS
├── scripts/              # verify-vnext.mjs — полный гейт: DS, продукт, границы, отделяемость
├── docs/vnext/           # Статус, handoff, границы и аудиты vNext
├── design-system/        # Историческая поставка IQUIPAGE 05.7 (только чтение)
├── packages/             # Исторические модули maps / planning / work-list
├── agent-skills/         # Переносимый комплект скиллов 1.1.0
├── .agents/skills/       # Скиллы, доступные агенту прямо в этом репозитории
├── AGENTS.md             # Короткие правила работы для агента
└── START-HERE.md         # Маршрутизация типовых задач
```

## Быстрый запуск

Локальный стенд Sprintique (временная PostgreSQL, синтетические данные, вход **admin / admin**):

```sh
cd products/sprintique
npm ci --ignore-scripts
npm run build
LC_ALL=C npm run dev:local   # http://localhost:4311
```

Витрина дизайн-системы: `cd libraries/iquipage && npm run build && python3 -m http.server 4330`, затем `http://localhost:4330/`.

Полная проверка перед PR (из корня): `LC_ALL=C TEST_S3_CONFIG=/путь/к/private-storage.json node scripts/verify-vnext.mjs`.

## Историческая поставка 05.7

В `design-system/` лежит поставка `@iquipage/web` версии `0.5.7`:

- готовые HTML-примеры: `index.html`, `workbench.html`, `whiteboard.html`;
- собранные ESM-входы и CSS в `dist/`;
- типы TypeScript в `types/`;
- семантические токены в `tokens/semantic.json`;
- иконки и дополнительные assets;
- API и правила интеграции в `docs/`;
- тесты, результаты проверок и скриншоты в `tests/` и `evidence/`;
- контрольные суммы в `MANIFEST.sha256`.

Это Web Components и ESM-поставка, а не готовая React-библиотека. Новые возможности добавляются только в `libraries/iquipage`.

### Агентские скиллы

В `agent-skills/` находится переносимый комплект `1.1.0`, включающий четыре скилла:

| Скилл | Для чего нужен |
| --- | --- |
| `iquipage-discovery` | Понять проблему, требования и решение до начала кода |
| `iquipage-experience-audit` | Проверить понятность пользовательского пути и найти доказательные UX-проблемы |
| `iquipage-implement` | Внедрить согласованный UI на публичных возможностях IQUIPAGE |
| `iquipage-review` | Проверить код, визуал, доступность, состояния, производительность и обходы DS |

Каждый скилл самодостаточен: рядом с `SKILL.md` лежат нужные references, assets, templates и scripts.

### Что изменилось в 1.1

Дизайн-система 05.7 не менялась. Обновился только процесс работы с агентами:

- добавлены acceptance plan, evidence registry, fingerprint и `scope_ready`;
- assessment schema обновлена до 2.0, а формат 1.0 оставлен только для исторической диагностики;
- capture теперь использует точные `--allow-origin`, работает offline и блокирует изменяющие HTTP-запросы;
- scanner по умолчанию не печатает snippets, а исключения фиксирует в ledger;
- отчёты не перезаписываются, добавлен resume state;
- добавлена отдельная rubric для design review.

При переходе с 1.0 прочитайте [MIGRATION-1.1.md](agent-skills/docs/MIGRATION-1.1.md). Старые scripts и assets не нужно смешивать с новыми.

## Быстро открыть систему

Установки не требуется для первых визуальных примеров. Откройте локально:

```text
design-system/index.html
design-system/workbench.html
design-system/whiteboard.html
```

Для ESM-входов используйте HTTP(S)-сервер, потому что `file://` не подходит для модульных импортов:

```sh
cd design-system
python3 -m http.server 8000
```

Затем откройте `http://localhost:8000/`.

## Подключение в приложении

Подключите CSS и только нужный JS-вход из одной и той же поставки:

```html
<link rel="stylesheet" href="/design-system/dist/iquipage.css">
<script type="module" src="/design-system/dist/core.js"></script>
```

Доступные входы:

- `dist/core.js` — базовые компоненты;
- `dist/advanced.js` — roadmap, graph, remote inputs, charts и другие расширения;
- `dist/whiteboard.js` — whiteboard;
- `dist/iquipage.js` — полный вход для совместимости;
- `dist/iquipage.css` — стили;
- `tokens/semantic.json` — токены.

Не смешивайте JS и CSS из разных версий. Версию и контрольные суммы перед внедрением сверяйте с `design-system/docs/HANDOFF-05.7.md` и `MANIFEST.sha256`.

## Как использовать скиллы в Codex

Скиллы уже продублированы в `.agents/skills/`, поэтому при работе из корня репозитория они доступны как проектные. Явно вызывайте их по имени, например:

```text
$iquipage-discovery
$iquipage-experience-audit
$iquipage-implement
$iquipage-review
```

Если нужно установить комплект в другой проект, скопируйте каталоги из `agent-skills/skills/` в `<проект>/.agents/skills/`. Полная инструкция находится в [agent-skills/docs/INSTALL.md](agent-skills/docs/INSTALL.md).

## Рекомендуемый рабочий процесс

1. Сначала прочитайте [START-HERE.md](START-HERE.md) и определите тип задачи.
2. Зафиксируйте проблему, роли, платформы, согласованный scope и источники.
3. Для новой функции сначала подготовьте brief и получите утверждение.
4. Перед внедрением проверьте возможности поставки и создайте mapping; отсутствующую возможность оформите как DS-GAP.
5. После реализации проверьте реальные продуктовые поверхности, а не только каталог компонентов.
6. Повторите затронутые светлую и тёмную темы, интерактивные состояния, доступность и тесты.

## Проверки

Дизайн-система требует Node.js 20+ и использует локальные scripts без npm-зависимостей для сборки:

```sh
cd design-system
npm run build
npm test
npm run test:ui
npm run test:matrix
npm run test:contrast
npm run verify
```

Для UI-проверок нужны Python Playwright, Chromium и дополнительные зависимости, описанные в `design-system/docs/QA.md`. Если среда их не предоставляет, результат нужно отметить как `BLOCKED` или `NOT_RUN`, а не считать проверку пройденной.

Проверка комплекта скиллов:

```sh
cd agent-skills
python3 tests/verify_package.py
python3 tests/validate_skills.py
python3 tests/test_tools.py
```

В комплекте 1.1 также есть contract/hardening проверки:

```sh
python3 tests/test_contracts.py
python3 tests/test_review_hardening.py
```

## Важные границы

- Дизайн-система не является приложением и не содержит production API, backend или серверное хранение.
- Whiteboard не реализует совместное редактирование, CRDT, BPMN-исполнение и полную виртуализацию холста.
- Локальное хранение в демо — только демонстрация; для production нужно подключить собственное сохранение.
- Проверки поставки не равны независимому пользовательскому исследованию.
- Тесты из `evidence/` показывают, что именно проверялось; они не подтверждают неподтверждённые браузеры, устройства или production-среду.
- Не используйте «latest» вместо закреплённой версии: обновление поставки требует проверки публичных экспортов, типов, токенов, capabilities и известных регрессий.

## Документация

- [Статус vNext](docs/vnext/STATUS.md)
- [Handoff vNext](docs/vnext/HANDOFF.md)
- [DS 0.6: README](libraries/iquipage/README.md)
- [DS 0.6: изменения](libraries/iquipage/docs/CHANGES-0.6.md)
- [Sprintique: README](products/sprintique/README.md)
- [Sprintique: UX и DS](products/sprintique/docs/ux-ds-alignment.md)
- [Sprintique: настройки](products/sprintique/docs/settings/DESIGN.md)
- [Историческая поставка 05.7: README](design-system/README.md)
- [Handoff 05.7](design-system/docs/HANDOFF-05.7.md)
- [Интеграция](design-system/docs/INTEGRATION.md)
- [Whiteboard API](design-system/docs/WHITEBOARD-API.md)
- [QA](design-system/docs/QA.md)
- [Скиллы: README](agent-skills/README.md)
- [Изменения скиллов](agent-skills/CHANGELOG.md)
- [Миграция 1.1](agent-skills/docs/MIGRATION-1.1.md)
- [Workflow скиллов](agent-skills/docs/WORKFLOW.md)
- [Качество скиллов](agent-skills/docs/QUALITY.md)

## Происхождение и версия

В репозиторий перенесены приложенные поставки:

- `IQUIPAGE-05.7.zip` → `design-system/`;
- `IQUIPAGE-Agent-Skills-1.1.zip` → `agent-skills/`.

Содержимое архивов сохранено, включая манифесты и evidence. Инструкции из приложенного `MIGRATION-1.1.md` отражены в документации репозитория, но не расширяют пользовательскую задачу и не дают разрешения на изменение backend, публикацию или deploy.

## Лицензия

В исходных поставках отдельная лицензия не приложена. До публикации производных работ или передачи кода третьим лицам уточните права у владельца репозитория.

## Переиспользуемый модуль Maps

`packages/maps/` — карты, сессии, шаблоны, сценарии и локальный runtime.
Начните с [руководства модуля](packages/maps/README.md) и [поставки R4](packages/maps/docs/RELEASE-R4.md).
Модуль не заменяет платформу и не меняет исходную DS. Команда приёмки: `cd packages/maps && npm run verify`.
