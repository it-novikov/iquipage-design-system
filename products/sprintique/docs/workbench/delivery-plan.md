# IQUIPAGE / Sprintique: delivery plan единого рабочего стола

**Статус:** PROPOSED — ready for implementation только после G0–G2 semantic/privacy gates  
**Связанный brief:** `iquipage-workbench-solution-brief.md`, revision 3  
**Integration base:** `origin/main` `0bdd515`; PR #19/#20 merged; PR #21 изолирован как typography/DS upgrade  
**Риск:** HIGH — новый cross-project read path, RLS, private state/event boundary, точные recipients, delegation semantics и единая snapshot pagination  
**Принцип:** Workbench first; Task remains canonical; Project remains security boundary; owner/due are signals, not gates  

## 1. Результат поставки

Добавить глобальный `Рабочий стол` с двумя линзами:

- `Сейчас`: `Нужно действие / Текущая работа / Изменилось`;
- `План`: read-only `Сегодня / 7 дней`.

`Текущая работа` содержит различимые группы `В фокусе / В работе / Жду`. Одна Task показывается одной строкой и открывается в существующем canonical drawer без смены project context. Каждая строка содержит human-readable primary reason и project identity.

Внешний MVP — не ранний read-only tech slice, а совокупность:

1. безопасная cross-project проекция;
2. exact-recipient requests/approvals;
3. private focus/follow/seen/snooze;
4. private `Жду` для явно контролируемого делегирования;
5. read-only `Сегодня / 7 дней` по существующим датам;
6. drawer/deep-link/focus recovery;
7. real PostgreSQL/RLS, accessibility и usability gates.

Не входят в MVP:

- assistant и AI ranking;
- private/shared cross-project bulk;
- внешние календари и meeting records;
- portfolio control dashboard;
- first-class Hypothesis;
- universal `Item`, arbitrary Collections и finance aggregation.

## 2. Обязательные архитектурные решения

### A. Task first

`Task` остаётся каноническим исполнимым объектом. Workbench не хранит копию title/body/status и не создаёт новый общий resource aggregate.

### B. Projection, не container

Workbench — application read model. Он не владеет ACL, не создаёт fake project `all` и не имеет cross-project aggregate revision.

### C. Explicit attention, не score

Сервер возвращает section/group, primary reason и secondary reasons. Клиент не вычисляет скрытый priority score из owner/due/recency.

### D. Exact obligation

`Нужно действие` заполняется только open request/approval с точным human recipient. `status=review`, role, project membership, unresolved discussion без адресата и due не являются request.

### E. Private state имеет private event boundary

Focus/follow/seen/snooze/waiting не пишутся в обычный project-visible audit/outbox. Нужен principal-scoped stream/receipt или visibility class с отдельной RLS policy. Personal events не попадают в project SSE.

### F. Independent revisions

Seen, focus reorder и snooze не должны конфликтовать через один whole-row CAS. Каждое поле изменяется специализированной command с собственным revision.

### G. Snapshot-consistent first screen

Counts и первые страницы всех секций приходят одной transactionally consistent envelope. Раздельные endpoints не должны создавать невозможный экран, где Task одновременно есть в двух секциях или count не соответствует rows.

### H. Project-local AI only until separate policy

Никакого global agent credential и raw cross-workspace prompt. Assistant не блокирует MVP и проходит отдельный threat review.

## 3. Доменная модель

Имена ниже логические; окончательные DDL и naming согласовать с текущими conventions.

### 3.1 Task provenance

При необходимости добавить immutable `created_by` для общей трассировки, но **не** использовать его как delegation relation или вечную подписку.

- новые Task получают `created_by` из actor;
- backfill только при однозначном `task.created` audit evidence;
- неизвестное legacy value остаётся `NULL`;
- creator не попадает автоматически в `Жду`.

### 3.2 Private Task state

