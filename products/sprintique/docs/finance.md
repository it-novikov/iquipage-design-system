# Финансы проекта

Журнал операций проекта (доходы и расходы, ожидаемые и проведённые, с аннулированием, историей версий и сводкой по валютам) и план бюджета, с которым журнал сравнивается. Решения и альтернативы — [ADR 0003](decisions/0003-project-finance.md) для журнала и [ADR 0009](decisions/0009-finance-plan.md) для плана. Счетов, переводов, сценариев, помесячного плана и курсов валют нет.

## Как это называется в интерфейсе

Проведённые доходы минус проведённые расходы — «Чистый результат» (в API `balance`), а не «баланс»: счетов и остатков нет. Чистый результат вместе с тем, что ещё ожидается, — «Ожидаемый результат» (в API `forecast`). Операция в состоянии `planned` в интерфейсе «Ожидается», чтобы её не путали с планом. «План» — только утверждённая версия бюджета. Имена полей API не менялись.

## План бюджета

Человек с `finance.write` заводит план: имя, период (произвольные даты; для плана на релиз обычно даты релиза, для плана проекта — год) и, если нужно, релиз или спринт. План — это ряд версий. Версия 1 создаётся черновиком вместе с планом. Черновик сохраняется целиком: строки «направление — категория — сумма — валюта — необязательный релиз — основание» и примечание о причине пересмотра. Утверждение замораживает черновик в базе: ни API, ни прямой SQL его и его строки больше не меняют, а прежняя утверждённая версия становится вытесненной и остаётся для сравнения. Пересмотр создаёт новый черновик копией строк утверждённой версии. Утверждает один человек с `finance.write`, многоступенчатого согласования нет. Период и релиз плана после первого утверждения не меняются: новый период — новый план.

Сводка (`GET /finance-overview`) сравнивает версию плана с журналом внутри периода плана по дате операции, отдельно в каждой валюте, категории и направлении. Факт — проведённые операции, «ожидается» — запланированные с датой в периоде, прогноз — их сумма. Отклонение расходов равно плану минус прогноз, отклонение доходов — прогнозу минус план, так что положительное число всегда хорошо. При нулевом плане процента нет. Категория без строки плана помечается «не было в плане», и её отклонение не считается нулевым. Аннулированные операции не участвуют, валюты не складываются. Ожидаемые операции с датой раньше сегодняшнего дня (в часовом поясе проекта) считаются отдельно: это признак устаревших данных. План на релиз сравнивается с операциями этого релиза, план проекта — со всеми операциями проекта.

Отклонение требует объяснения, если прогноз хуже плана больше чем на 10% плана или если ожидается расход, которого в плане не было. Объяснение — одна-две фразы к утверждённой версии плана для категории, направления и валюты. Сервер запоминает прогноз, к которому объяснение написано; когда прогноз меняется, сводка показывает, что объяснение относится к другой цифре. К объяснению можно сразу создать задачу через модуль задач: нужно право `tasks.write`, задача создаётся ровно один раз, её название пишет человек.

Сводка отдаёт одну фразу кодом состояния (`state.code`): `no_plan` — плана нет, отклонение оценить нельзя; `not_approved` — у плана нет утверждённой версии или показана версия для сравнения; `variance_unexplained` — есть отклонение без объяснения, `state.detail` называет самое крупное; `explanation_outdated`; `variance_explained`; `within_plan`. Под фразой — четыре величины в каждой валюте отдельно для доходов и расходов (`plan`, `fact`, `expected`, `forecast` и `variance`), «Чистый результат» и «Ожидаемый результат» (`net.fact`, `net.forecast`) и просроченные ожидания, затем категории.

## Правила

