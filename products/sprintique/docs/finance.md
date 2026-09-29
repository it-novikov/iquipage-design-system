# Финансы проекта

Журнал операций проекта: доходы и расходы, ожидаемые и проведённые, с аннулированием, историей версий и сводкой по валютам. Решение и альтернативы — [ADR 0003](decisions/0003-project-finance.md). Счетов, переводов, бюджетов, сценариев и курсов валют нет.

## Правила

- **Суммы** — целые минимальные единицы (`amount_minor`, копейки для RUB), от 1 до 10¹⁵−1. Число знаков после запятой берётся из ISO 4217 (RUB 2, JPY 0, KWD и IQD 3), а не из локали браузера: одна и та же `amount_minor` означает одну сумму в любом клиенте и в импорте. Направление задаёт `direction` (`income` или `expense`), сумма всегда положительна.
- **Валюта** — ISO-код из трёх заглавных латинских букв. Валюта проекта (по умолчанию RUB) подставляется в новые операции; у операции может быть своя. Итоги считаются по каждой валюте отдельно.
- **Состояния.** `planned` — ожидается к `due_date`. `posted` — прошла `posted_date`. Проведение запланированной операции ставит фактическую дату и сумму, плановая дата остаётся. `voided` — аннулирована с причиной (`void_reason`), окончательно; даты и суммы остаются как были. Переходы: planned → posted, planned → voided, posted → voided. Возврата в план и удаления нет.
- **Дата операции** (`entry_date`) — фактическая, иначе плановая. По ней сортируется журнал, строятся разрезы по месяцам и фильтры `from`/`to`. Допустимые даты — 1900–2999 годы; это правило проверяет приложение, база его не держит. Период `from`/`to` с началом позже конца отклоняется (`422 FINANCE_DATE`).
- **Правка** не меняет состояние: проводится и аннулируется операция своей командой. Аннулированная операция не меняется.
- **История.** Каждое сохранённое состояние — версия с полным снимком, видом изменения, автором и временем. Версии не меняются и не удаляются.
- **Права.** Читают люди-участники проекта в любой роли; меняют администраторы проекта. Агенты и администраторы пространства без участия в проекте финансов не видят; события `finance-*` агентам не отдаются.
- **Лимиты.** 100 000 операций на проект; категория до 80 знаков, описание до 500, контрагент и документ до 160, причина аннулирования до 300; страница журнала до 100, история по 50; сводка — последние 240 месяцев (по всем валютам) и до 200 крупнейших категорий в каждой валюте (`truncated`).

## Схема (миграция `V20260929000025__add_project_finance.sql`)

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
| `category` | text | NOT NULL, 1–80 |
| `description` | text | NOT NULL, 1–500 |
| `counterparty` | text | NULL или 1–160 |
| `reference` | text | NULL или 1–160 (номер счёта, договора, платёжки) |
| `void_reason` | text | задана тогда и только тогда, когда `state = 'voided'`; 1–300 |
| `revision` | integer | NOT NULL, > 0 |
| `created_by`, `updated_by` | text | NOT NULL, FK `auth.principals` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, по умолчанию `clock_timestamp()` |

Проверки: `ck_finance_entry__planned` (planned ⇒ `due_date` есть, `posted_date` нет), `ck_finance_entry__posted` (posted ⇒ `posted_date` есть), `ck_finance_entry__dated` (хотя бы одна дата), `ck_finance_entry__void_reason`. Индекс `ix_finance_entry__entry_date (project_id, entry_date DESC, id DESC)`.

### `app.finance_entry_version` — версии

`(project_id, entry_id, revision)` — PK; FK на `app.finance_entry`. Колонки снимка — `direction`, `state`, `amount_minor`, `currency_code`, `due_date`, `posted_date`, `category`, `description`, `counterparty`, `reference`, `void_reason`; плюс `change` (`created` \| `updated` \| `posted` \| `voided`), `actor_id` (FK `auth.principals`) и `created_at`.

### Триггеры и доступ

- `finance_entry_guard` (BEFORE INSERT OR UPDATE, `app.guard_finance_entry()`): вставка — только ревизия 1 и состояние `planned` или `posted`; изменение — ревизия ровно +1, без возврата posted → planned, аннулирование меняет только `state` и `void_reason`, аннулированная строка не меняется, `project_id`, `id`, `created_by`, `created_at` неизменны.
- `finance_entry_version` (AFTER INSERT OR UPDATE, `app.record_finance_entry_version()`): пишет версию с автором `updated_by` и временем `updated_at` строки. Вид изменения: вставка — `created`; переход в voided — `voided`; planned → posted — `posted`; иначе `updated`.
- RLS (FORCE) на всех трёх таблицах: SELECT — `auth.can_read_finance(project_id)` (человек, участник проекта, не отключён), INSERT/UPDATE — `auth.can_manage_finance(project_id)` (то же и роль `admin`). Версия принимается, только если её `revision` равна текущей ревизии операции: руками историю не подделать и следующий номер не занять. У runtime-роли нет DELETE на таблицах финансов и UPDATE на версиях.
- Итоги не хранятся: сводка считается запросом при каждом чтении.

## API

Префикс `/api/v1/projects/{projectId}`. «Участник» ниже — человек, участник проекта в любой роли; агент получает 403 даже как участник. Команды требуют `Idempotency-Key` и `baseRevision`; человеку нужны `Origin` и `X-CSRF-Token`, как для остальных команд. Схемы — в `/openapi.json` и `contracts/finance.ts`.