```text
app.task_personal_state
  project_id
  task_id
  principal_id
  following boolean
  follow_revision bigint
  focus_rank bigint nullable
  focus_revision bigint
  last_seen_event_sequence bigint nullable
  seen_revision bigint
  snoozed_until timestamptz nullable
  snooze_revision bigint
  muted boolean
  mute_revision bigint
  updated_at
  PRIMARY KEY (project_id, task_id, principal_id)
```

Правила:

- `principal_id = auth.actor_id()` и current `auth.can_project(project_id)`;
- специализированные commands вместо whole-row `PUT`;
- `thread_reads` остаётся источником истины для discussion read-state;
- task `revision` не используется как watermark значимых событий;
- revoke project access делает private row недоступной и исключает её из проекции;
- private state не виден другим project members и shared agents.

### 3.3 Private `Жду`

```text
app.task_wait_state
  project_id
  task_id
  principal_id                 -- кто ждёт
  source_assignment_event_id
  expected_assignee_id nullable
  check_back_at timestamptz nullable
  state active|resolved|cancelled
  wait_revision bigint
  created_at
  updated_at
  PRIMARY KEY (project_id, task_id, principal_id)
```

Lifecycle:

- создаётся только явным действием пользователя или explicit opt-in при assignment другому человеку;
- reassignment меняет current displayed assignee через canonical Task и создаёт update;
- completion/cancellation закрывает или предлагает закрыть `Жду` согласно утверждённому product contract;
- reopen возвращает relation в active только по явному правилу, не магически;
- `check_back_at` — private checkpoint, не Task due;
- выход ожидаемого assignee из проекта не удаляет relation: UI показывает orphan/reassigned state без утечки закрытых данных.

### 3.4 Structured attention request

```text
app.attention_requests
  project_id
  id
  task_id
  recipient_principal_id
  kind answer|review|decision|approval
  thread_id nullable
  approval_id nullable
  status open|resolved|cancelled
  needed_by timestamptz nullable
  source_revision bigint
  request_revision bigint
  created_by
  created_at
  resolved_at nullable
  idempotency_key
```

Constraints:

- recipient — current human project member с нужной capability;
- task_id обязателен;
- для source-specific request — typed FK и `CHECK` допустимых комбинаций; не строковый `source_kind/source_id` без FK;
- request — envelope над canonical source, не второй источник истины;
- resolve/cancel/reassign использует CAS, idempotency и повторную авторизацию;
- source resolution атомарно или детерминированно синхронизирует request status;
- `read`/`seen` никогда не меняет `status`;
- indefinite snooze для direct request отсутствует; новый более сильный reason и наступивший `neededBy` пробивают snooze;
- при потере recipient membership применяется ADR: reassign, cancel или orphaned admin queue; молчаливое исчезновение запрещено.

### 3.5 Private events and receipts

Минимальный private event/receipt contract:

```text
app.private_operation_receipts
  principal_id
  operation_id
  command_kind
  resource_project_id
  resource_id
  original_effect_revision
  result_summary_json          -- без title/body
  created_at
  expires_at nullable
```

- own-only RLS;
- replay возвращает original effect/receipt, а current state запрашивается отдельно;
- private commands не создают shared project notification;
- для `seen` допустим компактный state marker без вечного event log;
- никакого title/body/project name в telemetry.

### 3.6 Idea → Task provenance — P1

Не общий polymorphic relation, а typed table:

```text
app.idea_task_links
  project_id
  map_id
  node_id
  task_id
  source_map_revision
  source_snapshot_json
  created_by
  created_at
  UNIQUE (project_id, map_id, node_id, task_id)
```

Conversion command:

- показывает destination project и переносимые поля;
- сохраняет source;
- создаёт Task и link транзакционно;
- idempotency receipt предотвращает duplicate после unknown result;
- допускает many Tasks per idea и несколько idea links per Task;
- subsequent idea edits не переписывают Task;
- undo — unlink/archive с audit, не скрытое delete.

### 3.7 Hypothesis/Experiment — research gate P1

Если workflow через Map template + research Task + approval подтвердит отдельную сущность:

