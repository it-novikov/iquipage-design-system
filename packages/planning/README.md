# Sprintique — UX R3

Переработанный фронтенд Планирования и карты, на IQUIPAGE. Репозиторий `it-novikov/iquipage-design-system`, ветка `feature/vnext-planning-ui`, PR #3. Это запускаемый потребительский интерфейс с изолированным браузерным стендом, **не готовая production-платформа и не подключённый новый backend**.

## Что изменено
Планирование: компактный группированный список, прямые действия исполнителя/срока, короткая рабочая шапка. **Задачи / Сроки**, внутри Сроков **Гант / Календарь**. Смена вида не меняет данные и сохраняет выбранный календарный вид.
Общая оболочка: переключение пространства/проекта с поиском, единая геометрия навигации, профиль-аватар, настройки рядом. В demo три независимых контекста. Реальные аккаунты и ACL не имитируются.
Карта: добавить заметку и сразу писать; Enter/двойной клик для прямого редактирования текста/фигур; связанная задача открывает тот же документ. Автоматизация спрятана в меню, её функциональный шаг открывается прямо по Enter. Несохранённая форма защищена при уходе. Создание/редактирование не запускают LLM.
Сохраняется R1: релизы, бэклог, раскрытие детей, выбор и массовые действия, переносы, ручной порядок, окно строк, запуск/закрытие с остатком, история, интервалы, события и зависимости. PIN исходной DS не менялся.

## Открыть
Открыть `Sprintique-UX-R3.html` в браузере. Данные сохраняются в отдельном IndexedDB. Файл не требует HTTP, но ограничения file-origin/storage браузера остаются применимы. Старые поставки не заменяются.
Для исходников из корня распакованного ZIP (Node.js 24):
```bash
cd packages/maps && npm ci --ignore-scripts --no-fund --no-audit
npx --no-install playwright install chromium
cd ../work-list && npm ci --ignore-scripts --no-fund --no-audit
cd ../planning && npm ci --ignore-scripts --no-fund --no-audit
npm run verify
npm run preview
```
Адрес preview: `http://127.0.0.1:4328/`. Проверки используют отдельные синтетические данные, не рабочую БД.

## Подключение и границы
`@sprintique/planning-ui` экспортирует mountPlanning, styles.css и отдельные navigation/navigation.css. Владелец приложения предоставляет реальные проект, личность, источники поиска, SDK adapter, callbacks общего документа и защиту ухода. Загрузить одну поставку IQUIPAGE и публичные styles.css/compact.css пакета @iquipage/work-list; не копировать demo identity/storage в production.
`packages/maps` получил публичный canvasEditing=direct (по умолчанию) либо explicit properties для старого контракта. Inline content и linked task открытия соблюдают readOnly и версии сохранения. Публичная команда edit добавлена в source candidate, не private DOM patch.
Полная архитектура R3: `docs/experience-r3/PLAN.md`, `ROADMAP.md`, `INTEGRATION-AUDIT.md`, `AGENT-MEMBERS.md`, `BACKEND-HANDOFF.md`, `RESEARCH-ACCEPTANCE.md` в корне архива.
Глобальные квартальные планы, profiles/memory/primary assignee агентов, провайдеры/runner/бюджеты пока **спроектированы, не подключены как действующая функция**. Это следующие контракты с backend/DS-владельцами, не скрытые mock-агенты. Независимые интервью и эксперты не запускались; методы и гипотезы описаны отдельно.
Отчёты в `evidence/verification.json` и `evidence/experience-r3/report.json`. Приёмка frontend/fixture, пакетная целостность, visual approval и production readiness — разные статусы. Физические touch/скринридеры, реальные многопользовательские права, FPS устройств, PG и paid LLM не приняты этой сборкой.
