# Доступ и приглашения: права, пресеты, сервисные аккаунты, приглашения по почте

- **Статус:** approved (раунд 2 утверждён владельцем 2026-09-30). Часть I и перевод сервисных аккаунтов PR #27 на каталог прав — `feature/access-invites` (PR #31); консент-экран, токены и MCP — PR #27.
- **Дата:** 2026-09-30 (раунд 1 → отзыв владельца → раунд 2 → решения владельца)
- **Владелец:** it-novikov
- **Основание:** задача владельца «настройки прав в проекте и пространстве, приглашения по e-mail»; отзыв на раунд 1: «понятная ролевая система — хорошо, но не слишком гибко; перенаправить в сторону выдачи прав, а не готовых ролей»; требование: «агенты не подключаются через MCP/API от имени человека — только через сервисный аккаунт»
- **Дизайн:** Claude Design «Sprintique — доступ и приглашения», https://claude.ai/artifact/SVpsU7ZZSH7jqxXCZEbMna — ряды «Раунд 1» (18 артбордов: роли, приглашения, письмо, путь получателя, защиты) и «Раунд 2» (8 артбордов: права и пресеты; 6 артбордов: сервисные аккаунты). Раунд 2 заменяет ролевую модель раунда 1; экраны приглашений, письма, пути получателя, защиты последнего администратора и передачи владения остаются в силе.
- **Связано:** [ADR 0002 «Вход»](../decisions/0002-sign-in.md); ADR 0003 «Финансы» (ветка `feature/finance`); ADR 0003 «Публичный API и MCP» и PR #27 (ветка `feature/public-api-mcp`, worktree `api-mcp-20260929`) — **часть II этого документа заменяет там «делегированные учётные данные человека»**; ADR W1–W4 «Рабочий стол»; [настройки](../settings/DESIGN.md); [операции, Sign-in](../operations.md#sign-in)