```text
app.hypotheses
  project_id, id
  title, assumption, experiment
  metric, target, deadline
  state planned|running|confirmed|rejected|inconclusive
  conclusion, next_decision
  revision, created_by, timestamps

app.hypothesis_task_links(project_id, hypothesis_id, task_id, role)
app.hypothesis_evidence(project_id, id, hypothesis_id, kind, value, source_uri, recorded_by, recorded_at)
app.hypothesis_decisions(project_id, id, hypothesis_id, outcome, rationale, decided_by, decided_at)
```

Finance fields и expense links остаются optional extension. Не создавать универсальный `work_relation` без FK.

## 4. Workbench projection contract

### 4.1 First-screen envelope

```text
GET /api/workbench
  ?mode=now
  &projectIds=...
  &limitPerSection=10

200
  snapshotToken
  generatedAt
  scope
  sections[]
    key: action|current|updates
    count: exact integer | capped "99+"
    groups[]                 -- только current: focus|active|waiting
    rows[]
    nextCursor
```

Требования:

- один transaction/snapshot для counts и первых pages;
- pagination cursor отдельный для каждой section/group;
- cursor opaque, signed, actor/filter/schema/expiry-bound;
- dedupe выполняется до pagination;
- foreign project никогда не влияет на count, timing, error text или cursor;
- cache key включает actor authorization epoch и scope;
- response `Cache-Control: no-store` для персонального Workbench;
- exact count для direct actions; updates допускают capped count;
- query hard limits и statement budget.

### 4.2 Row DTO

```text
resourceKind: task
projectId, projectDisplayName
workspaceDisplayName?        -- только для disambiguation
taskId, displayId, taskRevision
title
status, type, priority
owner?
due?, plannedStart?, plannedEnd?
section
group?
primaryReason { code, text, actor?, occurredAt?, neededBy? }
secondaryReasons[]
allowedActions[]             -- UI hint only
canonicalUrl
```

Не возвращать body/comment excerpts в first-screen row без отдельного UX/security решения.

### 4.3 Reason codes

P0:

- `request_to_you`;
- `approval_to_you`;
- `manual_focus`;
- `assigned_active`;
- `delegated_by_you`;
- `delegated_completed`;
- `delegated_blocked`;
- `your_work_blocked`;
- `you_block_relevant_work` только при доказанном next action;
- `followed_status_changed`;
- `followed_owner_changed`;
- `followed_due_changed`;
- `followed_dependency_changed`;
- `followed_thread_changed`.

Запрещённые эвристики:

- `project_member` / `project_admin`;
- `recently_changed` без relation;
- `due_exists` без relation;
- `status_review` без exact recipient;
- text parsing из Markdown;
- `created_by_you` как `delegated_by_you`.

### 4.4 Inclusion и precedence

```text
action = open exact-recipient request/approval

current.focus = focus_rank IS NOT NULL
current.active = owner = actor AND normalized workflow category = active
current.waiting = active private wait_state

updates = explicit relation exists
          AND meaningful shared event sequence > last_seen_event_sequence
          AND event is not suppressed own-noise

precedence = action > focus > active > waiting > updates
```

Task может иметь несколько current reasons, но одна primary placement. `Assigned` backlog/todo остаётся доступен через `Фильтры → Назначено мне`, а не заполняет default first screen.

### 4.5 Canonical ordering

- action: overdue `neededBy` → neededBy soon → request age → stable ID;
- focus: `focus_rank` → stable ID;
- active: workflow position/startedAt → priority → due nullable last → stable ID;
- waiting: overdue `checkBackAt` → checkBackAt → last meaningful event → stable ID;
- updates: newest meaningful event per Task → stable ID.

Скрытая AI-сортировка отсутствует. Пользовательская arbitrary sort в MVP отсутствует.

## 5. `План`: Today / 7 days

```text
GET /api/workbench/plan
  ?horizon=today|7d
  &projectIds=...
  &timezone=Europe/Moscow
```