| Метод и путь | Тело / параметры | Ответ | Кто |
|---|---|---|---|
| `GET /finance-settings` | — | `FinanceSettingsResponse` | участник |
| `PUT /finance-settings` | `PutFinanceSettings {baseRevision, value:{currencyCode}}` | `FinanceSettingsResponse` | администратор |
| `GET /finance-entries` | `limit` 1–100 (50), `cursor`, `state`, `direction`, `from`, `to` | `FinanceEntryPageResponse {items, total, nextCursor}` | участник |
| `GET /finance-entries/{id}` | — | `FinanceEntryResponse` | участник |
| `PUT /finance-entries/{id}` | `PutFinanceEntry {baseRevision, value:{direction, state: planned\|posted, amountMinor, currencyCode, dueDate, postedDate, category, description, counterparty, reference}}`; `baseRevision` 0 — создание | `FinanceEntryResponse` | администратор |
| `PATCH /finance-entries/{id}/state` | `{state:'posted', baseRevision, postedDate, amountMinor}` или `{state:'voided', baseRevision, voidReason}` | `FinanceEntryResponse` | администратор |
| `GET /finance-entries/{id}/history` | `before` (ревизия) | `FinanceEntryHistoryResponse {items, nextCursor}`; `nextCursor` — номер ревизии для `before` | участник |
| `GET /finance-summary` | `from`, `to` | `FinanceSummaryResponse` | участник |

Ошибки: `409 CONFLICT` — ревизия устарела; `409 IDEMPOTENCY_CONFLICT` — ключ уже использован для другого тела; `409 FINANCE_ENTRY_VOIDED`, `FINANCE_ENTRY_POSTED`, `FINANCE_STATE_CHANGE`, `FINANCE_LIMIT`; `422 FINANCE_DATE`; `400` — тело или параметры не по контракту, `400 IDEMPOTENCY_KEY` — нет или неверный ключ повтора, `400 CURSOR_INVALID` — курсор другого списка; `401 UNAUTHENTICATED`; `403` — нет прав; `404` — нет проекта или операции.

Квитанция повтора (`app.idempotency`) хранит только `{id, revision}`; повтор собирает ответ из версии этой ревизии, поэтому суммы и тексты остаются в таблицах финансов под их RLS.

Сводка: `currencies[]` (`postedIncome`, `postedExpense`, `balance`, `plannedIncome`, `plannedExpense`, `forecast` = баланс + ожидаемые поступления − ожидаемые расходы, `postedCount`, `plannedCount`, `voidedCount`), `months[]` (`month` `YYYY-MM`, суммы по валюте), `categories[]` (`category`, `direction`, `currencyCode`, `posted`, `planned`). Аннулированные операции в суммы не входят. Все суммы сводки — десятичные строки минимальных единиц: они точны и за пределами 2⁵³.

События outbox: `finance-entry.created`, `finance-entry.updated`, `finance-entry.posted`, `finance-entry.voided`, `finance-settings.updated` (ресурс и ревизия, без содержимого).

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
| `category`, `description`, `counterparty`, `reference` | те же колонки (пустые строки — NULL) |
| `version` и ревизии | `revision` 1…N; каждая ревизия пилота — отдельный UPDATE |
| `created_by`, `updated_by`, время | `created_by`, `updated_by`, `created_at`, `updated_at` (principal id vNext) |

Порядок для каждой операции, в одной транзакции на проект:

1. `INSERT INTO app.finance_entry(...)` с первой ревизией пилота: `revision = 1`, `state = 'posted'`, `posted_date = occurred_on`, `created_by = updated_by = автор`, `created_at = updated_at = время создания`. Не указывайте `entry_date`: она вычисляется.
2. Для каждой следующей ревизии — `UPDATE app.finance_entry SET ..., revision = revision + 1, updated_by = <автор>, updated_at = <время ревизии> WHERE project_id = … AND id = …`. Аннулирование — последняя ревизия: `state = 'voided'`, `void_reason = …`, остальные поля без изменений.
3. Версии в `app.finance_entry_version` создаёт триггер — отдельно их не вставляйте. `id` операции — идентификатор пилота, если он подходит под `^[A-Za-z0-9_-]{1,100}$` (UUID подходит).

Роль и контекст: таблицы под FORCE RLS, поэтому роль-владелец (миграционная) видит и пишет строки, только если в транзакции задан администратор проекта: `SELECT set_config('app.actor_id', '<principal id администратора>', true), set_config('app.project_limit', '', true);`. Суперпользователь RLS обходит, триггеры действуют для всех ролей. Проверка после загрузки: `SELECT count(*) FROM app.finance_entry_version` равно сумме ревизий; сводка `GET /finance-summary` совпадает с итогами пилота по каждой валюте (аннулированные не учитываются).

Если переносить версии пилота как есть, с отключёнными триггерами (`SET session_replication_role = replica`, только суперпользователь), нужно самому соблюсти инварианты: версии 1…`revision` у каждой операции, последняя версия совпадает со строкой операции, `change` соответствует переходу.

## Откат

`server/src/main/resources/db/rollback/V20260929000025__add_project_finance.sql` удаляет таблицы, функции, события и квитанции повторов финансов и строку миграции в `flyway_schema_history`. Данные финансов теряются: сначала резервная копия. Выполняется миграционной ролью при остановленных API и воркере, затем запускается предыдущий артефакт. Интеграционный тест `FinanceLedgerIntegrationTest` выполняет скрипт в транзакции и откатывает её.

## Интерфейс

Раздел «Финансы» проекта (`#finance`, операция — `#finance/{id}`): итоги периода по валютам (поступило, потрачено, баланс, с учётом ожидаемых), журнал с фильтрами по статусу и направлению и подгрузкой страниц, сводка по месяцам и категориям, диалоги операции, проведения, аннулирования, истории и валюты проекта. Участники без прав администратора видят данные и имя администратора вместо кнопок. Код: `ui/finance/src/`.