- **Суммы** — целые минимальные единицы (`amount_minor`, копейки для RUB), от 1 до 10¹⁵−1. Число знаков после запятой берётся из ISO 4217 (RUB 2, JPY 0, KWD и IQD 3), а не из локали браузера: одна и та же `amount_minor` означает одну сумму в любом клиенте и в импорте. Направление задаёт `direction` (`income` или `expense`), сумма всегда положительна.
- **Валюта** — ISO-код из трёх заглавных латинских букв. Валюта проекта (по умолчанию RUB) подставляется в новые операции; у операции может быть своя. Итоги считаются по каждой валюте отдельно.
- **Состояния.** `planned` — ожидается к `due_date`. `posted` — прошла `posted_date`. Проведение запланированной операции ставит фактическую дату и сумму, плановая дата остаётся. `voided` — аннулирована с причиной (`void_reason`), окончательно; даты и суммы остаются как были. Переходы: planned → posted, planned → voided, posted → voided. Возврата в план и удаления нет.
- **Дата операции** (`entry_date`) — фактическая, иначе плановая. По ней сортируется журнал, строятся разрезы по месяцам и фильтры `from`/`to`. Допустимые даты — 1900–2999 годы; это правило проверяет приложение, база его не держит. Период `from`/`to` с началом позже конца отклоняется (`422 FINANCE_DATE`).
- **Правка** не меняет состояние: проводится и аннулируется операция своей командой. Аннулированная операция не меняется.
- **История.** Каждое сохранённое состояние — версия с полным снимком, видом изменения, автором и временем. Версии не меняются и не удаляются.
- **Права.** Читает тот, у кого есть `finance.read`, ведёт журнал, категории и план тот, у кого есть `finance.write` ([доступ и приглашения](access/access-and-invitations.md)). Сервисным аккаунтам оба права выдаются только явно и не шире прав владельца; агентские токены финансов не получают; запуск ИИ-агента действует в пересечении прав аккаунта и запустившего человека. Финансовых MCP-инструментов нет. События `finance-*` видят только люди с `finance.read`.
- **Категории.** Справочник проекта (`app.finance_category`): имя до 80 знаков, уникально без учёта регистра, «ё/е» и повторных пробелов; направление `income`, `expense` или `both`; архив. Операция требует `categoryId` категории своего направления. Архивная категория не выбирается для новых операций, но остаётся у тех, что её уже имеют. Текст `category` — историческая подпись: сервер пишет в него имя категории на момент записи, а текущее имя отдаёт в `categoryName`.
- **Релиз.** Операция может ссылаться на релиз или спринт своего проекта (`releaseId`); релиз другого проекта отклоняется (`422 FINANCE_RELEASE`) и базой не принимается. Архивный релиз остаётся у операций, которые его уже имеют.
- **Лимиты.** 100 000 операций, 200 категорий и 50 планов на проект; 500 строк в версии плана и 100 версий в плане; категория до 80 знаков, описание до 500, контрагент и документ до 160, причина аннулирования, основание строки и примечание версии до 300, объяснение отклонения до 500, название плана до 120; страница журнала до 100, история по 50; сводка журнала — последние 240 месяцев (по всем валютам) и до 200 крупнейших категорий в каждой валюте (`truncated`).

## Схема (миграции `V20260929000025__add_project_finance.sql`, `V20261001000072`–`076`)

### `app.finance_settings` — валюта проекта

| Колонка | Тип | Ограничения |
|---|---|---|
| `project_id` | text | PK, FK `app.projects` |
| `currency_code` | text | NOT NULL, по умолчанию `'RUB'`, `^[A-Z]{3}$` |
| `revision` | integer | NOT NULL, > 0 |
| `updated_by` | text | NOT NULL, FK `auth.principals` |
| `updated_at` | timestamptz | NOT NULL, по умолчанию `clock_timestamp()` |

Нет строки — валюта RUB на ревизии 0.

### `app.finance_entry` — операция