Источники P0:

- Task `plannedStart/plannedEnd`;
- Task `due`;
- open `attention_request.neededBy`;
- private `task_wait_state.checkBackAt`;
- project milestones/releases, если current schema даёт canonical link and access;
- manual focus без date отдельной группой `Без времени`, не как ошибка.

Правила:

- read-only; drag/drop и cross-project reschedule не входят в MVP;
- date/time semantics не смешиваются;
- date-only значение отображается без фиктивного времени;
- timezone explicitly chosen and persisted;
- inaccessible projects полностью исключаются до grouping/counting;
- recurring/lifestyle objects отсутствуют;
- task без даты не исчезает из `Сейчас`.

## 6. API commands

### Personal state

```text
PUT /projects/:projectId/tasks/:taskId/personal/follow
  If-Match: followRevision

PUT /projects/:projectId/tasks/:taskId/personal/focus
  If-Match: focusRevision

PUT /projects/:projectId/tasks/:taskId/personal/seen
  If-Match: seenRevision

PUT /projects/:projectId/tasks/:taskId/personal/snooze
  If-Match: snoozeRevision
```

Каждая command:

- требует idempotency key;
- повторно проверяет current project access;
- возвращает immutable receipt и updated field revision;
- не принимает другие personal fields в body;
- не пишет shared event.

### Waiting

```text
POST   /projects/:projectId/tasks/:taskId/wait-state
PATCH  /projects/:projectId/tasks/:taskId/wait-state
DELETE /projects/:projectId/tasks/:taskId/wait-state
```

Удаление означает прекращение private tracking, не удаление Task. Для recoverability предпочтительнее state=`cancelled` + receipt.

### Directed request

```text
POST  /projects/:projectId/tasks/:taskId/requests
PATCH /projects/:projectId/requests/:requestId
POST  /projects/:projectId/requests/:requestId/resolve
POST  /projects/:projectId/requests/:requestId/cancel
```

Server всегда повторно проверяет recipient, membership/capability, source revision и source lifecycle. `allowedActions[]` никогда не используется как authorization evidence.

### Drawer route

Canonical key — `(projectId, taskId)`:

```text
/workbench/tasks/:projectId/:taskId
```

Reload открывает full Task route/presenter. Close/back восстанавливает origin state через route state/snapshot key; display ID без project identity недостаточен.

## 7. SQL/RLS/query design

Projection строится bounded set-based query/CTE:

1. authorized projects для actor;
2. open exact requests/approvals;
3. personal focus/follow/wait relations own-only;
4. active assigned tasks;
5. meaningful shared events после personal sequence;
6. `UNION ALL` reason candidates;
7. dedupe/rank by `(project_id, task_id)`;
8. section/group ordering;
9. counts и page rows из одного snapshot.

Запрещено:

- загружать все projects и выполнять N+1;
- фильтровать ACL после SQL;
- cache без actor/auth epoch;
- раскрывать total до RLS;
- cursor, который можно перенести другому actor;
- использовать project membership как relevance;
- считать arbitrary audit events meaningful.

Capacity fixture должен включать много memberships, revoked projects, 30–50 assigned tasks, dense updates, undated/unassigned tasks и дубликаты reason candidates.

## 8. Events и freshness

Shared changes продолжают использовать project outbox/project sequence. Personal seen хранит последний просмотренный **relevant event sequence**, а не Task revision.

Meaningful taxonomy P0:

- status/owner/due/planning/dependency changes другим actor;
- addressed reply или source change watched thread;
- completion/reopen/cancellation/blocker/reassignment delegated work;
- request created/reassigned/resolved/cancelled.

Suppression/grouping:

- собственные низкозначимые правки сворачиваются или не создают update;
- одна Task даёт одну update row независимо от числа events;
- causation/origin предотвращает agent self-generated loops;
- live updates показывают `Появились изменения`, не двигают focused row;
- revoke aborts inflight, invalidates cache и scrub-ит DOM без вспышки stale title.

