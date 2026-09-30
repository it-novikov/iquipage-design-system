# IQUIPAGE / Sprintique: единый рабочий стол

**Статус:** PROPOSED — revision 3, conditional GO для прототипа и внутреннего пилота после P0-gates  
**Дата:** 29 сентября 2026  
**Целевая база:** `origin/main` (`0bdd515`); PR [#19](https://github.com/it-novikov/iquipage-design-system/pull/19) и [#20](https://github.com/it-novikov/iquipage-design-system/pull/20) уже слиты; открытый PR [#21](https://github.com/it-novikov/iquipage-design-system/pull/21) — независимое обновление self-hosted Inter / DS, не меняющее продуктовую IA  
**Продуктовая граница:** рабочие, образовательные, исследовательские, клиентские и другие деловые проекты; не life tracker  

## 1. Итоговое решение

Sprintique должен стать единым местом управления деловой работой по нескольким проектам, но не «свалкой всего на свете» и не копией календаря. Его центральная глобальная поверхность — **`Рабочий стол`**, персональная cross-project проекция поверх существующих project-owned `Task`.

Рабочий стол отвечает на три разные потребности:

1. **Нужно действие** — другой человек или процесс ждёт от пользователя конкретного результата.
2. **Текущая работа** — пользователь делает, сознательно выделил или контролирует результат.
3. **Изменилось** — в явно отслеживаемой работе появилась значимая новая информация.

Внутри `Текущей работы` различаются:

- **В фокусе** — только выбранные пользователем задачи;
- **В работе** — назначенные пользователю задачи в активной workflow-категории;
- **Жду** — задачи, результат которых пользователь явно поручил и контролирует.

Это устраняет главный дефект revision 2: ручной фокус больше не смешивается со всем assigned backlog. Исполнитель и срок остаются полезными фактами, но не становятся обязательными условиями видимости. Неназначенная задача без срока может появиться через адресный запрос, ручной фокус, `Жду`, подписку или конкретную блокирующую связь.

В той же глобальной поверхности предусмотрена вторая линза — **`План`**:

- P0/MVP: спокойные read-only горизонты `Сегодня` и `7 дней` по существующим `plannedStart`, `plannedEnd`, `due`, milestones и `request.neededBy`;
- P1: месяц/квартал как портфель milestones/releases, не как длинный список всех Task;
- P1: opt-in read-only календарная интеграция;
- P2: полноценные meeting records только при подтверждённом спросе.

`Task` остаётся каноническим исполнимым объектом. `Project` остаётся boundary прав, данных и мутаций. Workbench не копирует задачи, не создаёт fake-project `all` и не получает глобальное право изменять всё сразу.

## 2. Вердикт независимой команды

**Conditional GO.** Направление оценено как сильное, но предыдущая версия не была implementation-ready.

Согласованный вывод продуктовых, UX, операционных, методологических, дизайн- и security-ролей:

- task-centric cross-project Workbench лучше dashboard карточек проектов, общего feed, `Today`-only и assignee-only списка;
- три уровня внимания следует сохранить, но второй назвать `Текущая работа`, а `В фокусе` сделать личной подгруппой;
- exact recipient обязателен: `status=review` и `requiresResolution` без адресата не являются персональным запросом;
- `created_by` не равен `delegated_by`; нужен явный private-контроль `Жду`;
- до внешнего MVP нужен минимальный временной горизонт `Сегодня / 7 дней`, но не полноценный глобальный календарь;
- персональный Workbench и портфельный контроль руководителя — разные поверхности;
- ассистент, private bulk и shared cross-project mutations менее важны, чем корректные request/delegation/time semantics, поэтому не входят в MVP;
- solution становится готовой к реализации только после семантических, privacy и RLS-gates из delivery plan.

Полный независимый разбор вынесен в `tripper-dev-audit-and-independent-review.md`.

## 3. Evidence base и граница уверенности

Исследование включало:

- актуальный `origin/main` и открытый PR #21;
- действующие contracts, migrations, RLS, audit/outbox, Search, Discussions, Approvals, Planning, Maps и Agent flows;
- read-only аудит развернутой версии на [tripper-dev.ru](https://tripper-dev.ru/), включая публичный responsive UI и серверный artifact;
- независимые сценарные проверки с позиций COO, PM/PO, руководителя с плотным календарём, agile/Kanban, waterfall/program management, образования, клиентской работы, UX/human factors, accessibility, design system, platform/security и AI safety.

Подтверждено кодом и развернутой системой:

- `owner` и `due` nullable;
- текущая оболочка project-first: `Доска задач / Планирование / Карты / Настройки`;
- одна Task уже используется в Board и Planning, а project-scoped drawer является правильной базой;
- Search выполняет авторизованный cross-project read;
- Discussions имеют resolution/read semantics, но не точного адресата действия;
- Approvals, dependencies, RLS, CAS, idempotency, audit/outbox и receipts уже существуют;
- Maps поддерживают исследовательский контекст и явный переход к Task;
- существующие planning fields позволяют собрать первый `Сегодня / 7 дней` без новой calendar domain model.

Не подтверждено пользовательскими исследованиями и потому остаётся гипотезой:

- что выбранные названия безошибочно различаются пользователями;
- что три секции лучше одного feed на реальных объёмах;
- что reason text повышает доверие и снижает ложные действия;
- что `Жду` отражает реальные модели поручений разных ролей;
- что `Сегодня / 7 дней` достаточно до календарной интеграции;
- заявленные частоты проблем. Код доказывает пробел модели, но не распространённость боли.

## 4. Продуктовая граница

Sprintique обслуживает:

- product/software и стартап-проекты;
- консалтинг, агентскую и клиентскую работу;
- операционные и исследовательские инициативы;
- деловое обучение, курсы, дипломы и учебные проекты;
- индивидуальную работу, если она остаётся проектной и результат-ориентированной.

Из решения исключены:

- habits, streaks, Pomodoro и wellness analytics;
- бытовой/lifestyle tracker;
- productivity score и «оценка идеального дня»;
- личные события календаря по умолчанию;
- произвольная no-code база для фильмов, покупок и всего остального;
- универсальный `Item` до доказанного второго типа рабочего объекта.

Фильмы, литература и похожие коллекции не определяют архитектуру первого релиза. Если позднее появится подтверждённый деловой сценарий `Resource/Reference`, он получит собственную модель или общий resource shell через отдельный ADR.

## 5. Упрощённая информационная архитектура

```text
Глобальный уровень
├── Рабочий стол
│   ├── Сейчас
│   │   ├── Нужно действие
│   │   ├── Текущая работа
│   │   │   ├── В фокусе
│   │   │   ├── В работе
│   │   │   └── Жду
│   │   └── Изменилось
│   └── План
│       ├── Сегодня
│       └── 7 дней
├── Проекты
└── Поиск

Внутри проекта
├── Доска задач
├── Планирование
├── Карты
└── Настройки
```

### Навигационные правила

- `Рабочий стол` — постоянный глобальный пункт, а не псевдопроект.
- `Сейчас | План` — один компактный переключатель внутри страницы, не два конкурирующих global home.
- `Проекты в выдаче` фильтрует Workbench; `Открыть проект` меняет контекст. Эти controls должны называться и выглядеть по-разному.
- На экране всегда явно указан scope: `Все доступные проекты` либо выбранные projects/workspaces.
- Workbench не должен насильно становиться стартовой страницей для single-project пользователя: сохраняется last visited location; default можно включить для multi-project cohort после пилота.
- Новые обязательные верхнеуровневые пункты `Ideas`, `Hypotheses`, `Finance`, `Releases`, `Today` и `Calendar` не добавляются.

## 6. Модель внимания

### 6.1 Семантика секций

| Секция | Человеческий смысл | Включает | Не включает автоматически |
|---|---|---|---|
| Нужно действие | От меня ждут конкретный результат | request/approval с exact recipient и open canonical source | `review` status, membership, watcher, due, общий unresolved thread |
| Текущая работа | Я делаю или контролирую результат | manual focus; active assigned work; explicit `Жду` | весь assigned backlog, созданные мной задачи, все blockers проекта |
| Изменилось | Мне нужно знать о значимом изменении | grouped meaningful events по explicit follow/delegation/request relation | каждую правку, собственный шум, arbitrary recency |

### 6.2 Дедупликация

Одна Task всегда занимает одну строку. При нескольких причинах применяется приоритет:

```text
open exact request > manual focus > active assigned work > waiting/delegated > unread meaningful update
```

Primary reason показывается в строке; остальные доступны через `Ещё N причин` в доступном disclosure. После закрытия сильнейшей причины строка предсказуемо переходит в следующую секцию или исчезает. Read никогда не закрывает request.

### 6.3 Причина должна быть человеческой

Примеры:

- `Мария просит проверить · 2 ч назад`;
- `Назначено вам · работа начата`;
- `Вы добавили в фокус`;
- `Вы поручили Анне · работа завершена`;
- `Ваша задача заблокирована API-31`;
- `Вы следите · изменился срок`.

Код reason остаётся в contract, но не показывается пользователю как технический badge.

### 6.4 Неназначенные задачи и задачи без срока

Корректные примеры попадания:

- review неназначенной Task адресован пользователю;
- исследовательская Task вручную добавлена в фокус;
- пользователь следит за решением по делегированной Task;
- milestone без owner влияет на отслеживаемый результат;
- пользователь является владельцем следующего действия по blocker relation.

Отсутствие owner/due не является проблемой. Наличие due без явного отношения к человеку не делает Task персонально релевантной.

## 7. Делегирование и контроль `Жду`

`created_by`, `assigned_by` в одном событии и обычный `follow` не равны устойчивой связи «я поручил и жду».

Минимальная модель:

- при назначении Task другому человеку UI предлагает `Следить за результатом`;
- согласие создаёт private relation `Жду` с источником assignment event, ожидаемым исполнителем и optional `checkBackAt`;
- reassignment обновляет отображаемого исполнителя и создаёт meaningful event;
- completion, cancellation, blocker, возврат на доработку и адресный вопрос становятся значимыми событиями;
- `checkBackAt` — личная дата проверки, а не общий deadline Task;
- пользователь может прекратить контроль без изменения Task или подписок коллег;
- creator не подписывается навсегда автоматически.

`Жду` находится внутри `Текущей работы`, а не создаёт четвёртую крупную секцию. Это сохраняет простой первый экран и при этом даёт руководителю явный контур контроля.

## 8. Blocker semantics

Blocker сам по себе не означает действие пользователя. Различаются четыре случая:

| Случай | Где показывать |
|---|---|
| Моя текущая Task заблокирована чужой Task | Моя Task в `Текущей работе`, reason называет blocker |
| Моя Task блокирует релевантную работу другого человека | `Нужно действие`, только если пользователь действительно владелец следующего действия |
| Отслеживаемая чужая Task получила blocker | `Изменилось` |
| Чужой blocker без моей связи и действия | Не показывать |

Строка и drawer должны отвечать: что заблокировано, чем, и кто сейчас может снять блокировку.

## 9. Первый экран и визуальная иерархия

```text
┌ Рабочий стол                         Сейчас | План
│ Все доступные проекты                         [+ Задача]
│ [Проекты ▾]                                      [Фильтры]
│
├ Нужно действие  3
│ EDU-18  Проверить итоговую работу
│         Курс аналитики · Мария просит проверить · 2 дня
│
├ Текущая работа  12
│ В фокусе
│ CORE-7  Подготовить релиз
│         Платформа · Вы добавили в фокус
│ В работе
│ APP-42  Согласовать контракт
│         Новый продукт · Назначено вам · завтра
│ Жду
│ OPS-9   Подтвердить готовность поставки
│         Операции · Вы поручили Анне · проверить в пятницу
│
└ Изменилось  9+
  API-31  Изменилась блокирующая зависимость
          Интеграция · Вы следите · 40 мин
```

Правила:

- плоские секции и строки из merged PR #19, без card wall;
- title, project и причина видны сразу; workspace — только при неоднозначности;
- максимум один сильный marker на строке;
- `Сортировка` и `Тип внимания` отсутствуют на первом экране: порядок секций канонический;
- project filter — единственный постоянный filter; остальное под `Фильтры`;
- exact count обязателен для direct actions в разумном диапазоне; updates допускают `99+`;
- обновления сгруппированы по Task, а не по сырым событиям;
- каждая секция имеет независимые loading/empty/error states;
- при live refresh строки не переставляются под курсором: показывается `Появились изменения`.

## 10. Работа без лишних переключений

Открытие строки вызывает Task drawer в контексте `(projectId, taskId)`. В drawer доступны только уже разрешённые canonical actions: ответ, resolve request, смена personal focus/follow, task fields при наличии project permission, переход по зависимости.

Контракт возврата:

- URL можно перезагрузить и открыть полноценную Task;
- close/back возвращает в Workbench с теми же mode, project filter, section, scroll anchor и keyboard focus;
- переход в проект — отдельное явное действие;
- create из Workbench всегда показывает destination project до submit;
- `allowedActions[]` — подсказка UI, а сервер повторно проверяет права, membership, source revision и recipient для каждой мутации.

Cross-project shared bulk в MVP отсутствует. Он усложняет partial failure, audit, CAS, receipt и undo раньше, чем подтверждена основная ценность.

## 11. Планирование времени

### 11.1 Не смешивать значения времени

| Значение | Смысл |
|---|---|
| `due` / deadline | Когда должен быть готов результат |
| `plannedStart` / `plannedEnd` | Когда пользователь или команда планирует работать |
| `request.neededBy` | Когда ожидается конкретный ответ/решение |
| `checkBackAt` | Когда пользователь хочет проверить порученный результат |
| meeting start/end | Фиксированный синхронный слот, отдельный от Task |

Перенос planned interval не меняет deadline. Перенос встречи не изменяет due. Присутствие на встрече не означает assignment.

### 11.2 Линза `План`

P0/MVP использует только имеющиеся бизнес-данные:

- `Сегодня`: planned work, deadlines/neededBy/checkBackAt сегодня, ближайшие milestones и manual focus без времени отдельной спокойной группой;
- `7 дней`: planned intervals, deadlines, requests и milestones с группировкой по дню;
- никакого автоматического превращения undated tasks в calendar blocks;
- никакой глобальной стены overdue/unassigned/no due.

P1:

- `Месяц / квартал` — releases, milestones, dependencies и exceptions, а не каждая Task;
- read-only external work-calendar opt-in;
- meeting → linked action items с явным подтверждением.

P2 только после исследования: agenda, notes, decisions, attendees и follow-ups как отдельный meeting/document aggregate.

## 12. Портфельный контроль — отдельная поверхность

Персональная очередь внимания не должна превращаться в PMO-dashboard. Для COO/lead в P1 нужен `Контроль` с projects как строками и исключениями:

- открытые решения и approvals;
- блокировки и стареющий WIP;
- ближайший milestone/release;
- просроченные обязательства;
- unowned work только в явно выбранной responsibility zone;
- изменение project health с прошлого обзора.

Project membership не подписывает лидера на все Task. Responsibility zones должны быть явными, bounded и отключаемыми.

## 13. Идеи, гипотезы и переход к работе

### 13.1 Идеи

Использовать существующие `Maps` как project-scoped пространство исследования. Идея остаётся upstream context, а не маскируется под Task и не попадает в Workbench сама по себе.

Полезный паттерн развернутой версии принимается с изменениями:

- conversion явный и подтверждаемый;
- source сохраняется;
- Task получает snapshot исходного контекста и provenance;
- retry idempotent и не создаёт duplicate;
- связь видна с обеих сторон;
- одна идея может породить несколько Task, а Task может опираться на несколько ideas;
- изменение идеи позже не переписывает Task молча;
- graph имеет доступную list/table alternative.

Не вводить отдельный глобальный `Ideas` module и не переносить старое ограничение one idea → one task.

### 13.2 Гипотезы

Из развернутой версии стоит принять decision contract:

```text
предположение → эксперимент → критерий успеха → evidence → вывод → следующее решение
```

Его нельзя оставлять finance-only. General `Hypothesis/Experiment` в P1 должен быть project-scoped, domain-neutral и иметь typed links к Tasks, Map objects, evidence и decisions. Budget/currency/expenses — optional finance extension.

В MVP новая сущность не нужна: сначала проверить workflow через Maps template, research Task template и structured decision/approval. В Workbench hypothesis появляется только через те же explicit relations — request, focus или follow, а не по факту существования.

## 14. Что перенять из tripper-dev.ru

| Паттерн | Решение | Применение |
|---|---|---|
| Project как security boundary | Принять | Workbench — только авторизованная проекция |
| Nullable assignee/due | Принять | Пустые поля — валидное состояние |
| Explicit idea → task | Адаптировать | Source + snapshot + idempotency + typed many-to-many links |
| Hypothesis decision contract | Адаптировать | Domain-neutral P1, finance optional |
| CAS/idempotency/receipts/conflict recovery | Принять | Shared mutations и conversion |
| Notification stores references and rechecks access | Принять | Никаких копий закрытого контента |
| Release rows отдельно от Task | Отклонить | Текущая vNext Task сохраняет identity в Planning |
| Project-first широкая навигация | Отклонить | Workbench агрегирует работу, project modules остаются локальными |
| `Assigned to me` / `Only mine` как основа | Отклонить | Explicit relations, assignee только один из сигналов |
| Undated как вторичный забываемый bucket | Отклонить | Видимость через focus/request/follow/waiting |
| Finance-scoped hypothesis | Отклонить как общую модель | Финансы только extension |
| Habit-product demo | Отклонить | Не соответствует новой продуктовой границе |

## 15. Поддержка разных методов — честная граница

Первая версия совместима с артефактами разных методов, но не заявляет полную поддержку методологий.

| Контекст | Что покрывает MVP | Чего не обещает |
|---|---|---|
| Agile/Scrum | Task, timeboxed release, requests, dependencies | velocity, capacity, отдельный Sprint aggregate |
| Kanban | workflow, active work, blockers | WIP limits, aging/lead-time, class of service до P1 |
| Waterfall | planned intervals, milestones, FS/SS/FF/SF | baseline, critical path, resource plan, change control |
| Stage-gate | approval/request и evidence links позже | gate criteria/sign-off matrix до P2 |
| Образование | tasks, review requests, projects | cohort/submission/rubric domain до исследования |
| Клиентская работа | approval, waiting, milestones | CRM, billing и SLA suite |

До non-software/education пилота нужен neutral workflow preset или display aliases: обязательные `bug/testing/release` labels неприемлемы вне software context.

## 16. Ассистирующий функционал

Ассистент не входит во внешний MVP. Сначала пользователь должен доверять детерминированной модели внимания.

P1 допустимы:

- rule-based `Собрать мой день/неделю` с preview;
- project-local summary значимых изменений;
- предложения action items из встречи, карты или обсуждения;
- подсказка очистить устаревший focus или проверить `Жду`.

Обязательные ограничения:

- никаких silent mutations и скрытого AI-score;
- exact diff, источник, project, scope, модель и human confirmation;
- typed tools и per-project receipt;
- текст Task/comments/maps считается untrusted content и не превращается в команду;
- project-local prompts; cross-project AI не получает «глобальный человеческий credential»;
- при последующем cross-project summary объединяются минимизированные structured results, а не сырые данные разных workspaces;
- suggestion не считается direct request от человека.

## 17. Состояния и accessibility

Обязательные состояния:

- no projects / no actions / empty focus / no updates;
- zero filter result с видимым reset;
- section-local loading и partial error;
- offline/stale timestamp;
- conflict с сохранённым draft;
- resolved elsewhere;
- access revoked с немедленным удалением stale content;
- refresh available без автоматического reordering;
- snoozed request с временем возврата и undo.

Accessibility target — WCAG 2.2 AA:

- настоящие section/group headings и списки;
- reason через видимый текст и `aria-describedby`;
- row link и menu — отдельные controls;
- keyboard ordering и focus recovery после resolve/drawer;
- rank focus доступен кнопками, не только drag;
- 320/390 CSS px, 200/400% zoom, text resize, keyboard-only, screen reader, forced colors, reduced motion, light/dark;
- touch targets не менее 44×44 px;
- windowed list обязан сообщать позицию/размер и не ломать чтение screen reader;
- PR #21 при принятии требует повторного reflow/truncation теста русских строк из-за новых font metrics.

## 18. Исследовательская программа

### Этап 1 — semantic prototype

8–10 участников, одинаковый dataset из 40–60 Task. Сравнить:

- один ranked feed;
- `Нужно действие / Текущая работа / Изменилось`;
- текущий project-by-project baseline.

### Этап 2 — formative usability

10–12 участников с 3–8 активными projects: IC, PM/lead, consultant, руководитель, преподаватель/студент. Проверить поиск direct ask, делегирование, blocker, undated/unassigned, project filter versus navigation, drawer recovery, `Сегодня / 7 дней`.

### Этап 3 — inclusive sessions

5–8 участников/сессий: keyboard-only, screen reader, low vision/zoom, touch и motor constraints.

### Этап 4 — longitudinal pilot

12–15 участников, 10–14 дней. Реальные focus/follow/snooze/waiting relations, diary и разбор пропущенных запросов. Portfolio users и high-calendar-pressure users анализируются отдельно.

### Предварительные success metrics

- recall direct asks ≥90%, целевой stretch ≥95%;
- false-positive rate персональной выдачи ≤20%;
- корректное объяснение причины минимум для 9 из 10 строк;
- время до первых трёх правильных действий ниже baseline на 25–30%;
- project switches ниже минимум на 30%;
- delegated Task находится менее чем за 10 секунд без перехода в project;
- 30–50 assigned Task не вытесняют manual focus с первого экрана;
- core task success ≥90% на desktop и mobile;
- ноль искусственных due/assignee, добавленных только ради видимости.

Guardrails:

- 0 title/count/excerpt leaks между projects/workspaces;
- 0 wrong-project mutations;
- 0 duplicate rows одной Task;
- 0 случаев, когда read закрывает open request;
- 0 silent reorder во время взаимодействия;
- 100% core actions доступны с клавиатуры;
- snooze не скрывает request после `neededBy`;
- cognitive pressure не растёт относительно baseline;
- не оптимизировать inbox zero, время в продукте или число закрытых notifications.

## 19. Product decisions для утверждения

1. Принять `Рабочий стол` как глобальную task-centric проекцию, не новый container.
2. Принять `Сейчас | План` внутри одной поверхности.
3. Принять верхний уровень `Нужно действие / Текущая работа / Изменилось`; `В фокусе / В работе / Жду` — подгруппы текущей работы.
4. Считать personal action только exact-recipient request/approval; status/role/membership не заменяют адресата.
5. Не использовать owner/due как обязательные gates.
6. Добавить private `Жду` и read-only `Сегодня / 7 дней` до внешнего MVP.
7. Сохранить Project boundary и одну Task во всех views; bulk и assistant убрать из MVP.
8. Сохранить Maps как источник идей; добавить typed provenance и many-to-many conversion после проверки Workbench.
9. Исследовать domain-neutral Hypothesis/Experiment в P1; не переносить finance-only модель.
10. Развивать `Контроль`, calendar integration и meetings отдельными слоями, а не смешивать с personal attention.
11. Не заявлять полную Scrum/Kanban/waterfall/stage-gate поддержку без соответствующих contracts.
12. Сохранять статус PROPOSED до explicit owner approval и прохождения P0 semantic/privacy gates.

## 20. Source map

| Источник | Вклад | Вес |
|---|---|---|
| `origin/main` `0bdd515`: Sprintique contracts, migrations, Planning, Maps, Search, Discussions, approvals, RLS/outbox | Фактическая текущая модель и ограничения | Direct evidence |
| Merged PR [#19](https://github.com/it-novikov/iquipage-design-system/pull/19) | Row/section/drawer/mobile visual baseline | Direct evidence |
| Merged PR [#20](https://github.com/it-novikov/iquipage-design-system/pull/20) | Актуальная repo boundary без legacy implementations | Direct evidence |
| Open PR [#21](https://github.com/it-novikov/iquipage-design-system/pull/21) | Self-hosted Inter и необходимость typography re-test | Direct evidence |
| [tripper-dev.ru](https://tripper-dev.ru/) и sanitized server artifact audit | Ideas, hypotheses, conversion, release/finance patterns и operational constraints | Direct evidence, read-only |
| [Linear My Issues](https://linear.app/docs/my-issues), [Inbox](https://linear.app/docs/inbox) | Relations и action/update separation | Official |
| [Asana Inbox](https://help.asana.com/s/article/stay-informed-with-your-asana-inbox) | Work to do ≠ updates to know | Official |
| [Jira watching](https://support.atlassian.com/jira-software-cloud/docs/watch-share-and-comment-on-a-work-item/) | Tracking without assignment | Official |
| [ClickUp My Work](https://help.clickup.com/hc/en-us/articles/18947060934423-Use-the-My-Work-card) | Explicit undated work | Official |
| [Notion My Tasks](https://www.notion.com/en-gb/help/guides/give-your-to-dos-a-home-with-task-databases) | Cross-source projection and assignee limitation | Official |
| Независимая экспертная панель | Сценарная критика, consensus/disagreements и release gates | Expert judgment, требует user validation |