| Колонка | Тип | Ограничения |
|---|---|---|
| `project_id` | text | PK (1/2), FK `app.projects` |
| `id` | text | PK (2/2), `^[A-Za-z0-9_-]{1,100}$` |
| `direction` | text | NOT NULL, `income` \| `expense` |
| `state` | text | NOT NULL, `planned` \| `posted` \| `voided` |
| `amount_minor` | bigint | NOT NULL, 1…999 999 999 999 999 |
| `currency_code` | text | NOT NULL, `^[A-Z]{3}$` |
| `due_date` | date | NULL; обязательна для `planned` |
| `posted_date` | date | NULL; обязательна для `posted`, пуста для `planned` |
| `entry_date` | date | генерируемая: `coalesce(posted_date, due_date)`; не вставляется |
| `category` | text | NOT NULL, 1–80; историческая подпись |
| `category_id` | text | NOT NULL, FK `(project_id, category_id)` → `app.finance_category` (с 072) |
| `release_id` | text | NULL, FK `(project_id, release_id)` → `app.releases` (с 072) |
| `description` | text | NOT NULL, 1–500 |
| `counterparty` | text | NULL или 1–160 |
| `reference` | text | NULL или 1–160 (номер счёта, договора, платёжки) |
| `void_reason` | text | задана тогда и только тогда, когда `state = 'voided'`; 1–300 |
| `revision` | integer | NOT NULL, > 0 |
| `created_by`, `updated_by` | text | NOT NULL, FK `auth.principals` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, по умолчанию `clock_timestamp()` |

Проверки: `ck_finance_entry__planned` (planned ⇒ `due_date` есть, `posted_date` нет), `ck_finance_entry__posted` (posted ⇒ `posted_date` есть), `ck_finance_entry__dated` (хотя бы одна дата), `ck_finance_entry__void_reason`. Индексы `ix_finance_entry__entry_date (project_id, entry_date DESC, id DESC)`, `ix_finance_entry__category (project_id, category_id)`, `ix_finance_entry__release (project_id, release_id) WHERE release_id IS NOT NULL`.

### `app.finance_entry_version` — версии

`(project_id, entry_id, revision)` — PK; FK на `app.finance_entry`. Колонки снимка — `direction`, `state`, `amount_minor`, `currency_code`, `due_date`, `posted_date`, `category`, `category_id`, `release_id`, `description`, `counterparty`, `reference`, `void_reason`; плюс `change` (`created` \| `updated` \| `posted` \| `voided`), `actor_id` (FK `auth.principals`) и `created_at`.

### `app.finance_category` — категории (072)

`(project_id, id)` — PK. `name` 1–80 без пробелов по краям; `name_key` генерируется функцией `app.finance_category_key(name)` (нижний регистр, «ё» → «е», повторные пробелы — один) и уникален в проекте (`ux_finance_category__name_key`); `direction` `income` \| `expense` \| `both`; `archived_at`; `revision`; авторы и время создания и изменения. Миграция 072 создала по категории на каждый различающийся по ключу текст существующих операций (имя — как написано первым, направление — по операциям, `both` при смешанных) и заполнила `category_id` у операций и версий.

### `app.finance_plan`, `app.finance_plan_version`, `app.finance_plan_line` — план (073)

- `finance_plan`: `(project_id, id)` — PK; `name` 1–120; `period_start` ≤ `period_end`; `release_id` NULL или релиз проекта; `revision`; авторы и время.
- `finance_plan_version`: `(project_id, plan_id, version)` — PK, `version` 1–100; `state` `draft` \| `approved` \| `superseded`; `note` NULL или 1–300; `approved_by`/`approved_at` заданы тогда и только тогда, когда версия не черновик; `revision`; авторы и время. Частичные уникальные индексы `ux_finance_plan_version__draft` и `ux_finance_plan_version__approved` — не больше одного черновика и одной утверждённой версии в плане.
- `finance_plan_line`: `(project_id, plan_id, version, position)` — PK, `position` 1–500; `direction` `income` \| `expense`; `category_id` FK на категорию; `amount_minor` 0…10¹⁵−1; `currency_code`; `release_id` NULL или релиз проекта; `note` NULL или 1–300.

### `app.finance_variance_note` — объяснения отклонений (074)