## 9. Frontend architecture и дизайн

Переиспользовать compositions и primitives merged PR #19:

- `.iq-page-heading`;
- `.iq-section-head`, `.iq-section-count`;
- `.iq-work-list-*`;
- `.iq-work-toolbar`;
- `.iq-empty.compact`;
- `ui.personAvatar`;
- soft status badges;
- 44px touch targets;
- существующий Task presenter/drawer.

Не создавать новый универсальный `iq-workbench-row`. Новый DS primitive добавляется только при втором доказанном consumer.

Desktop row: display ID, title, project, one primary reason, один дополнительный факт. Mobile: две-три строки, reason текстом, full-screen drawer. Secondary reasons — доступный disclosure, не hover-only tooltip.

Toolbar P0:

- mode `Сейчас | План`;
- `Проекты` filter;
- `Фильтры` disclosure;
- `+ Задача` с обязательным destination project.

Убрать с первого экрана global sort, attention type и bulk selection.

## 10. UX state contract

| State | Обязательное поведение |
|---|---|
| No projects | Create project при праве либо объяснение invitation path |
| No actions | Спокойное `Новых запросов к вам нет`; другие секции остаются |
| Empty focus | Путь `Добавить в фокус`, без pressure copy |
| No updates | `Нет непросмотренных изменений` |
| Zero filter result | Active filters + `Сбросить` |
| Loading | Независимый skeleton, reserved geometry, `aria-busy` |
| Partial error | Успешные sections остаются; локальный retry и freshness time |
| Offline | Stale timestamp; mutation не считается saved без receipt |
| Conflict | Draft сохранён; `Сравнить / Обновить` |
| Resolved elsewhere | `Уже решено`, затем deterministic focus recovery |
| Access revoked | Закрыть/scrub content, uniform safe error |
| Refresh available | Один polite announcement, no silent reorder |
| Snoozed request | Return time, undo, отдельный доступ к отложенным |

## 11. Accessibility contract

Цель: WCAG 2.2 AA.

- section/group headings и semantic lists;
- row link/menu/actions — отдельные focusable controls;
- visible reason + screen-reader association;
- Escape сначала закрывает editor/menu, затем drawer;
- после resolve/remove focus идёт на следующую row, предыдущую или heading;
- focus rank доступен move up/down controls;
- filter sheet: heading, focus trap, apply/reset, focus return;
- live region сообщает batch, не каждую перестановку;
- tests: 320/390 CSS px, 200/400% zoom, text resize, keyboard, screen reader, forced colors, reduced motion, safe areas;
- virtualization проходит отдельный SR/focus audit;
- typography PR #21 при merge требует visual regression/reflow retest.

## 12. Security и privacy gates

| Threat | Обязательная защита |
|---|---|
| Hidden project title/count leak | RLS-before-count, uniform 404, opaque actor-bound cursors, cache auth epoch |
| Private action visible in shared audit/SSE | Principal-scoped private state/events/receipts |
| Stale content after revoke | no-store, inflight abort, immediate DOM/cache scrub |
| Wrong-project mutation | Canonical `(projectId, taskId)`, endpoint recheck, project child receipt |
| Lost response / duplicate command | Idempotency key, immutable effect receipt, CAS |
| Replay lies about current state | Receipt returns original effect; current state fetched separately |
| Request resolve/reassign race | Conditional update on request/source revision and current recipient |
| Query/count DoS | Hard limits, statement budget, capped update counts, capacity fixture |
| Prompt injection | Untrusted-content marker, typed tools, no text-to-command |
| Cross-workspace AI disclosure | Project-local runs, workspace policy/opt-in, minimized structured merge only |
| Markdown/title injection | Escaped text, approved renderer, CSP regression tests |

Особые calendar/meeting требования P1:

- opt-in connection and revocation;
- минимальные scopes;
- внешние события не дают project access;
- private event details не попадают в project logs;
- no silent import of personal calendars.

## 13. Work packages