Решения владельца по раунду 1: Наблюдатель пишет в обсуждениях — да; приглашённый только в проект входит в пространство гостем — да; отслеживание недоставки — нет (честное «Отправлено», «Отправить снова» с новой ссылкой и ссылка без письма). Решения по раунду 2 — в [разделе 11](#11-решения-владельца-часть-i) и [II.9](#ii9-решения-владельца).

Документ из двух частей: **I. Права, пресеты, приглашения** и **II. Сервисные аккаунты** (отделяемая часть для PR #27).

---

# Часть I. Права, пресеты, приглашения

## 1. Цель и принципы

1. **Права, а не только роли.** Единица доступа — именованное право из небольшого каталога (14 в проекте, 5 в пространстве) с описанием обычными словами. Роли становятся **пресетами** — редактируемыми наборами прав, с которых начинается доступ.
2. **Один клик по умолчанию, точная настройка при необходимости.** Пресет выбирается в строке участника; личные добавления и исключения показываются как разница: «Редактор + Вести журнал финансов − Управлять релизами».
3. **Зависимости встроены.** «Запись» включает «чтение» той же области; выключение «чтения» выключает зависимые права — интерфейс говорит какие.
4. **База — источник истины.** Действующие права компилируются в массив на строке членства; RLS и `auth.can(project, 'finance.write')` проверяют его по одной строке.
5. **Защиты.** Нельзя дать больше своего, нельзя оставить проект без администратора, сервисный аккаунт никогда не шире владельца и никогда не управляет доступом.
6. **Приглашение — письмо**, ссылка без письма — второй способ. **Одинаковые ответы**: ничто не раскрывает существование аккаунта.

## 2. Как есть (main, миграции 001–024)

| Что | Сейчас |
|---|---|
| `app.workspace_members.role` | `member` \| `admin`; владельца нет. |
| `app.project_members.role` | `reader` \| `editor` \| `admin`; агенты — строки `project_members` с ролью `editor` и credential с capabilities (`AgentGrants`: принципал на один проект и один грант, токен показывается раз). |
| Возможности | `Capability`: `tasks:read/write`, `threads:read/write`, `maps:read/write`, `catalog:write`, `agents:manage`; `catalog:write` и `agents:manage` — только человек-`admin`. |
| RLS | `auth.can_project(id)` — членство (+ `app.project_limit` для агентов); `auth.can_workspace(id)`; каталог имён для администратора пространства. |
| Приглашения | `auth.project_invitations`: одноразовая ссылка `#invite/<token>`, хэш, роль, срок ≤ 7 дней; почтой не отправляется. |
| Защиты | `LAST_ADMIN`, `SELF_REMOVAL`, `PROJECT_ACCESS_REMAINS`; понижение до `reader` отзывает выданные человеком агентские токены. |
| Почта | `MailPort` → SMTP, только текст, только код входа. |
| Ветки в работе | Финансы: читают участники, пишут администраторы, агенты — никогда. PR #27: делегированные токены человека (`spp_`, `spo_`) = права человека ∩ скоуп, консент-экран `/oauth/authorize`, MCP `api.iqui.page/mcp` — **заменяется частью II**. Рабочий стол: личные таблицы «только своё». |

## 3. Каталог прав

Каталог фиксирован в коде (`Permission` enum) и растёт только с продуктом. Группы и порядок — те же в интерфейсе.

### 3.1 Права проекта

| Группа | Право | Название | Что даёт | Включает | Сервисному аккаунту |
|---|---|---|---|---|---|
| Задачи | `tasks.read` | Видеть задачи | Список, карточки, история, планирование для чтения. **Базовое: есть у каждого участника проекта.** | — | да |
| Задачи | `tasks.write` | Создавать и менять задачи | Название, описание, статус, исполнитель, связи, теги задач. | `tasks.read` | да |
| Обсуждения | `threads.write` | Писать в обсуждениях | Вопросы, комментарии, ответы, решение вопросов (чтение — в `tasks.read`). | `tasks.read` | да |
| Планирование и релизы | `releases.manage` | Управлять релизами и спринтами | Создавать, закрывать, переносить релизы; применять планы. | `tasks.write` | да |
| Карты идей | `maps.read` | Видеть карты | Открывать карты. | `tasks.read` | да |
| Карты идей | `maps.write` | Менять карты | Рисовать, переносить, удалять объекты. | `maps.read` | да |
| Финансы | `finance.read` | Видеть финансы | Журнал и сводка. | `tasks.read` | только явно, вне пресетов (выключено по умолчанию) |
| Финансы | `finance.write` | Вести журнал финансов | Проводить, править, аннулировать (ADR 0003). | `finance.read` | только явно, вне пресетов (выключено по умолчанию) |
| Агенты | `approvals.decide` | Решать по предложениям агентов | Подтверждать/отклонять планы. | `tasks.write` | никогда |
| Агенты | `agents.manage` | Управлять агентами в проекте | Подключать агентов и чужие сервисные аккаунты к проекту, менять их права и отключать. Свои сервисные аккаунты владелец ведёт сам (II.2). | `tasks.read` | никогда |
| Участники и приглашения | `members.invite` | Приглашать в проект | Пресет приглашённого ≤ прав приглашающего; входит в пространство гостем. | `tasks.read` | никогда |
| Участники и приглашения | `members.manage` | Менять права участников | Пресеты, добавления/исключения, удаление, добавление из справочника, права сервисных аккаунтов в проекте. | `members.invite` | никогда |
| Настройки проекта | `project.settings` | Настраивать проект | Название, аватар, теги, шаблоны, параметры планирования (нынешний `catalog:write`). | `tasks.read` | никогда |
| Настройки проекта | `project.access` | Управлять доступом | Всё, что делает администратор: пресеты по умолчанию, отличия, матрица, handover. Нельзя гостю. | `members.manage`, `project.settings` | никогда |

Чего нет: «удалять задачи» — удаления нет в продукте; права на задачу/поле — не единица доступа (3.6, 3.7); «читать обсуждения» — внутри `tasks.read`.

### 3.2 Права пространства

| Группа | Право | Название | Что даёт | Включает |
|---|---|---|---|---|
| Люди | `workspace.invite` | Приглашать в пространство | Письма и ссылки с пресетами не шире своих. | — |
| Люди | `workspace.people` | Управлять людьми | Пресеты и права людей, гости, удаление, отзыв приглашений, сервисные аккаунты пространства. | `workspace.invite` |
| Проекты | `projects.create` | Создавать проекты | Создатель получает `project.access`. | — |
| Проекты | `projects.oversee` | Видеть все проекты и входить в них | Каталог всех проектов; вход в любой проект как администратор — явно, с записью в историю. | — |
| Настройки | `workspace.settings` | Настраивать пространство | Название, часовой пояс, правила, пресеты прав. | — |

Только у владельца (не выдаётся): передача владения, удаление пространства, снятие любого администратора. Сервисным аккаунтам права пространства не выдаются никогда.

### 3.3 Пресеты

| Пресет проекта | Права | Меняется |
|---|---|---|
| **Администратор** | все | нет (закреплён) |
| **Редактор** | `tasks.write`, `threads.write`, `releases.manage`, `maps.write`, `finance.read`, `approvals.decide` | да |
| **Наблюдатель** | `tasks.read`, `threads.write`, `maps.read`, `finance.read` | да |
| **Гость** | `tasks.read`, `threads.write`, `maps.read` | да, без `project.access` |
| **Сервис: чтение** | `tasks.read`, `maps.read` | да, только права, доступные сервисным аккаунтам |
| **Сервис: задачи** | `tasks.write`, `threads.write`, `maps.read` | да, то же |
| свои («Подрядчик», «Финансист», «Клиент»…) | любой набор ≤ прав автора; до 10 на пространство | да |

Пресеты пространства: **Владелец** (все, один, закреплён), **Администратор** (все, закреплён), **Участник** (пусто; `projects.create` по правилу пространства), **Гость** (пусто, флаг). Своих пресетов пространства нет — хватает личных добавлений.

Изменение пресета применяется ко всем участиям (счётчик «N участий в M проектах» до сохранения); личные добавления/исключения сохраняются; удалить можно только неназначенный; каждое изменение — в журнале с разницей до/после.

### 3.4 Права субъекта: пресет + добавления − исключения

```
effective = closure(preset.perms ∪ granted) \ cascade(revoked)      -- люди
effective = (closure(preset.perms ∪ granted) \ cascade(revoked)) ∩ effective(owner) \ NEVER_SERVICE   -- сервисные аккаунты; finance.* — только из granted
```
`closure` добавляет включаемые права; `cascade` при исключении убирает зависимые (исключить `tasks.write` — уйдут `releases.manage`, `approvals.decide`). `tasks.read` исключить нельзя (только удалить из проекта). Разница — словами и метка «изменено».

### 3.5 Наследование и переопределения

1. **Пространство → проект.** У участника пространства есть `default_project_preset` (по умолчанию Редактор; гостю — Гость): с ним добавляют из справочника и принимают приглашение без явного пресета. Проект переопределяет умолчания для новых участников (`default_member_preset`, `default_guest_preset`, раздел «Доступ»). Выданные права при смене умолчаний не меняются.
2. **Роль пространства не даёт содержимого.** Единственный путь сверху — `projects.oversee`: «Войти в проект» создаёт членство с пресетом Администратор и пишет `access.workspace_admin_joined`; видно участникам.
3. **Гость** — участник без прав пространства, не в справочнике, не получает `project.access`, `projects.*`, не владеет сервисными аккаунтами.
4. **Сервисные аккаунты** — часть II. Нынешние агентские гранты (`AgentGrants`) заменяются сервисными аккаунтами; поток предложений/утверждений не меняется: предлагает сервисный аккаунт, решает человек с `approvals.decide`.
5. **Рабочий стол:** личные таблицы «только своё» не зависят от прав; получатель адресного запроса — человек с `tasks.write`.
6. Отключение (`disabled_at`), удаление из пространства с `alsoFromProjects`, отзыв токенов — как в раунде 1.

### 3.6 В задаче ролей нет

Ролей в задаче (ревьюер, тестировщик и т. п.) нет и не будет как единицы доступа. У задачи есть исполнитель и **личное состояние «Участвую»**: человек отмечает задачу для себя (уведомления, «мои задачи»); отметку видит только он, она не даёт и не отнимает прав. Что человек может сделать с задачей, решают только права проекта: менять — `tasks.write`, писать в обсуждении — `threads.write`. В каталоге, пресетах и «Что может» задачи не упоминаются.

### 3.7 Чего сознательно нет

Матрицы как основного интерфейса (есть сводка только для чтения по ссылке); прав на задачу/поле/релиз; ролей в задаче (3.6); запрещающих правил (deny); групп как субъектов прав (отложено, 11.1); нескольких владельцев; правил по домену почты; личного сообщения в письме; токенов «от имени человека» (часть II).

### 3.8 Что взяли у других и что отвергли

| Продукт | Взяли | Отвергли |
|---|---|---|
| **Jira** (permission schemes) | Каталог именованных прав с группами; отдельное право «администрировать проект». | Схемы как объекты и сетка «право × (роль, группа, пользователь)». |
| **GitLab** (custom roles) | Custom role = базовая роль + способности с зависимостями. | Только «добавить сверху» — у нас есть исключения с каскадом. |
| **GitHub** (custom repo roles, org owners, GitHub Apps) | Роли на уровне организации, наследование от базовой, лимит своих ролей; owners явно дают себе доступ; **приложения действуют как собственная учётная запись (bot), а не как человек** — основа части II. | Пять базовых уровней. |
| **ClickUp** (custom roles) | Копирование роли; счётчик затронутых. | Россыпь per-feature-переключателей. |
| **Notion** | Гость без членства; «может комментировать». | Уровни доступа на каждой странице. |
| **Linear** | Простота по умолчанию: пресет одним кликом. | Отсутствие точной настройки. |
| **Google Cloud / Microsoft** (service accounts, groups) | Сервисный аккаунт как принципал с владельцем и собственными правами; действия подписываются им; «impersonation» отключён по умолчанию. Группы как субъекты — отложено. | Иерархии ролей IAM с сотнями прав. |

## 4. Интерфейс (раунд 2)

- **Участники проекта (`R2Members`).** Строка: аватар, имя, фраза пресета или разница («+ … − …») и кто менял; `iq-select` пресета, бейдж «изменено», меню («Что может», «Изменить права», «Удалить»). Сервисные аккаунты — в той же группе «Команда»? Нет: отдельная группа «Сервисные аккаунты» с бейджем и владельцем (см. II.4). Группа «Пресеты прав» перечисляет пресеты пространства.
- **Редактор прав человека (`R2PermissionEditor`, `R2EditorDark`, `R2PhoneEditor`).** Drawer 664 / полный экран на телефоне: карточка «Пресет» (select, чипы разницы, «Вернуть к пресету»), группы каталога с меткой источника («из пресета», «добавлено», «убрано»), описанием и тумблером; подсказки зависимостей («Включило «Видеть финансы»», «Включит: …»); недоступное — замок с причиной. Одно сохранение с `baseRevision`; «Изменение попадёт в историю проекта».
- **Пресеты пространства (`R2PresetEditor`).** Раздел «Пространство → Пресеты прав»: список с метками «закреплён / изменён / свой», счётчиком участий, меню; редактор: название, фраза, группы с тумблерами, предупреждение «Применится к N участникам в M проектах», панель сохранения.
- **Доступ в проекте (`R2ProjectOverride`).** Пресеты для новых участников (с меткой «переопределено» и «Как в пространстве»), отличия от пресетов (разница словами, «Что может», «Сбросить»), администраторы пространства, ссылка на матрицу только для чтения.
- **Что может человек (`R2Effective`).** Чипы разницы + каталог с галочкой/тире и источником; фраза про сервисные аккаунты владельца; «Изменить права» / «Понятно».
- **Приглашение (`R2Invite`).** Пресет в пространстве и один пресет в выбранных проектах (≤ прав приглашающего); личные права — после принятия. Из проекта с `members.invite` без прав пространства — Гость и только текущий проект.
- **Без изменений из раунда 1:** участники пространства, ожидающие приглашения, письмо, путь получателя, handover последнего администратора, передача владения пространством, телефон, аудит, доступность. Слово «роль» → «пресет» там, где речь о правах проекта.

## 5. Приглашения по почте (коротко; полностью — раунд 1)

Пригласить → до 20 адресов, пресет в пространстве, проекты + пресет в них → строка `auth.invitations` на адрес (256-битный токен, SHA-256) → письмо `multipart/alternative` от `Sprintique <no-reply@iqui.page>`, тема «{Имя} приглашает вас в пространство «{Пространство}» — Sprintique», ссылка `https://sprintique.iqui.page/#invite/<token>`, 7 дней → анонимный `inspect` → вход по коду/Google/Apple с тем же **подтверждённым** адресом → `accept`: адрес совпадает, не истекло/отозвано/заменено, приглашающий в праве, пресет ≤ его прав → членство, аудит. Лимиты: 20 за раз, 50 писем/сутки на человека, 200/сутки на пространство, 500 ожидающих, 5 писем/сутки на адрес со всей платформы, повтор ≤ раз в 5 минут, ≤ 5 раз. «Отправлено» = SMTP принял; «Не отправлено» — повтор; о недоставке не узнаём и говорим это. В письме пресет словами: «Ваши права: Редактор — ведёт задачи, карты и релизы». Сервисные аккаунты по почте не приглашаются.

## 6. Защиты

1. **Не больше своего**: выдать, включить в пресет или в приглашение можно только права из своих действующих; проверяется в сценарии и в `auth.can` при записи.
2. **Последний администратор**: в проекте ≥ 1 активный человек с `project.access`; в пространстве — владелец; снятие — только handover.
3. **Закреплённые пресеты** не редактируются. 4. **Гость** — без `project.access`, `projects.*`, `workspace.*`, не владеет сервисными аккаунтами.
5. **Сервисные аккаунты** — часть II: ⊆ владельца, `NEVER_SERVICE` = `{approvals.decide, agents.manage, members.*, project.*, workspace.*}`; `finance.read` и `finance.write` — только явно (не входят в сервисные пресеты, выключены по умолчанию, требуют того же права у владельца).
6. **Зависимости** вычисляет сервер, несогласованные наборы — 422 `PERMISSION_DEPENDENCY`. 7. **Базовое право** `tasks.read` у всех членов. 8. **Аудит и ревизии** под блокировкой с diff до/после. 9. **Единые ответы**: 404 «Проект недоступен» без `tasks.read`.

## 7. Хранение и RLS

### 7.1 Миграции (после ветвей в работе: финансы 025, API 026–027, рабочий стол 028–029)

**V…030 `add_permissions`**
```sql
CREATE FUNCTION auth.permission_known(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p = ANY (ARRAY['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write',
    'finance.read','finance.write','approvals.decide','agents.manage','members.invite','members.manage',
    'project.settings','project.access','workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings']) $$;
CREATE TABLE app.access_presets (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES app.workspaces,
  scope text NOT NULL CHECK (scope IN ('project','workspace')),
  subject text NOT NULL DEFAULT 'human' CHECK (subject IN ('human','service')),
  key text CHECK (key IN ('admin','editor','reader','guest','owner','member','service_read','service_tasks')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40), hint text NOT NULL DEFAULT '' CHECK (length(hint) <= 140),
  permissions text[] NOT NULL DEFAULT '{}', locked boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1, created_by text REFERENCES auth.principals, archived_at timestamptz,
  UNIQUE (workspace_id, scope, key), UNIQUE (workspace_id, scope, name),
  CHECK (permissions <@ ARRAY(SELECT p FROM unnest(permissions) p WHERE auth.permission_known(p)))
);
ALTER TABLE app.project_members
  ADD COLUMN preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN granted text[] NOT NULL DEFAULT '{}', ADD COLUMN revoked text[] NOT NULL DEFAULT '{}',
  ADD COLUMN permissions text[] NOT NULL DEFAULT '{}';          -- действующие права, компилируются при записи
CREATE INDEX project_members_permissions ON app.project_members USING gin (permissions);
ALTER TABLE app.workspace_members
  ADD COLUMN preset_id uuid REFERENCES app.access_presets, ADD COLUMN granted text[] NOT NULL DEFAULT '{}',
  ADD COLUMN revoked text[] NOT NULL DEFAULT '{}', ADD COLUMN permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN default_project_preset_id uuid REFERENCES app.access_presets;
ALTER TABLE app.workspace_members DROP CONSTRAINT workspace_members_role_check;
ALTER TABLE app.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('owner','admin','member','guest','service'));
CREATE UNIQUE INDEX workspace_one_owner ON app.workspace_members (workspace_id) WHERE role = 'owner';
ALTER TABLE app.projects ADD COLUMN default_member_preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN default_guest_preset_id uuid REFERENCES app.access_presets, ADD COLUMN access_revision integer NOT NULL DEFAULT 1;
ALTER TABLE app.workspaces ADD COLUMN projects_created_by text NOT NULL DEFAULT 'admins' CHECK (projects_created_by IN ('admins','members'));
-- Проверка права: одна строка членства по PK, массив ≤ 14 элементов.
CREATE FUNCTION auth.can(target text, permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM app.project_members WHERE project_id = target AND principal_id = auth.actor_id() AND permission = ANY (permissions))
     AND (coalesce(current_setting('app.project_limit', true), '') = '' OR current_setting('app.project_limit', true) = target) $$;
CREATE FUNCTION auth.can_workspace_do(target uuid, permission text) RETURNS boolean ...;
REVOKE ALL ON FUNCTION auth.can(text, text), auth.can_workspace_do(uuid, text) FROM PUBLIC;
```
`auth.can_project(id)` остаётся (= `auth.can(id,'tasks.read')`); политики содержимого не переписываются. Финансы: `auth.can_read_finance(p)` → `auth.can(p,'finance.read')`, `auth.can_manage_finance(p)` → `auth.can(p,'finance.write')` (у сервисных аккаунтов — только при явной выдаче).

**V…031 `migrate_roles_to_presets`** — в каждом пространстве создаются системные пресеты; `project_members.preset_id` по `role` (`admin`→Администратор, `editor`→Редактор, `reader`→Наблюдатель); `permissions` = `auth.compile_permissions(preset, granted, revoked)`; `workspace_members`: `admin`→Администратор, `member`→Участник, владелец = `created_by` если администратор, иначе самый ранний администратор-человек; `default_project_preset_id` = Редактор (гостям — Гость). Нынешние агентские принципалы (`kind='agent'`) становятся сервисными аккаунтами (II.7). Колонка `role` в `project_members` остаётся один релиз как производная, затем удаляется.

**V…032 `add_email_invitations`** — как в раунде 1, с `workspace_preset_id`, `project_preset_id`.

**V…033 `add_service_accounts`** — часть II.

### 7.2 Компиляция и согласованность
`auth.compile_permissions(preset_id, granted, revoked, owner_permissions text[] DEFAULT NULL)` — SQL с таблицей зависимостей `auth.permission_implies(p)`; для сервисного аккаунта пересекает с правами владельца и вычитает `NEVER_SERVICE`, а `finance.*` берёт только из явных добавлений. Вызывается сценарием при каждой записи членства, при изменении пресета (`UPDATE … WHERE preset_id = $1` под блокировкой пространства) и при сужении прав владельца (пересчёт его сервисных аккаунтов в той же транзакции). Триггер `BEFORE INSERT OR UPDATE` на членствах проверяет, что `permissions` равен результату компиляции, `tasks.read` у всех, гость без `project.access`, сервисный аккаунт без `NEVER_SERVICE`. Почему `text[]`, а не битовая маска: самодокументируемый SQL и аудит, нет таблицы соответствий, ≤ 300 байт на строку, проверка — одна строка по PK.

### 7.3 Аудит
`app.audit_events`: `member.added`, `member.permissions.updated` (payload: `presetBefore/After`, `granted`, `revoked`), `member.removed`, `access.defaults.updated`, `access.workspace_admin_joined`, `invitation.*`, `service_account.*` (II.6). `app.workspace_audit`: `preset.created|updated|archived`, `workspace.member.permissions.updated`, `workspace.owner.transferred`, `workspace.rules.updated`, `service_account.created|owner_transferred|suspended|deleted`.

### 7.4 Как реализовано (ветка `feature/access-invites`, миграции V20260930000030–032)

Отличия от набросков выше, принятые при реализации:

1. **Триггер вычисляет, а не проверяет.** `app.compile_project_member` (BEFORE INSERT/UPDATE на `project_members`) сам записывает `permissions` = `auth.compile_permissions(base, granted, revoked, forbidden, ceiling)` и производную `role` (`admin` с `project.access`, `editor` с `tasks.write`, иначе `reader`). Запись, где задана только `role` (старый код, данные импорта, PR #27 до доработки), получает системный пресет этой роли (читатель-гость — Гость, агент — «Сервис: чтение/задачи»). У гостя вычитается `project.access`; у принципала не-человека — `NEVER_SERVICE`, а `finance.*` берётся только из `granted`. Параметр `ceiling` оставлен для прав владельца сервисного аккаунта (часть II).
2. **Пресеты пространства = роли.** Отдельных строк пресетов пространства нет: `workspace_members.role` ∈ {owner, admin, member, guest} и есть пресет; личные `granted`/`revoked` и скомпилированные `permissions` — на строке (триггер `app.compile_workspace_member`). `projects.create` у участника — по правилу `workspaces.projects_created_by`.
3. **Умолчания для новых участников** — на пространстве (`workspaces.default_member_preset_id`, `default_guest_preset_id`; пусто = Редактор/Гость) и переопределение в проекте (`projects.default_*_preset_id`); `default_project_preset_id` на участнике не заводился.
4. **`app.access_presets`** без колонки `scope` (только пресеты проекта; `subject` — человек/сервис), без RLS, как и таблицы членства (вход политики, доступ через проверки сценариев). Системные пресеты создаются триггером на вставку пространства. Уникальность названия без учёта регистра проверяет приложение (SQL `lower()` зависит от collation).
5. **`project_members.workspace_id`** с FK `(workspace_id, project_id)` → `projects` — пресет чужого пространства отвергается без чтения проекта под RLS.
6. **Приглашения** — одна таблица `auth.invitations` для писем и ссылок (`kind`), со снимком имён для анонимного `POST /api/v1/invitations/inspect`; прежние ссылки `auth.project_invitations` перенесены с тем же хэшем и таблица удалена. Пути: `POST /workspaces/{id}/invitations` и `/projects/{id}/invitations` (письма), `…/invitation-links` (ссылка), `POST /invitations/{id}/resend`, `DELETE /invitations/{id}`, `POST /invitations/accept`.
7. **Сервисные аккаунты (часть II, после слияния PR #27):** миграция `V20260930000033` переводит их с роли и флагов финансов на сервисный пресет с личными добавлениями; потолок владельца компилирует триггер (`ceiling`), пересчёт — при изменении прав владельца в проекте и при смене владельца; `auth.can` проверяет и видимость проекта (`auth.can_project`: аккаунт активен, владелец участник). Все управляющие сценарии требуют сессию человека (`SESSION_REQUIRED`; на правах доступа — `members.*`, `agents.manage`, `project.access`, `approvals.decide` — токен сервисного аккаунта тоже получает `SESSION_REQUIRED`, а не `SERVICE_ACCOUNT_FORBIDDEN`). Гость пространства не создаёт аккаунт и не назначается владельцем (`SERVICE_OWNER_INVALID`), `auth.service_account_active` не считает гостя владельцем. Отличия от II.5: приостановленный аккаунт получает 401 `UNAUTHENTICATED` (токен не принимается), а не 403 `SERVICE_SUSPENDED`; экран согласия пресет не выбирает — новый аккаунт получает «Сервис: задачи» (если приложению разрешено изменять и человек меняет задачи) или «Сервис: чтение», суженные до прав человека; `PUT /catalogs/releases` для сервисного аккаунта закрыт (`HUMAN_REQUIRED`), релизы он предлагает через план. «Не больше своего» проверяют сценарии, база его не проверяет (триггер только компилирует права); пересборка участий при правке пресета или роли пространства увеличивает `revision` участий, но событий в журнал проекта и outbox не пишет (событие — в журнале пространства).
8. **`Capability` остаётся** словарём действий (и возможностей токена агента); каждое действие сопоставлено одному праву (`Capability.permission`), `ProjectAccess.authorize` проверяет право на строке членства. Команды жизни релиза требуют `releases.manage` от человека; предложения агента по релизам по-прежнему утверждает человек с `approvals.decide`.

## 8. API (сессия человека; сервисные и OAuth-учётные данные — `SESSION_REQUIRED`)

| Метод и путь | Право | Что |
|---|---|---|
| `GET /api/v1/permissions/catalog` | любой | каталог: группы, названия, описания, зависимости, `serviceAllowed` |
| `GET /api/v1/workspaces/{id}/presets` · `POST` · `PUT …/{pid}` · `DELETE …/{pid}` | член / `workspace.settings` | пресеты с числом участий; создать/изменить (`baseRevision`; 422 `PRESET_LOCKED`, `PERMISSION_EXCEEDS_ACTOR`, `PERMISSION_DEPENDENCY`) / архивировать неназначенный |
| `GET /api/v1/projects/{id}/members` | `tasks.read` | люди и сервисные аккаунты: `kind`, `presetId/Name`, `granted`, `revoked`, `permissions`, `ownerName` (для сервисных), `changedBy/At` |
| `PUT /api/v1/projects/{id}/members/{pid}/access` | `members.manage` | `{baseRevision, presetId, granted[], revoked[]}` |
| `GET /api/v1/projects/{id}/members/{pid}/effective` | о себе — всегда; о других — `members.manage` | «Что может» с источниками |
| `POST /api/v1/projects/{id}/members` | `members.manage` | добавить человека из справочника или сервисный аккаунт пространства |
| `POST /api/v1/projects/{id}/members/{pid}/handover` | `project.access` (сам) | назначить другого администратора и понизить себя |
| `GET/PUT /api/v1/projects/{id}/access` · `GET …/access/matrix` | `tasks.read` / `project.access` | умолчания, отличия; матрица только чтение |
| `POST /api/v1/projects/{id}/join-as-admin` | `projects.oversee` | вход администратора пространства |
| `GET/PATCH /api/v1/workspaces/{id}/members[/{pid}]` · `POST …/owner/transfer` · `GET …/directory` | `workspace.people` / владелец / `members.manage` | как в раунде 1 + пресеты |
| приглашения | `workspace.invite` / `members.invite` | как в раунде 1 с пресетами |
| сервисные аккаунты | см. II.5 | |

Коды: `PERMISSION_DEPENDENCY` 422, `PERMISSION_EXCEEDS_ACTOR` 403, `PRESET_LOCKED` 422, `PRESET_IN_USE` 409, `LAST_ADMIN` 409, `GUEST_RESTRICTED` 422, `SERVICE_RESTRICTED` 422, `SESSION_REQUIRED` 403.

Kotlin: `Permission` enum заменяет `Capability` (`implies`, `serviceAllowed`); `Actor.permissions` читается из строки членства в `ProjectAccess.authorize` одним запросом; новые сценарии `access/application/{Presets,MemberAccess,Invitations,ServiceAccounts}.kt`; `MailPort` с HTML; веб: `access.js`, `presets.js`, `member-access.js`, `service-accounts.js`, `invitations.js`, правки `members.js`, `workspace-members.js`, `settings-sections.js`, `sign-in.js`, `consent.js` (PR #27).

---

# Часть II. Сервисные аккаунты (для PR #27)

Эта часть самодостаточна: её можно перенести в ADR ветки `feature/public-api-mcp` вместо раздела «Делегированные учётные данные человека». Ссылки на каталог прав — раздел 3 части I.

## II.1 Решение

1. **Приложения не действуют от имени человека.** Любое неинтерактивное подключение — MCP-клиент (Claude), скрипт с токеном, агент-планировщик — работает через **сервисный аккаунт**: отдельный принципал `auth.principals.kind = 'service'` в пространстве. Персональные токены человека (`spp_`) и OAuth-токены «как я» (`spo_`) из PR #27 не выпускаются; OAuth-авторизация выдаёт токен сервисному аккаунту, который человек выбрал или создал на консент-экране.
2. **Владелец** — человек, создавший аккаунт (или получивший его передачей). Владелец меняет права аккаунта в пределах своих, подключает/отключает приложения, выпускает и отзывает токены, передаёт владение, удаляет. Люди с `workspace.people` управляют любым сервисным аккаунтом пространства (права, владелец, удаление); люди с `members.manage` в проекте — правами аккаунта в этом проекте и его присутствием там.
3. **Права — из общего каталога**, теми же пресетами и добавлениями/исключениями, с двумя дополнительными правилами: (а) действующие права ⊆ действующих прав владельца в том же проекте — пересчитываются при любом сужении прав владельца; (б) `NEVER_SERVICE` никогда: `approvals.decide`, `agents.manage`, `members.invite`, `members.manage`, `project.settings`, `project.access` и все права пространства. **Финансы:** `finance.read` и `finance.write` выдаются только явно — не входят ни в один сервисный пресет, выключены по умолчанию и требуют того же права у владельца. Это решение владельца: отчёты и проводки через MCP возможны, но только по явному включению; ADR 0003 «агентам финансы недоступны» уточняется этим разделом.
4. **Скоупы подключения** (`read` / `write`, RFC 8707-ресурс) ограничивают токен дальше: действующее = права аккаунта ∩ скоуп; `read` — только `GET`/инструменты чтения.
5. **Видимость и подпись.** Сервисные аккаунты видны в списках участников проекта отдельной группой с бейджем «Сервисный аккаунт» и владельцем; в истории, обсуждениях и предложениях агентов действия подписаны «{Имя аккаунта} (сервисный аккаунт {Владелец})»; удалённый — «{Имя} (удалён), сервисный аккаунт {Владелец}».
6. **Если владелец уходит** из пространства, отключается или становится гостем — аккаунт **приостанавливается**: подключения получают 403 `SERVICE_SUSPENDED`, история сохраняется; администратор назначает нового владельца (права аккаунта пересчитываются под него) или удаляет. Сужение прав владельца аккаунт не приостанавливает, а сужает (правило 3а).
7. **Что заменяет.** Нынешние агентские гранты (`AgentGrants`, `kind='agent'`, один проект, один токен) становятся сервисными аккаунтами: миграция создаёт аккаунт на каждый живой грант с владельцем `initiator_id`, теми же правами (в новых именах) и тем же токеном (хэш переносится). Поток предложений/утверждений (`agent_runs`, `approvals`) не меняется: предлагает сервисный аккаунт, решает человек с `approvals.decide`.

## II.2 Жизненный цикл

```
создание (настройки пространства «Сервисные аккаунты» или консент-экран) → активен
  → подключения: OAuth (MCP) | токен API (spa_…, показан один раз, срок 7–365 дней)
  → права по проектам: пресет «Сервис: чтение» / «Сервис: задачи» / свой + добавления
  → владелец ушёл / отключён / стал гостем → приостановлен → новый владелец → активен
  → удаление (владелец, workspace.people): подключения отозваны, членства удалены, принципал disabled_at, история сохранена
```

Кто может создать: **любой участник пространства** (не гость) — по решению владельца, без отдельного права. Аккаунт получает права только в проектах, где его владелец сам состоит, и только не шире прав владельца там; в чужие проекты его добавляет человек с `agents.manage` (или `members.manage`) того проекта, тоже в пределах прав владельца аккаунта. Гости и сервисные аккаунты не создают и не владеют. Персональных токенов человека нет: скрипт человека — это его сервисный аккаунт. Лимиты: 50 сервисных аккаунтов на пространство, 10 подключений на аккаунт, лимиты запросов — на аккаунт.

## II.3 Консент-экран (`SAConsent`; заменяет шаг «действовать от вашего имени» PR #27)

`/oauth/authorize` после входа: слева — контекст (кто просит, куда вернётся, ресурс) и фраза «Приложения не действуют от вашего имени. Они работают через сервисный аккаунт…»; справа — **«Кто будет действовать»**: радио-список своих сервисных аккаунтов (имя, проекты, права одной фразой) и «Создать новый» (шаг: название, пресет, проекты — только проекты, где человек сам состоит), затем скоупы «Читать» (обязателен) / «Изменять» (снимаемый), подсказка о подписи действий, кнопки «Разрешить» / «Отказать». `redirect_uri` — точное совпадение, PKCE S256, код 5 минут — как в PR #27. Выданный токен: `principal_id` = сервисный аккаунт, `initiator_id` = человек, `service_account_id`, `scopes`, `client_id`.

## II.4 Экраны

- **Список (`SAList`)** — «Пространство → Сервисные аккаунты» (`workspace.people`; владелец видит свои): имя, бейдж, владелец, проекты, подключения, активность, состояние «Активен / Приостановлен»; «Создать сервисный аккаунт»; группа «Правила» фактами.
- **Управление (`SAManage`)** — страница аккаунта: Владелец («Передать другому»), Подключения (OAuth-клиенты и токены: область, срок, последний запрос, «Отключить/Отозвать», «Выпустить токен»), Проекты (пресет и разница, «Права», «Добавить в проект»), История (подписанные действия), Удаление.
- **Права (`SAEditor`)** — тот же редактор прав, что у людей, с сервисными пресетами; недоступные права показаны замком «Недоступно сервисным аккаунтам» / «Никогда: журнал ведут люди»; `finance.read` с меткой «явно»; чип «Не шире прав владельца».
- **Передача (`SAOwner`)** — выбор нового владельца с предупреждением, какие права снимутся (пересечение с его правами); гости недоступны.
- **Удаление (`SADelete`)** — факты: подключения, проекты, ожидающие предложения (будут отклонены), чекбокс осознания, `danger` «Удалить аккаунт».
- **В участниках проекта** — группа «Сервисные аккаунты» с бейджем, владельцем, правами одной фразой, «Права», «Убрать из проекта».

## II.5 Данные и API

**База — миграция 027 PR #27** (`V20260929000027__add_public_api_access.sql`), которая уже вводит: `auth.principals.kind = 'service'`; `auth.service_accounts (principal_id, workspace_id, owner_id NOT NULL, created_by, revision, suspended_at, deleted_at)`; `auth.service_account_active(principal)` (не удалён, не приостановлен, владелец активен и в пространстве); потолок в `auth.can_project` (проект виден сервисному аккаунту, только если владелец — участник проекта); `auth.oauth_clients`, `auth.oauth_grants` (одобрение клиента для одного сервисного аккаунта со скоупами и ресурсом), `auth.oauth_codes`, `auth.oauth_refresh_tokens`; `auth.credentials.kind ∈ {service, oauth}` со `scopes`, `audience`, `name`, `grant_id`; `auth.access_events` (история аккаунтов и подключений); `app.audit_events.credential_kind`. Эта часть **не заменяет** 027, а дополняет её:

**V…033 `service_account_permissions`** (после 030–031 части I)
```sql
-- Имя (копия auth.principals.name, обновляется вместе с ним) и описание; имя уникально в пространстве.
ALTER TABLE auth.service_accounts ADD COLUMN name text NOT NULL DEFAULT '' CHECK (length(name) <= 100),
  ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 300);
UPDATE auth.service_accounts s SET name = p.name FROM auth.principals p WHERE p.id = s.principal_id;
CREATE UNIQUE INDEX service_accounts_name ON auth.service_accounts (workspace_id, lower(name)) WHERE deleted_at IS NULL;
-- Членство в пространстве как субъект прав (без прав пространства), чтобы пресеты и списки работали единообразно.
INSERT INTO app.workspace_members (workspace_id, principal_id, role, preset_id, permissions)
  SELECT workspace_id, principal_id, 'service', NULL, '{}' FROM auth.service_accounts WHERE deleted_at IS NULL ON CONFLICT DO NOTHING;
-- Права владельца в проекте — для пересечения при компиляции (SECURITY DEFINER, без актора).
CREATE FUNCTION auth.owner_permissions(service text, project text) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((SELECT m.permissions FROM auth.service_accounts s JOIN app.project_members m ON m.project_id = project AND m.principal_id = s.owner_id
                   WHERE s.principal_id = service), '{}') $$;
-- Потолок уточняется: вместо «владелец — участник проекта» — «право есть в пересечении», что даёт auth.compile_permissions;
-- auth.can(project, permission) из 030 достаточно, потолок в auth.can_project остаётся как страховка.
```
Компиляция для сервисного аккаунта: `permissions = (closure(preset ∪ granted) \ cascade(revoked)) ∩ auth.owner_permissions(sa, project) \ NEVER_SERVICE`, где `finance.*` учитываются только из `granted`; пересчёт при каждом изменении прав владельца в проекте (в той же транзакции, под блокировкой проекта). Перенос старых грантов (`kind='agent'`): на каждый живой грант — строка `auth.service_accounts` (владелец `initiator_id`, `workspace_id` проекта), `workspace_members role='service'`, `project_members` с `permissions` из capabilities в новых именах; credential становится `kind='service'`, `scopes='{read,write}'`, `audience` = API, `name` = имя гранта.

| Метод и путь | Право | Что |
|---|---|---|
| `GET /api/v1/workspaces/{id}/service-accounts` | `workspace.people` (владелец — свои) | список с состоянием, владельцем, проектами, подключениями |
| `POST /api/v1/workspaces/{id}/service-accounts` | участник пространства (не гость); в `projectIds` — только проекты, где он состоит | `{name, description, presetId, projectIds[]}` → аккаунт + членства (права ⊆ создателя); лимит 50 на пространство |
| `GET/PATCH /api/v1/service-accounts/{sid}` | владелец или `workspace.people` | имя, описание, `baseRevision` |
| `POST /api/v1/service-accounts/{sid}/owner/transfer` | владелец или `workspace.people` | `{toPrincipalId}`; права пересчитываются; письмо новому владельцу |
| `DELETE /api/v1/service-accounts/{sid}` | владелец или `workspace.people` | удаление: отзыв подключений, выход из проектов, `state='deleted'`, ожидающие предложения отклонены |
| `PUT /api/v1/projects/{id}/members/{sid}/access` | `members.manage` (или владелец, если ⊆ его прав) | права в проекте, `serviceAllowed` только |
| `POST /api/v1/service-accounts/{sid}/tokens` · `DELETE …/tokens/{cid}` | владелец или `workspace.people` | токен `spa_…` (256 бит, показан один раз, `scopes`, `expiresInDays` 7–365) / отзыв |
| `GET /api/v1/service-accounts/{sid}/connections` · `DELETE …/connections/{cid}` | владелец или `workspace.people` | OAuth-клиенты и токены, `lastUsedAt`; отключение = отзыв access- и refresh-токенов |
| `POST /oauth/authorize` (решение) | сессия человека | `{serviceAccountId | newAccount{name,presetId,projectIds}, scopes}` |
| `GET /api/v1/me` для сервисной учётной записи | — | `{kind:'service', name, ownerName, workspaceId, projects[{id, permissions}]}` |

Ошибки: `SERVICE_RESTRICTED` 422 (право из `NEVER_SERVICE` или шире владельца), `SERVICE_SUSPENDED` 403, `SERVICE_OWNER_INVALID` 422 (гость, не участник пространства), `SESSION_REQUIRED` 403 на всём этом разделе для несессионных учётных данных.

## II.6 Безопасность и аудит

- Токены и коды — только хэши; секрет показывается один раз; `Origin` для MCP — как в PR #27. Каждый запрос сервисной учётной записи: живой credential, `state='active'`, владелец активен, права из строки членства ∩ `scopes` — в одной транзакции (нынешний `requireActiveCredential` + `authorize`).
- RLS: сервисный аккаунт — обычный `principal_id` в `project_members` с `permissions`; `auth.can` без изменений; `app.project_limit` не нужен (аккаунт может быть в нескольких проектах, каждый — своя строка).
- `SESSION_REQUIRED` для сервисных учётных данных: участники, пресеты, приглашения, доступ, сервисные аккаунты, владение, решения по предложениям, финансы-запись.
- Личное состояние рабочего стола (W2): у сервисного аккаунта своё, людям невидимо; кросс-проектный `GET /workbench` — 403 (W4).
- Аудит: `service_account.created|updated|owner_transferred|suspended|resumed|deleted`, `service_account.token.issued|revoked`, `service_account.connection.approved|revoked` — в журнале пространства и в проектах, где аккаунт состоит; действия аккаунта — обычные события с `actor_id` = аккаунт и `initiator_id` = владелец на момент действия (уже есть в схеме).
- Метрики и лимиты — на аккаунт; логи без имён приложений сверх `client_id`.

## II.7 Миграция и совместимость с PR #27

1. В PR #27 уже есть (миграция 027): сервисные аккаунты с владельцем, приостановкой и удалением, OAuth-одобрения на сервисный аккаунт, токены `service`/`oauth` со скоупами, история `auth.access_events`, потолок «владелец — участник проекта». Остаются: сервер авторизации OAuth 2.1, MCP-транспорт и инструменты, `read/write`. Что добавляет эта часть: права аккаунта из каталога (пресеты «Сервис: …», добавления/исключения, `NEVER_SERVICE`, явный `finance.read`), пересечение с правами владельца при компиляции, право `agents.manage` как условие создания и владения, консент-экран с выбором/созданием аккаунта (II.3), экраны II.4, группа «Сервисные аккаунты» в участниках проекта, перенос старых агентских грантов.
2. Порядок: миграции 030–031 (права) → 033 (права сервисных аккаунтов, перенос грантов) → правка `AgentGrants`/`AgentRuns` → консент-экран (`web/consent.js`: добавить шаг «Кто будет действовать» перед скоупами; тексты `context-title/description` — из II.3).
3. Инструменты MCP получают `whoami` с именем аккаунта и владельца; тексты инструментов не меняются.

## II.8 Тесты

SA01 создание: любой участник пространства, не гость; только в своих проектах; права ⊆ создателя; 51-й аккаунт — 422, `NEVER_SERVICE` — 422; SA02 консент: выбор существующего / создание нового; токен выдан аккаунту, `initiator_id` = человек; `read`-скоуп не пишет при праве записи; SA03 подпись действий в аудите и обсуждениях (`actor` = аккаунт, `initiator` = владелец); SA04 сужение прав владельца пересчитывает права аккаунта в той же транзакции; уход владельца приостанавливает (403 `SERVICE_SUSPENDED`); назначение владельца возобновляет с пересечением прав; SA05 удаление: подключения отозваны, членства удалены, предложения отклонены, история с пометкой; SA06 `finance.read`/`finance.write` только явно и только при том же праве у владельца; в сервисных пресетах их нет; SA07 сервисная учётная запись на управляющих эндпоинтах — `SESSION_REQUIRED`; SA08 перенос старых грантов: те же права и тот же токен работают после миграции; SA09 гость не может создавать и владеть; владелец стал гостем — аккаунт приостановлен; SA10 лимиты на аккаунт.

## II.9 Решения владельца

1. **Финансы сервисным аккаунтам:** `finance.read` и `finance.write` выдаются только явно, выключены по умолчанию, не шире прав владельца.
2. **Персональные токены** человека не выпускаются: всё неинтерактивное — через сервисный аккаунт.
3. **Кто создаёт:** любой участник пространства (не гость), права ⊆ его прав, только в проектах, где он сам состоит; лимит 50 на пространство.
4. **Один аккаунт — несколько приложений** (до 10 подключений).

---

## 9. План тестов (часть I)

PR01 каталог и зависимости; PR02 «не больше своего»; PR03 последний `project.access` — только handover; PR04 закреплённые пресеты; PR05 изменение пресета применяется ко всем участиям, личные `granted/revoked` сохраняются, аудит с diff; PR06 гость; PR07 `finance.*` через `auth.can` (HTTP и SQL под runtime-ролью); PR08 токены API/MCP — `SESSION_REQUIRED`; PR09 миграция ролей → пресеты на копии QA-базы: производная `role` совпадает со старой; PR10 «Что может» по источникам; PR11 матрица только для `project.access`; IN01–IN07 приглашения (раунд 1) с пресетами. Интеграционные: триггер согласованности `permissions`, уникальность владельца, `auth.can` при `app.project_limit`. UI (Playwright + Mailpit): пресет в строке → тост; редактор: `finance.write` → подсказка, «изменено» и diff; выключить `tasks.write` → предупреждение о каскаде; редактор пресета с предупреждением; приглашение с пресетом → письмо → принятие; консент-экран с выбором сервисного аккаунта; телефон 390 и тёмная тема. Стиль и язык: `check:styles`, `voice.mjs` (глоссарий: «пресет», «право», «участие», «сервисный аккаунт»).

## 10. Пробелы дизайн-системы (DS-GAP)

Раунд 1: 1) поле адресов с чипами и ошибкой на чипе; 2) пункт `iq-select` с описанием; 3) строка панели с `iq-switch`; 4) карточка состояния входа с тоном; 5) иконка `crown`; 6) документировать `.iq-settings-panel-foot`; 7) HTML-шаблон письма. Раунд 2: 8) **строка права** (название + метка источника + описание + тумблер или замок с причиной) как вариант `.iq-settings-row`; 9) **чипы разницы** «+ / −» с тонами; 10) drawer настроек 664 с липким футером (в статике собран вручную); 11) группа каталога с иконкой в заголовке; 12) **аватар сервисного аккаунта** (круглый тайл с молнией) и бейдж «Сервисный аккаунт»; 13) консент-экран с выбором субъекта (`iq-auth-screen` + `.iq-choice-list` с аватаром).

## 11. Решения владельца (часть I)

1. **Группы/команды** как субъект прав — позже, не в этой версии.
2. **Системные пресеты** Редактор/Наблюдатель/Гость редактируются, у каждого есть «Вернуть по умолчанию»; Администратор закреплён.
3. **Матрица** — только для чтения, по ссылке из раздела «Доступ».
4. **Финансы:** у Наблюдателя `finance.read` по умолчанию есть, у Гостя — нет.
5. **Слово «пресет»** остаётся; роль проекта «Участник» переименована в «Редактор».
6. **Своих пресетов** — до 10 на пространство.
7. Из раунда 1: один отправитель `Sprintique <no-reply@iqui.page>` для всех пространств; срок письма 7 дней. Владелец существующего пространства — один из его администраторов-людей: сначала активный, среди них создатель, затем по идентификатору; пространство без администратора-человека остаётся без владельца, его назначают вручную ([operations](../operations.md#access-and-invitations)).
8. **Недоставка** не отслеживается: «Отправлено» значит, что SMTP принял письмо; дальше — «Отправить снова» с новой ссылкой или ссылка без письма.