`(project_id, id)` — PK; `plan_id`, `version` — FK на версию; `category_id`, `direction`, `currency_code` — отклонение, к которому написано объяснение (уникально в версии: `ux_finance_variance_note__variance`); `text` 1–500; `task_id` NULL или FK `(project_id, task_id)` → `app.tasks`; `forecast_minor_at_note` numeric(30,0) — прогноз на момент записи; `revision`; авторы и время.

### Триггеры и доступ

- `finance_entry_guard` (BEFORE INSERT OR UPDATE, `app.guard_finance_entry()`): вставка — только ревизия 1 и состояние `planned` или `posted`; изменение — ревизия ровно +1, без возврата posted → planned, аннулирование меняет только `state` и `void_reason`, аннулированная строка не меняется, `project_id`, `id`, `created_by`, `created_at` неизменны.
- `finance_entry_version` (AFTER INSERT OR UPDATE, `app.record_finance_entry_version()`): пишет версию с автором `updated_by` и временем `updated_at` строки. Вид изменения: вставка — `created`; переход в voided — `voided`; planned → posted — `posted`; иначе `updated`.
- RLS (FORCE) на всех трёх таблицах: SELECT — `auth.can_read_finance(project_id)` (человек, участник проекта, не отключён), INSERT/UPDATE — `auth.can_manage_finance(project_id)` (то же и роль `admin`). Версия принимается, только если её `revision` равна текущей ревизии операции: номер ревизии и содержимое версии руками не подделать и следующий номер не занять. Автора и время версия берёт из строки (`updated_by`, `updated_at`). Для runtime-роли их связывают ограничительные политики из `afterMigrate.sql` (`finance_entry_runtime_insert/update`, `finance_settings_runtime_insert/update`): `created_by`/`updated_by` = `auth.actor_id()`, время — не раньше начала транзакции. Роль-владелец (импорт) задаёт авторов и время сама. У runtime-роли нет DELETE на таблицах финансов и UPDATE на версиях.
- С миграции 075 политики чтения всех таблиц финансов, журнала тоже, имеют вид `project_id = ANY((SELECT auth.projects_with('finance.read'))::text[])`. `auth.projects_with(permission)` возвращает проекты, где у актора есть право, по правилам `auth.can`, и вычисляется один раз на запрос, а не на каждую строку.
- С миграции 076 черновик можно удалить (`POST …/discard`): триггер версии разрешает удаление только черновика, политика `finance_plan_version_delete` — только черновика и только с `finance.write`; план без версий удаляется вместе с последним черновиком (`finance_plan_delete`). Утверждённую или вытесненную версию не удалить никак, а внешний ключ версий не даёт удалить план, у которого есть утверждённая история.
- Триггеры плана: `finance_category_guard`, `finance_plan_guard` (ревизия +1, идентичность неизменна, период и релиз после утверждения неизменны), `finance_plan_version_guard` (вставка — только черновик ревизии 1; черновик меняет примечание или утверждается; утверждённая версия только вытесняется; вытесненная не меняется; удаления нет), `finance_plan_line_guard` (строки меняются только у черновика, версия блокируется `FOR SHARE`; релиз у строки — только в плане на весь проект), `finance_variance_note_guard` (то, к чему относится объяснение, и однажды записанная задача неизменны).
- RLS (FORCE) новых таблиц: SELECT — проект в `auth.projects_with('finance.read')`, INSERT/UPDATE — `auth.can(project_id, 'finance.write')`; DELETE — только строки плана (черновик заменяется при сохранении), остальное runtime-роль не удаляет. Ограничительные политики runtime-роли из `afterMigrate.sql` связывают авторов и время с актором запроса, утверждение — с тем, кто утверждает.
- Итоги не хранятся: сводка журнала и сводка плана считаются запросом при каждом чтении.

## API