### WP0 — Semantic prototype, ADRs, integration base

Deliverables:

- зафиксировать `0bdd515` и независимость PR #21;
- утвердить labels/semantics `Нужно действие / Текущая работа / Изменилось`;
- prototype на 40–60 mixed Tasks, desktop 1440 и mobile 390/320;
- ADR: exact recipient и request/source lifecycle;
- ADR: private audit/outbox/receipt boundary;
- ADR: independent revisions и event watermark;
- ADR: snapshot envelope/cursors/count policy;
- ADR: waiting lifecycle и snooze/neededBy;
- route/drawer contract;
- выбрать пилот: product/software/consulting или добавить neutral workflow preset до broader cohort.

Exit: первые 8 сценариев UX-программы проходят без semantic confusion; security/design review принимает ADRs.

### WP1 — Secure read projection, internal only

- single-envelope `/workbench`;
- доказуемые existing reasons only;
- canonical drawer/deep link;
- one task one row;
- project filter/navigation distinction;
- section-local states;
- real PostgreSQL/RLS/cursor/cache tests;
- feature flag `workbench_read_internal`.

Важно: WP1 не изображает personal `Нужно действие` из status/requiresResolution без recipient. Это technical/internal slice, не внешний MVP.

### WP2 — Personal state, requests и `Жду`

- field-level personal commands/revisions;
- private receipts/events;
- exact-recipient request/approval migration and lifecycle;
- waiting relation, assignment opt-in и check-back;
- meaningful event taxonomy/grouping;
- snooze/neededBy rules;
- focus ordering and keyboard controls;
- flags `workbench_personal_state`, `workbench_requests`, `workbench_waiting`.

### WP3 — `Сейчас` UI и `Сегодня / 7 дней`

- production `Сейчас` composition;
- read-only plan projection;
- date/timezone semantics;
- manual focus `Без времени`;
- usability/accessibility/performance hardening;
- external MVP cohort behind `workbench_mvp`.

### WP4 — Neutral workflow and ideas provenance, P1

- neutral status/type aliases or preset before education/general-business rollout;
- Map idea → Task typed many-to-many link;
- accessible list alternative;
- conversion preview, idempotency, receipts and audit;
- hypothesis prototype via Maps/Task/approval; first-class model only after research gate.

### WP5 — Portfolio and calendar, P1

- project-row `Контроль` by exceptions and explicit responsibility zones;
- month/quarter milestones/releases;
- opt-in read-only work-calendar adapter;
- meeting → proposed action items with confirmation;
- no Task/meeting time conflation.

### WP6 — Assistant and advanced operations, P2

- deterministic day/week assistant baseline;
- project-local summaries;
- AI threat review, exact preview and per-project receipts;
- meeting records only if validated;
- shared cross-project bulk only after durable parent operation and partial-result UX;
- common resource shell only after proven second resource kind.

## 14. Dependency and PR sequence

```text
origin/main 0bdd515
        │
        ├── optional PR #21 typography (independent; reflow tests)
        │
        └── WP0 ADRs + prototype
              │
              ├── migrations: personal/request/wait/private receipts
              ├── projection/query/cursor/RLS
              ├── frontend route/drawer/sections
              └── plan projection
                    │
                    └── external MVP gate
                          ├── neutral workflow + idea links
                          ├── portfolio/calendar
                          └── assistant later
```

Рекомендуемые PRs небольшими вертикальными slices:

1. ADRs/contracts/fixtures;
2. additive migrations + RLS;
3. snapshot query + security tests;
4. route/shell + read UI;
5. personal commands/private receipts;
6. exact requests + waiting;
7. Today/7d projection;
8. accessibility/performance/observability;
9. rollout flags/docs.

Никакой destructive migration или параллельной новой list design system.

## 15. Test plan

### Inclusion matrix

Обязательные cases:

- exact request on unassigned/undated Task → action;
- `status=review` without recipient → absent from action;
- due without actor relation → absent;
- manual focus without owner/due → current.focus;
- assigned active → current.active;
- assigned backlog → absent by default, visible via filter;
- explicit delegated wait → current.waiting;
- creator without wait/follow → no delegated reason;
- followed meaningful event → updates;
- own low-value edit → suppressed/grouped;
- one Task with request+focus+update → one action row and secondary reasons;
- resolved request → deterministic demote/remove;
- read request → remains open;
- snooze cannot hide after neededBy;
- blocker cases follow next-action matrix;
- revoke removes row/count/cache/drawer access.

### RLS/security

- current member, former member, never-member, admin, cross-workspace actor;
- cursor replay by another actor/scope/filter/after expiry;
- cache poisoning and auth epoch invalidation;
- revoke between list and drawer/mutation;
- title/count/timing/error leak assertions;
- private state invisible to another project member;
- private command absent from project SSE/audit;
- wrong projectId/taskId pair;
- idempotent replay after lost response;
- request resolve/reassign race;
- agent/tool prompt-injection fixtures.

### API black-box

- snapshot counts match rows/pages;
- stable keyset pagination without duplicates/gaps;
- malformed/expired cursor;
- field-level CAS conflicts do not collide across unrelated fields;
- original receipt versus current state semantics;
- partial section error envelope;
- date-only/timezone/DST cases;
- plan horizon boundary at local midnight;
- unknown-result retry.

### Frontend

- route reload/back/forward/deep link;
- scroll/filter/selection/focus restore;
- independent loading/empty/error/offline/conflict/revoked states;
- no silent live reorder;
- 30–50 assigned tasks do not hide focus;
- keyboard/SR/zoom/forced colors/reduced motion;
- 320/390 mobile and drawer safe area;
- PR #21 typography reflow if merged;
- Board/Planning/Maps/Discussions regression suite.

### Performance

Agree budgets before implementation, then test p50/p95/p99 for:

- initial envelope;
- section pagination;
- plan horizon;
- drawer open;
- private command;
- revoke invalidation.

Must prove no per-project N+1, bounded rows/response, stable query plan and no unbounded exact update count.

## 16. Usability validation

Core tasks:

1. Найти и выполнить review неназначенной Task без срока.
2. Объяснить, почему 10 rows появились или не появились.
3. Обработать Task с request+focus+update без дубликата.
4. Найти результат порученной другому человеку работы.
5. Понять, кто снимает blocker.
6. Snooze direct request, найти его снова и отличить read от resolved.
7. Ограничить выдачу двумя projects, затем открыть project и не спутать filter/navigation.
8. Открыть Task, пройти dependency и вернуться к исходной позиции.
9. Восстановиться после conflict/offline/resolved elsewhere/revoke.
10. Выполнить путь на 320/390 и keyboard/SR.
11. Различить due, planned interval и meeting slot.
12. В P1 превратить одну idea в две Tasks без duplicate retry.

External MVP gate:

- direct ask recall ≥90%, stretch ≥95%;
- false positives ≤20%;
- 9/10 reasons объяснены корректно;
- first-three-actions time лучше baseline ≥25%;
- project switches ниже ≥30%;
- delegated task найдена <10 секунд;
- 0 artificial metadata used only for visibility;
- guardrails из brief выполняются.

## 17. Observability

Content-free bounded-label metrics:

- envelope/query/drawer latency;
- rows and capped counts by section/group;
- reason distribution;
- cursor rejection category;
- direct request age и snooze return failures;
- focus/follow/seen/wait conflicts by field;
- refresh available batch size;
- access denial/revoke scrub;
- plan horizon query size;
- receipt replay;
- user-reported missing/false-positive reason.

Логи не содержат Task title/body/comment text, project/workspace name, external calendar details, cursor payload или AI prompt content.

## 18. Rollout и rollback

Flags:

- `workbench_read_internal`;
- `workbench_personal_state`;
- `workbench_requests`;
- `workbench_waiting`;
- `workbench_plan_horizon`;
- `workbench_mvp`;
- последующие `portfolio_control`, `calendar_read`, `idea_task_links`, `assistant_project_local`.

