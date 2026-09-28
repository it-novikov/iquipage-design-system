# IQUIPAGE Design System и Sprintique

Рабочий репозиторий дизайн-системы IQUIPAGE, продукта Sprintique на ней, инженерной системы с мостом для агентов и набора агентских скиллов.

## Что внутри

```text
.
├── libraries/iquipage/   # Дизайн-система @iquipage/web 0.6: Web Components, ESM, CSS, токены, типы, тесты
├── products/sprintique/  # Продукт Sprintique: Kotlin-сервер, веб-интерфейс, миграции, тесты, vendor DS
├── engineering/          # Инженерная система: принципы, стек, архитектура, процесс, мост для агентов
├── .bridge/              # Карточки задач моста
├── scripts/              # verify-vnext.mjs — полный гейт: DS, продукт, границы, отделяемость продукта
├── docs/BOUNDARIES.md    # Границы между DS и продуктом и порядок изменений
├── agent-skills/         # Переносимый комплект скиллов 1.1
├── .agents/skills/       # Те же скиллы, доступные агенту прямо в этом репозитории
├── AGENTS.md             # Короткие правила работы для агента
└── START-HERE.md         # Маршрутизация типовых задач
```

- **Дизайн-система** — `libraries/iquipage`, линия 0.6. Журнал версий — [CHANGES-0.6](libraries/iquipage/docs/CHANGES-0.6.md), API — [README библиотеки](libraries/iquipage/README.md). Продукт подключает только упакованный релиз из `products/sprintique/vendor`.
- **Sprintique** — самостоятельный продукт: сервер на Kotlin и Spring Boot (JDK 25), PostgreSQL с RLS, S3; доска задач, планирование, карты идей, обсуждения, настройки, агенты. Вход — по коду на почту, через Google и Apple. Начните с [README продукта](products/sprintique/README.md) и [эксплуатации](products/sprintique/docs/operations.md).
- **Инженерная система** — [engineering/README.md](engineering/README.md): общие правила, стек, архитектура, процесс по уровням риска и мост для передачи работы между агентами.

## Быстрый запуск

Стенд разработки Sprintique (временная PostgreSQL, синтетические данные; вход **admin / admin** или по коду — письма в `output/local-mail/`):

```sh
cd products/sprintique
npm ci --ignore-scripts
npm run build
LC_ALL=C npm run dev:local   # http://localhost:4311
```

Нужны JDK 25 и PostgreSQL 18. Эталонный стенд на production-артефакте (PostgreSQL, Garage, Mailpit в изолированном Docker-контексте) описан в README продукта.

Витрина дизайн-системы: `cd libraries/iquipage && npm run build && python3 -m http.server 4330`, затем `http://localhost:4330/`.

Полная проверка перед PR (из корня): `LC_ALL=C TEST_S3_CONFIG=/путь/к/private-storage.json node scripts/verify-vnext.mjs`.

## Агентские скиллы

В `agent-skills/` находится переносимый комплект `1.1.0`:

| Скилл | Для чего нужен |
| --- | --- |
| `iquipage-discovery` | Понять проблему, требования и решение до начала кода |
| `iquipage-experience-audit` | Проверить понятность пользовательского пути и найти доказательные UX-проблемы |
| `iquipage-implement` | Внедрить согласованный UI на публичных возможностях IQUIPAGE |
| `iquipage-review` | Проверить код, визуал, доступность, состояния, производительность и обходы DS |

Каждый скилл самодостаточен: рядом с `SKILL.md` лежат references, assets, templates и scripts. Скиллы уже продублированы в `.agents/skills/` и доступны в этом репозитории по имени (`$iquipage-discovery` и т. д.). Установка в другой проект — [agent-skills/docs/INSTALL.md](agent-skills/docs/INSTALL.md).

Проверка комплекта:

```sh
cd agent-skills
python3 tests/verify_package.py
python3 tests/validate_skills.py
python3 tests/test_tools.py
python3 tests/test_contracts.py
python3 tests/test_review_hardening.py
```

## Рабочий процесс

1. Задача заводится карточкой моста (`engineering/bridge/bin/bridge new …`) и ведётся по [процессу](engineering/workflow.md).
2. Для UI-задач сначала прочитайте [START-HERE.md](START-HERE.md) и выберите скилл.
3. Недостающую возможность дизайн-системы оформляйте как DS-GAP и исправляйте в `libraries/iquipage` новой версией, а не локальным компонентом в продукте.
4. После реализации проверяйте реальные поверхности продукта в обеих темах и на телефоне, а не только каталог компонентов.

## Документация

- [Границы DS и продукта](docs/BOUNDARIES.md)
- [DS 0.6: README](libraries/iquipage/README.md) · [изменения](libraries/iquipage/docs/CHANGES-0.6.md)
- [Sprintique: README](products/sprintique/README.md) · [эксплуатация](products/sprintique/docs/operations.md) · [UX и DS](products/sprintique/docs/ux-ds-alignment.md) · [решения](products/sprintique/docs/decisions/)
- [Инженерная система](engineering/README.md) · [мост](engineering/bridge/README.md)
- [Скиллы](agent-skills/README.md)