Префикс `/api/v1/projects/{projectId}`. «Участник» ниже — человек, участник проекта в любой роли; агент получает 403 даже как участник. Команды требуют `Idempotency-Key` и `baseRevision`; человеку нужны `Origin` и `X-CSRF-Token`, как для остальных команд. Схемы — в `/openapi.json` и `contracts/finance.ts`.

| Метод и путь | Тело / параметры | Ответ | Кто |
|---|---|---|---|
| `GET /finance-settings` | — | `FinanceSettingsResponse {projectId, currencyCode, revision, updatedAt, timeZone}`; `timeZone` — пояс проекта (или пространства), в нём считаются «сегодня», периоды и просрочка | участник |
| `PUT /finance-settings` | `PutFinanceSettings {baseRevision, value:{currencyCode}}` | `FinanceSettingsResponse` | администратор |
| `GET /finance-entries` | `limit` 1–100 (50), `cursor`, `state`, `direction`, `from`, `to` | `FinanceEntryPageResponse {items, total, nextCursor}` | участник |
| `GET /finance-entries/{id}` | — | `FinanceEntryResponse` | участник |
| `PUT /finance-entries/{id}` | `PutFinanceEntry {baseRevision, value:{direction, state: planned\|posted, amountMinor, currencyCode, dueDate, postedDate, category, description, counterparty, reference}}`; `baseRevision` 0 — создание | `FinanceEntryResponse` | администратор |
| `PATCH /finance-entries/{id}/state` | `{state:'posted', baseRevision, postedDate, amountMinor}` или `{state:'voided', baseRevision, voidReason}` | `FinanceEntryResponse` | администратор |
| `GET /finance-entries/{id}/history` | `before` (ревизия) | `FinanceEntryHistoryResponse {items, nextCursor}`; `nextCursor` — номер ревизии для `before` | участник |
| `GET /finance-summary` | `from`, `to` | `FinanceSummaryResponse` | участник |
| `GET /finance-categories` | — | `FinanceCategoryListResponse {items}` | `finance.read` |
| `PUT /finance-categories/{id}` | `PutFinanceCategory {baseRevision, value:{name, direction, archived}}`; архив — тем же `PUT` | `FinanceCategoryResponse` | `finance.write` |
| `GET /finance-plans` | — | `FinancePlanListResponse {items}` | `finance.read` |
| `GET /finance-plans/{id}` | `version` | `FinancePlanResponse`: заголовок, все версии, строки выбранной (по умолчанию черновик, иначе утверждённая) | `finance.read` |
| `PUT /finance-plans/{id}` | `PutFinancePlan {baseRevision, value:{name, periodStart, periodEnd, releaseId}}`; 0 — создание с черновиком версии 1 | `FinancePlanResponse` | `finance.write` |
| `PUT /finance-plans/{id}/draft` | `PutFinancePlanDraft {baseRevision, version, value:{note, lines[]}}`, строка `{direction, categoryId, amountMinor, currencyCode, releaseId, note}` | `FinancePlanResponse` | `finance.write` |
| `POST /finance-plans/{id}/approve` | `ApproveFinancePlan {baseRevision, version}` | `FinancePlanResponse` | `finance.write` |
| `POST /finance-plans/{id}/discard` | `DiscardFinancePlanDraft {baseRevision, version}` — версия черновик | `FinanceDraftDiscardResponse {planId, planDeleted, plan}`; план, у которого кроме черновика ничего не было, удаляется вместе с ним | `finance.write` |
| `POST /finance-plans/{id}/revise` | `ReviseFinancePlan {baseRevision, version, note}` — версия утверждённая | `FinancePlanResponse` | `finance.write` |
| `GET /finance-overview` | `plan`, `version` | `FinanceOverviewResponse` | `finance.read` |
| `PUT /finance-variance-notes/{id}` | `PutFinanceVarianceNote {baseRevision, value:{planId, version, categoryId, direction, currencyCode, text}, createTask:{title, ownerId, due} \| null}` | `FinanceVarianceNoteResponse` | `finance.write`, для задачи ещё `tasks.write` |