Rollout:

1. additive migrations, flags off;
2. synthetic multi-project tenants;
3. internal read-only slice;
4. personal/request/waiting dogfood;
5. semantic usability sessions;
6. real RLS/security gate;
7. limited external cohort, Workbench opt-in/last-location preserved;
8. broaden only after metrics/guardrails;
9. education/general-business cohort only after neutral workflow.

Rollback:

- disable affected flag;
- existing project routes remain canonical;
- expanded schema remains; no destructive down migration;
- no Task content lives only in Workbench;
- canonical request source remains operable when Workbench is off;
- failed private command remains retryable and never shows fake success;
- receipts allow reconciliation after unknown result.

## 19. Release blockers

- hidden project title/count/excerpt leak;
- private state appears in shared audit/SSE;
- request without exact recipient appears in `Нужно действие`;
- manual focus mixes indistinguishably with assigned backlog;
- delegated work relies on creator alone;
- due/role/membership causes false relevance;
- read closes request;
- snooze hides overdue direct request;
- duplicate Task rows or inconsistent snapshot;
- stale/revoked/wrong-project mutation succeeds;
- drawer loses scope/scroll/focus;
- Today/7d conflates due/planned/meeting semantics;
- Board/Planning/Maps/Discussions regression;
- non-software cohort sees mandatory software-only workflow labels;
- core keyboard/mobile path fails.

## 20. Acceptance checklist

### Product/UX

- [ ] `Рабочий стол` и project navigation различимы.
- [ ] `Нужно действие / Текущая работа / Изменилось` понятны без обучения.
- [ ] `В фокусе / В работе / Жду` сохраняют разные смыслы.
- [ ] Каждая row показывает project и human reason.
- [ ] Owner/due отсутствуют без placeholder и не служат обязательным gate.
- [ ] Unassigned/undated Task находится через explicit relation.
- [ ] 30–50 assigned Tasks не вытесняют manual focus.
- [ ] Drawer/deep link/back восстанавливают state и focus.
- [ ] `Сегодня / 7 дней` доступен одним действием и не скрывает undated work из `Сейчас`.
- [ ] Empty/error/offline/conflict/revoke states проверены сценарно.

### Backend/security

- [ ] Single snapshot envelope bounded/paginated/RLS-protected.
- [ ] Dedupe-before-pagination и stable cursors доказаны.
- [ ] Personal state/events/receipts principal-scoped.
- [ ] Independent field revisions работают в multi-tab.
- [ ] Request lifecycle связан с canonical source.
- [ ] Waiting lifecycle обрабатывает reassign/complete/cancel/orphan.
- [ ] Every mutation rechecks server authorization/source revision/recipient.
- [ ] Counts/cursors/cache/events pass zero-leak tests.
- [ ] Idempotency/receipt/unknown-result tests pass.

### UI/quality

- [ ] PR #19 compositions reused; parallel row system не создан.
- [ ] PR #21 typography retested if merged.
- [ ] 320/390, 200/400%, keyboard, SR, forced colors, reduced motion pass.
- [ ] Live update не переставляет focused row.
- [ ] Reason disclosure и focus rank доступны без drag/hover.
- [ ] Existing full test matrix remains green.

## 21. Решение владельца

Для перехода из PROPOSED в implementation-ready нужно утвердить:

> Создать `Рабочий стол` как авторизованную task-centric проекцию с линзами `Сейчас | План`; использовать семантику `Нужно действие / Текущая работа / Изменилось`, внутри текущей работы различать `В фокусе / В работе / Жду`; считать personal action только exact-recipient request; не использовать owner/due как обязательные gates; включить private delegation control и read-only `Сегодня / 7 дней` во внешний MVP; оставить Project canonical/security boundary; отложить bulk, assistant, calendar meetings, portfolio control, Hypothesis и universal Item до отдельных проверок.