В таблице выше «участник» — человек с `finance.read`, «администратор» — с `finance.write` (так стало с каталогом прав, см. ADR 0003). Ввод операции требует `categoryId` и принимает `releaseId`; ответ отдаёт `category` (подпись), `categoryId`, `categoryName`, `releaseId`.

Ошибки: `409 CONFLICT` — ревизия устарела; `409 IDEMPOTENCY_CONFLICT` — ключ уже использован для другого тела; `409 FINANCE_ENTRY_VOIDED`, `FINANCE_ENTRY_POSTED`, `FINANCE_STATE_CHANGE`, `FINANCE_LIMIT`, `FINANCE_CATEGORY_NAME`, `FINANCE_CATEGORY_IN_USE`, `FINANCE_PLAN_VERSION_FROZEN`, `FINANCE_PLAN_APPROVED`, `FINANCE_PLAN_NOT_APPROVED`, `FINANCE_PLAN_DRAFT_EXISTS`, `FINANCE_NOTE_EXISTS`, `FINANCE_NOTE_FIXED`, `FINANCE_NOTE_TASK_EXISTS`; `422 FINANCE_DATE`, `FINANCE_CATEGORY`, `FINANCE_CATEGORY_ARCHIVED`, `FINANCE_CATEGORY_DIRECTION`, `FINANCE_RELEASE`, `FINANCE_RELEASE_ARCHIVED`, `FINANCE_PLAN_LINE_RELEASE`, `FINANCE_PLAN_EMPTY`, `FINANCE_PLAN_VERSION`; `400` — тело или параметры не по контракту, `400 IDEMPOTENCY_KEY` — нет или неверный ключ повтора, `400 CURSOR_INVALID` — курсор другого списка; `401 UNAUTHENTICATED`; `403` — нет прав; `404` — нет проекта или операции.

Квитанция повтора (`app.idempotency`) для операции хранит только `{id, revision}`: повтор собирает ответ из версии этой ревизии, даже если операцию успели изменить. Для валюты проекта квитанция хранит только `{revision}`, повтор отвечает текущими настройками. Квитанции категорий и объяснений хранят `{id, revision}`, команд плана — `{id, version}`; повтор отвечает текущим состоянием. Суммы, тексты и валюта остаются в таблицах финансов под их RLS.

Сводка журнала: `currencies[]` (`postedIncome`, `postedExpense`, `balance` — «Чистый результат», `plannedIncome`, `plannedExpense`, `forecast` — «Ожидаемый результат» = чистый результат + ожидаемые поступления − ожидаемые расходы, `postedCount`, `plannedCount`, `voidedCount`), `months[]` (`month` `YYYY-MM`, суммы по валюте), `categories[]` (`categoryId`, `category` — текущее имя, `direction`, `currencyCode`, `posted`, `planned`). Аннулированные операции в суммы не входят. Все суммы сводки — десятичные строки минимальных единиц: они точны и за пределами 2⁵³.

События outbox: `finance-entry.created`, `finance-entry.updated`, `finance-entry.posted`, `finance-entry.voided`, `finance-settings.updated`, `finance-category.created`, `finance-category.updated`, `finance-plan.created`, `finance-plan.updated`, `finance-plan.draft-updated`, `finance-plan.approved`, `finance-plan.revised`, `finance-plan.draft-discarded`, `finance-variance.noted` (ресурс и ревизия, без сумм и текстов; для событий плана ресурс — план, `revision` — номер версии). Лента событий отдаёт их только людям с `finance.read`.

## Импорт пилотных данных

Пилот (sprintique.jarnee.com) хранит `project_finance_settings(project_id, currency_code)` и `project_finance_entries` с неизменяемыми ревизиями. Соответствие:

| Пилот | vNext |
|---|---|
| `project_finance_settings.currency_code` | `app.finance_settings.currency_code`, `revision = 1`, `updated_by` — администратор проекта |
| `direction` | `direction` |
| `amount_minor`, `currency_code` | `amount_minor`, `currency_code` |
| `occurred_on` | `posted_date` (`due_date` — NULL) |
| `status = posted` | `state = 'posted'` |
| `status = voided`, `void_reason` | сначала `posted`, затем `state = 'voided'`, `void_reason` |
| `category` | `category` как подпись и `category_id` категории этого имени (создайте её в `app.finance_category` заранее) |
| `description`, `counterparty`, `reference` | те же колонки (пустые строки — NULL) |
| `version` и ревизии | `revision` 1…N; каждая ревизия пилота — отдельный UPDATE |
| `created_by`, `updated_by`, время | `created_by`, `updated_by`, `created_at`, `updated_at` (principal id vNext) |

Порядок для каждой операции, в одной транзакции на проект:

1. `INSERT INTO app.finance_entry(...)` с первой ревизией пилота: `revision = 1`, `state = 'posted'`, `posted_date = occurred_on`, `created_by = updated_by = автор`, `created_at = updated_at = время создания`. Не указывайте `entry_date`: она вычисляется.
2. Для каждой следующей ревизии — `UPDATE app.finance_entry SET ..., revision = revision + 1, updated_by = <автор>, updated_at = <время ревизии> WHERE project_id = … AND id = …`. Аннулирование — последняя ревизия: `state = 'voided'`, `void_reason = …`, остальные поля без изменений.
3. Версии в `app.finance_entry_version` создаёт триггер — отдельно их не вставляйте. `id` операции — идентификатор пилота, если он подходит под `^[A-Za-z0-9_-]{1,100}$` (UUID подходит).

Роль и контекст: таблицы под FORCE RLS, поэтому роль-владелец (миграционная) видит и пишет строки, только если в транзакции задан администратор проекта: `SELECT set_config('app.actor_id', '<principal id администратора>', true), set_config('app.project_limit', '', true);`. Суперпользователь RLS обходит, триггеры действуют для всех ролей. Проверка после загрузки: `SELECT count(*) FROM app.finance_entry_version` равно сумме ревизий; сводка `GET /finance-summary` совпадает с итогами пилота по каждой валюте (аннулированные не учитываются).

Если переносить версии пилота как есть, с отключёнными триггерами (`SET session_replication_role = replica`, только суперпользователь), нужно самому соблюсти инварианты: версии 1…`revision` у каждой операции, последняя версия совпадает со строкой операции, `change` соответствует переходу.

## Откат

`server/src/main/resources/db/rollback/V20261001000072__finance_plan.sql` откатывает 072–076: возвращает политики чтения журнала из V20260929000025, удаляет `auth.projects_with`, категории, планы, версии, строки и объяснения, колонки `category_id` и `release_id`, возвращает функции журнала из V20260929000025, удаляет события и квитанции плана и строки Flyway 072–076. Операции сохраняют текст категории. Выполняется миграционной ролью при остановленных API и воркере, до отката V20260929000025; `FinancePlanIntegrationTest` выполняет его в транзакции и откатывает её.

`server/src/main/resources/db/rollback/V20260929000025__add_project_finance.sql` удаляет таблицы, функции, события и квитанции повторов финансов и строку миграции в `flyway_schema_history`. Данные финансов теряются: сначала резервная копия. Выполняется миграционной ролью при остановленных API и воркере, затем запускается предыдущий артефакт. Интеграционный тест `FinanceLedgerIntegrationTest` выполняет скрипт в транзакции и откатывает её.

## Интерфейс

Раздел «Финансы» проекта (`#finance`, операция — `#finance/{id}`) открывается на «Обзоре», рядом «Журнал». Обзор сделан по утверждённому направлению B2 «Шкала, тише». Сверху одна фраза о состоянии, собранная из `state.code` сводки. Под ней для каждой валюты контейнер «Весь проект» или релиза плана с периодом: большая шкала (факт, ещё ожидается, отметка плана и перерасход за ней в тоне опасности) и четыре числа без легенд — план, факт, ещё ожидается и прогноз на конец периода с одной строкой отклонения в его тоне. Дальше «По категориям»: тонкая шкала каждой категории против общей отметки плана, отклонение справа только когда оно не нулевое, объяснение одной тихой строкой или «Объяснить» для того, кто ведёт финансы. Подсказка дизайн-системы при наведении или фокусе строки показывает план, факт, ещё ожидается, прогноз и автора с датой объяснения и задачей; у каждой шкалы есть текстовый эквивалент для экранного диктора. Последняя строка говорит о просроченных ожидаемых операциях и ведёт «В журнал», где журнал открывается на них. Без плана обзор показывает «Плана нет», план «нет», «Ожидаемый результат» с подписью «с учётом доходов» и категории расходов против самой крупной. В шапке выбор плана (план и версия), тихая ссылка «Черновик», когда черновик есть, «Пересмотреть», когда есть только утверждённая версия, «Составить план», когда планов нет, и «Новая операция». Редактор плана — одна форма строк «категория — сумма — релиз» (категорию можно выбрать или создать), шкала черновика против факта и ожидаемого, «Итого», одна строка «В версии N было…», «Причина пересмотра», «Утвердить версию N», «Сохранить черновик» и «Удалить черновик». Объяснение пишется в диалоге: текст и по желанию «Создать задачу» с названием. Кто только читает финансы, видит обзор без этих действий. Валюты не складываются: на каждую свой контейнер. Только десктоп. Журнал остался прежним: итоги периода по валютам (поступило, потрачено, «Чистый результат», «Ожидаемый результат»), фильтры, подгрузка, диалоги операции, проведения, аннулирования, истории и валюты проекта; прежняя вкладка «Сводка» по месяцам и категориям заменена обзором. Примитивы — из IQUIPAGE 0.6.0-vnext.30: `scale()` для шкал, `ui.amount()` для суммы с валютой, строки «подпись — значение» в `iq-tooltip`, `iq-combobox creatable` для выбора категории с созданием. Код: `ui/finance/src/` (`overview-model.js` — слова и числа, `overview.js` — обзор и диалог объяснения, `plan-editor.js` — редактор). «Сегодня», периоды, статус «Просрочена» и даты по умолчанию считаются в часовом поясе проекта, как в планировании. Валюту можно выбрать из всех кодов ISO 4217, которые знает браузер (сначала используемые и частые). Категорию операции выбирают из справочника проекта (подсказки — действующие категории) или вводят новую: диалог создаёт её через `PUT /finance-categories/{id}` с направлением операции.  Ошибка ввода привязана к полю (`aria-invalid`, `aria-describedby`, фокус). Код: `ui/finance/src/`.

## Производительность сводки

Запрос сводки плана (`FinanceOverview.FIGURES`) проверен `EXPLAIN (ANALYZE, BUFFERS)` под runtime-ролью с row security, на PostgreSQL 18.4 (Apple M5 Pro, тёплый кэш). Данные: 100 000 операций одного проекта за два года (с октября 2025 по сентябрь 2027), 20 категорий, RUB и USD, каждая десятая ожидается, около 2,4% аннулированы; утверждённая версия плана на 2026 год из 40 строк. В период плана попадает 50 005 операций.

До миграции 075 политика чтения вызывала `auth.can_read_finance(project_id)` на каждую строку: выполнение 601 мс, 99 411 буферов, из них 583 мс — фильтр политики на чтении операций. После 075 проекты читающего вычисляются один раз (InitPlan), и тот же запрос выполняется за 18,9–19,8 мс в трёх прогонах (планирование 1,7 мс, 1 740 буферов): Bitmap Index Scan по `ix_finance_entry__entry_date` выбирает 50 005 строк за 1,7 мс, Bitmap Heap Scan с фильтром `state <> 'voided'` отдаёт 48 786 строк за 7,3 мс, HashAggregate сводит их в 40 групп. Сводка без плана по всем 100 000 операциям (последовательное чтение, 97 568 строк) — 37,0 мс.
