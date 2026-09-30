# Operations and release boundary

This runbook separates reproducible local checks from an external release. Never connect these migrations to the old platform database. Do not publish generated QA secrets or reuse them outside the local environment.

## Runtime configuration

One artifact, `sprintique-server.jar` (JDK 25), runs three commands: `api` (default), `worker` and `migrate`. Every setting is an environment variable with the `SPRINTIQUE_` prefix, all named in `server/src/main/resources/application.yaml`.

API requires `SPRINTIQUE_DATABASE_URL`, `SPRINTIQUE_PUBLIC_ORIGIN`, SMTP for sign-in codes (`SPRINTIQUE_SMTP_HOST`, `SPRINTIQUE_MAIL_FROM`, see [Sign-in](#sign-in)), `SPRINTIQUE_STORAGE_ENDPOINT`, `SPRINTIQUE_STORAGE_REGION`, `SPRINTIQUE_STORAGE_BUCKET`, `SPRINTIQUE_STORAGE_ACCESS_KEY_ID`, `SPRINTIQUE_STORAGE_SECRET_ACCESS_KEY`, and `SPRINTIQUE_ENVIRONMENT=production` in production. Optional: `SPRINTIQUE_HOST` (default `127.0.0.1`), `SPRINTIQUE_PORT` (`4311`), `SPRINTIQUE_WEB_ROOT` (the built interface), Google and Apple sign-in, `SPRINTIQUE_STORAGE_PREFIX` (object keys under a prefix). `SPRINTIQUE_PUBLIC_ORIGIN` is an origin without a trailing slash. HTTPS is required outside loopback; sign-in providers always require HTTPS. The server refuses to start, before it listens, on unsafe configuration or an owner/superuser/BYPASSRLS database role.

`SPRINTIQUE_TRUST_PROXY` must be set when the API runs behind the TLS reverse proxy: a hop count (usually `1`) or the exact comma-separated proxy addresses. Per-address request and login limits then apply to the real client; without it every user shares the proxy address and one client can exhaust the login window for everyone. Leave it unset only when clients connect directly. Responses from an HTTPS origin carry HSTS, `Cross-Origin-Opener-Policy: same-origin` and a restrictive `Permissions-Policy`.

The `migrate` command uses a separate `SPRINTIQUE_MIGRATION_DATABASE_URL`, `SPRINTIQUE_DATABASE_RUNTIME_ROLE` and `SPRINTIQUE_DATABASE_WORKER_ROLE`. Runtime and worker roles must be LOGIN NOSUPERUSER NOBYPASSRLS, not migration owners. It applies the ordered immutable Flyway ledger (`db/migration` inside the artifact). The API and readiness check that the applied history equals the artifact's exactly: a changed, missing or unknown migration fails, and the log names it. Never edit an applied SQL migration: add another file.

A database created by the previous TypeScript migrator (`public.schema_migrations`, no `flyway_schema_history`) is adopted on the first `migrate`: its rows must be an exact prefix of the known ledger (`db/previous-ledger.json`, same names and SHA-256), Flyway then records that version as its baseline and applies only the later files. A ledger that differs anywhere refuses to migrate and names the first differing file; nothing is changed. The old table stays for audit. Take a backup before adopting a database that holds real data.

## Features behind switches

`SPRINTIQUE_FEATURES` names the features a process serves: a comma-separated list, `all` or `none`. Left empty it means `all` outside production and `none` when `SPRINTIQUE_ENVIRONMENT=production`, so a feature reaches production only when it is named there. An unknown name stops the process at start. A disabled feature's routes answer `404` as if they did not exist; `/api/v1/session` lists the enabled ones for the interface. Rollback is switching a feature off: the schema stays, project routes stay canonical.

| Feature | What it serves |
|---|---|
| `workbench_read_internal` | `GET /api/v1/workbench`, `/workbench/list`, `/projects/:p/tasks/:t/personal` and the `/workbench` pages |
| `workbench_personal_state` | «Участвую» and its order, seen and snooze commands (private, own revisions and receipts) |
| `workbench_requests` | Directed requests to an exact recipient ("Нужно действие") |
| `workbench_waiting` | "Жду": participating tasks the person assigned to someone else, with a private check-back date |
| `workbench_plan_horizon` | `GET /api/v1/workbench/plan` (Сегодня / 7 дней) and the time-zone preference |
| `workbench_mvp` | The "Рабочий стол" item in the global navigation for everyone |

Production default: all off. A pilot names them explicitly, for example `SPRINTIQUE_FEATURES=workbench_read_internal,workbench_personal_state,workbench_requests,workbench_waiting,workbench_plan_horizon` (internal) plus `workbench_mvp` for the cohort. `SPRINTIQUE_WORKBENCH_CURSOR_SECRET` (32+ characters) signs the Workbench page cursors; without it each API process uses a random key, so cursors do not survive a restart and several API processes need one shared value. Workbench logs and metrics carry routes and status classes only, never titles, project names or cursors.

## Sign-in

People sign in three ways; the sign-in screen offers only the configured ones (`GET /api/v1/auth/methods`).

- **A code by e-mail** — the base method, required in production. `POST /auth/email/start` sends a six-digit code; `POST /auth/email/verify` checks it. The code lives ten minutes, allows five attempts and works only in the browser that asked (an HttpOnly challenge cookie; the database holds only hashes); a new code from the same client replaces that client's previous one once its letter has left. A browser that once signed in to an address by a code keeps a device cookie (`__Host-sprintique-device`, 180 days; the database holds its hash; one token covers every address the browser signed in to; signing out deletes it). Limits for an address: from one client — the remembered browser, otherwise the network address — one code per 30 seconds and five per hour, and a new code replaces only that client's previous one; per day — twenty from all unknown clients together and twenty from each remembered browser; plus the per-client sign-in budget. Guessing is thus held to a hundred attempts a day per address (each also sends that person a letter), or per stolen device cookie. Strangers who fill the shared daily limit neither cancel nor block the codes of a browser the person used before. A person on a new browser can still be held back for a day by such requests, or by others behind the same network address for an hour; they can sign in with Google or Apple meanwhile. Answers never reveal whether a person with the address exists: the first valid code creates them, named after the part before `@` until they change their name.
- **Google** — OpenID Connect with PKCE, `prompt=select_account`.
- **Apple** — Sign in with Apple: the callback is a form POST from Apple's site, the client secret is a five-minute ES256 token signed with the team key, the name arrives only on the first sign-in.

One person, several ways in (`auth.identities`). A known way in leads to its person. A new one joins the person who already holds its **verified** address; otherwise a new person is created. Addresses count as verified when they come from a code by e-mail, from Apple, or from Google when Google vouches for them (Gmail addresses, or `hd` for Google Workspace); Google's other addresses never join an account. People who signed in through the previous OIDC provider kept their accounts: migration 021 made each issuer and subject an identity. A code by e-mail finds such a person only if the provider had vouched for their address (`auth.principals.email` is set). The previous sign-in asked for `openid profile` only, so for most of them it is empty, and their first code would create a new, empty account. Before they sign in, an administrator sets the address they will use (lower case) on the migration role:

```sql
UPDATE auth.principals SET email = 'person@example.com' WHERE id = '<principal id>' AND kind = 'human' AND email IS NULL;
```

Check first that no other person holds that address: with two holders, a code joins neither. A failed provider sign-in returns to the sign-in screen with `?sign-in-error=<code>`. The browser is never told which check failed; the server log records it (`Sign-in with <provider> rejected: …` — the exception class and a short message, never tokens, codes or secrets).

Settings:

| What | Variables |
| --- | --- |
| SMTP | `SPRINTIQUE_SMTP_HOST`, `SPRINTIQUE_SMTP_PORT` (587), `SPRINTIQUE_SMTP_USERNAME`, `SPRINTIQUE_SMTP_PASSWORD`, `SPRINTIQUE_SMTP_SECURITY` (`starttls` required upgrade, `tls` implicit TLS on 465, `none` only to a loopback relay), `SPRINTIQUE_MAIL_FROM` (`Sprintique <no-reply@example.com>`, also the envelope sender) |
| Google | `SPRINTIQUE_GOOGLE_CLIENT_ID`, `SPRINTIQUE_GOOGLE_CLIENT_SECRET` |
| Apple | `SPRINTIQUE_APPLE_CLIENT_ID` (the Services ID), `SPRINTIQUE_APPLE_TEAM_ID`, `SPRINTIQUE_APPLE_KEY_ID`, `SPRINTIQUE_APPLE_PRIVATE_KEY_FILE` (the downloaded `AuthKey_<key id>.p8`, mounted as a secret file) |
| Tests and local stands only | `SPRINTIQUE_GOOGLE_ISSUER`, `SPRINTIQUE_APPLE_ISSUER`, `SPRINTIQUE_PROVIDER_TRUST_FILE` (PEM certificates trusted for the providers only), `SPRINTIQUE_MAIL_DROP` (letters as files; local artifact only, refused in production and off loopback) |

Registering the providers:

- **Google** (Google Cloud console → APIs & Services → Credentials): an OAuth client of type *Web application*; authorized redirect URI `${PUBLIC_ORIGIN}/auth/callback/google`; consent screen scopes `openid`, `email`, `profile`.
- **Apple** (Apple Developer → Certificates, Identifiers & Profiles): an App ID with *Sign in with Apple*; a Services ID bound to it, with the domain of `PUBLIC_ORIGIN` and the return URL `${PUBLIC_ORIGIN}/auth/callback/apple`; a key with *Sign in with Apple* (download the `.p8` once — Apple does not show it again). Apple accepts only HTTPS origins, so it cannot be tried on a loopback stand. To relay mail to private relay addresses (`privaterelay.appleid.com`), register the sending domain in *Sign in with Apple for Email Communication* and publish SPF/DKIM for it.
- **SMTP**: a transactional mail service or your own relay, with SPF, DKIM and DMARC for the domain of `SPRINTIQUE_MAIL_FROM`; otherwise codes land in spam.

Browser cookies are HttpOnly, Secure, host scoped and SameSite=Lax; only Apple's pending-sign-in cookie is SameSite=None, because Apple posts the callback from its own site. Human mutations require same-origin Origin and CSRF; both e-mail steps require the same origin too. Forwarded headers are not trusted; review proxy/trust configuration before an ingress is introduced.

## Access and invitations

Access is a set of named permissions (14 in a project, 5 in a workspace; `GET /api/v1/permissions/catalog`), see [access and invitations](access/access-and-invitations.md). A project membership has a preset (Администратор is locked; Редактор, Наблюдатель, Гость and up to ten presets of the workspace's own are edited in «Пространство → Пресеты прав») plus personal additions and removals. The database compiles the effective permissions onto the membership row on every write (trigger `app.compile_project_member`, function `auth.compile_permissions`); row security and `auth.can(project, permission)` read that row, finance included (`finance.read`, `finance.write`). Workspace roles are Владелец (one, changed only by `POST /workspaces/{id}/owner/transfer`), Администратор, Участник and Гость; a workspace role never grants project content — an owner or administrator enters a project with `POST /projects/{id}/join-as-admin`, recorded in its history. A project always keeps an active person with «Управлять доступом»; the last one hands over (`POST /projects/{id}/members/{to}/handover`).

Invitations are letters (one per address, seven days) or links without a letter (one hour to seven days), both `https://<origin>/#invite/<token>`. A letter is `multipart/alternative` (text and HTML) from `SPRINTIQUE_MAIL_FROM` through the same SMTP settings as sign-in codes — in production `Sprintique <no-reply@iqui.page>` through the host's loopback Postfix with OpenDKIM; without SMTP, letters are refused with `MAIL_UNAVAILABLE` and links still work. «Отправлено» means the relay accepted the letter; bounces are not tracked. Only the token's SHA-256 is stored (`auth.invitations`); «Отправить снова» makes a new invitation with a new token and marks the old one replaced. Accepting needs a session whose person has the invited address verified (a code, Google or Apple); a link needs any session. Limits: 20 addresses at once, 50 letters a day per person, 200 a day and 500 pending per workspace, 5 letters a day to one address from the whole platform, a new letter at most every five minutes and five times. Answers never depend on whether an address has an account. Links made before migration 039 were moved into `auth.invitations` with the preset of their role and keep working until they expire (acceptance checks that their author may still invite to the project).

Migration 038 made the owner of each workspace one of its human administrators (an enabled one, the creator first). A workspace that had no human administrator has no owner; set one on the migration role, after checking the person is a member:

```sql
UPDATE app.workspace_members SET role = 'owner' WHERE workspace_id = '<workspace id>' AND principal_id = '<principal id>';
```

Worker: the `worker` command with `SPRINTIQUE_WORKER_DATABASE_URL` plus the same storage settings. It uses only narrow security-definer queue/asset functions with fixed search paths and lease fencing; no direct tenant-table access. Jobs retry boundedly and become failed after ten attempts. A live project administrator can inspect safe job metadata and retry failed asset cleanup from settings. Cleanup respects task/map-history references. Mail is sent only for sign-in codes and invitations; no webhook or notification dispatcher is configured.

## Public API and MCP server

One process serves two names: the interface (`SPRINTIQUE_PUBLIC_ORIGIN`, `https://sprintique.iqui.page`) and the programmatic API (`SPRINTIQUE_API_ORIGIN`, `https://api.iqui.page`). The model and its alternatives are in [ADR 0003](decisions/0003-public-api-mcp.md).

| What | Where |
| --- | --- |
| REST API for scripts | `https://api.iqui.page/api/v1/…` with `Authorization: Bearer spk_…` (a service account's token) |
| MCP server (Streamable HTTP, protocol 2025-11-25; 2025-06-18 accepted) | `https://api.iqui.page/mcp` |
| OAuth metadata | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` on the API name |
| OAuth protocol endpoints | `/api/oauth/register` (RFC 7591), `/api/oauth/token`, `/api/oauth/revoke` (RFC 7009) on the API name |
| Consent screen | `https://sprintique.iqui.page/oauth/authorize` (interface; the person signs in as usual) |
| People's settings | Настройки → «Сервисные аккаунты»: accounts, their projects and finance grants, tokens, connected apps, owner, the MCP address; project settings → «Участники» lists them as a group |

Settings: `SPRINTIQUE_API_ORIGIN` — origin without a path or trailing slash, HTTPS outside loopback; empty means the interface origin (one name for everything, as on a local stand). It is also the OAuth issuer and the resource identifier of the whole API; `<API origin>/mcp` is the resource of the MCP server. Changing it later invalidates issued OAuth and service tokens (they are bound to it).

The reverse proxy must pass the name the client used: `proxy_set_header Host $host;` (and `X-Forwarded-For` for the per-address limits, with `SPRINTIQUE_TRUST_PROXY`). With two names, only `Host` equal to the interface name (case, a trailing dot and the default port aside) is the interface; any other `Host` is treated as the API name, so a proxy that does not pass `Host` closes the interface instead of opening the API name. On the API name the server itself serves only `/api/…`, `/mcp`, `/.well-known/oauth-*`, `/health` and `/ready` (everything else is 404), and never accepts the session cookie: without `Authorization` a request there is 401. Session cookies are `__Host-` cookies of the interface name, so browsers never send them to the API name anyway. There is no CORS: a browser page elsewhere cannot read API responses, and `/mcp` refuses any foreign `Origin`. The existing nginx vhost of `api.iqui.page` needs nothing else, provided it sets `Host $host`, does not buffer `/mcp` responses beyond the defaults and keeps `client_max_body_size` ≥ 128 KiB.

Apps and scripts never act as a person: every credential of the public API belongs to a **service account** (principal kind `service`), which a person of the workspace made and owns — in settings or on the consent screen. At most 50 live accounts per workspace. Its rights are a project role (`reader`/`editor`) in projects of its workspace plus finance only when granted explicitly (`finance.read`, `finance.write`), never above its owner's current rights there (a writer for changes, the project's administrator for finance changes), checked on every request and by row security. It never manages access, members, invitations, agents, approvals, project settings or other service accounts. The owner manages it; a project administrator changes its rights in the project, removes it from the project, and deletes it when they administer every project it is in; a workspace administrator manages any account of the workspace and reassigns its owner. When the owner is removed from the workspace the account is suspended (it stays so if the owner comes back, and the former owner no longer manages it) until an administrator reassigns or deletes it; reassigning revokes all its tokens and apps, and a token is accepted only while its issuer is the current owner. A disabled owner stops it while disabled. Deletion revokes its tokens and apps and ends its memberships; its history stays.

Credentials of the public API:

- **Service token** (`spk_…`): made by the account's owner in settings, shown once, 1–365 days, scopes `read` or `read write`, valid on REST and MCP. At most 20 live per account.
- **OAuth access token** (`spo_…`, one hour) and **refresh token** (`spf_…`, 30 days from its issue, rotated on every use, at most 10 refreshes a minute per connection): issued to a registered client for the service account the person chose or made on the consent screen, PKCE S256 only, for the MCP server only (`<API origin>/mcp`; the whole REST API is reached with service tokens, so the consent describes exactly what an app can do). A rotated refresh token presented again revokes the whole grant, except within 60 seconds while none of its successors was used (a lost response, or two requests of the client refreshing at once): then another pair is issued, unused access tokens of the earlier answers end, and the first successor used supersedes the others, which are refused without ending the connection. A replayed authorization code revokes what it issued. Connecting the same app again replaces its earlier grant; a grant whose tokens have all expired no longer counts as connected. At most 50 connected apps per person.
- **Agent token** (`spr_…`): unchanged, one project, its own capabilities; works on the API name for the agent endpoints (`/agent-runs`, `/agent-context`, planning previews).

A token acts as its service account (its memberships and grants, row security) under its owner's current rights, narrowed by its scopes: `read` allows GET on REST and the reading tools on MCP; changes need `write` (403 `INSUFFICIENT_SCOPE` otherwise). Its permissions are a membership like a person's since migration 040: a service preset («Сервис: чтение», «Сервис: задачи» or the workspace's own) with personal additions and removals, finance only when added explicitly, never the decisions and access of people; the database caps them by the owner's current permissions in the project and recompiles them whenever those change. Refusals: `FORBIDDEN` (the permission is not held, e.g. finance not added, or above the owner now), `SERVICE_ACCOUNT_FORBIDDEN` (a decision permission service accounts never hold), `SESSION_REQUIRED` (the access permissions: members, agents, project access), `HUMAN_REQUIRED` (the release catalog: a service account proposes a release change through planning, for approval); additions above the owner or of such a permission are refused with 422 `SERVICE_RESTRICTED` (what a preset holds beyond the owner stays in the grant and is capped by the database until the owner has it). A guest of the workspace neither creates nor owns an account (422 `SERVICE_OWNER_INVALID`); an owner made a guest suspends their accounts, and a suspended account's tokens get 401 `UNAUTHENTICATED`. Security actions stay in the interface with a person's session: service accounts, their tokens and apps, agent grants and job operations, members and invitations, project profile, workspace administration, approvals of agent proposals, accepting invitations (403 `SESSION_REQUIRED`). Changes are recorded as the account's (`actor_id`) with its owner (`initiator_id`). A disabled owner or a lost membership ends access at the next request. After a compromise, delete the service account in settings (it revokes everything at once); for a person's compromise, disable the person and delete or reassign their accounts, or as the migration role: `UPDATE auth.credentials c SET revoked_at=now() FROM auth.service_accounts s WHERE s.principal_id=c.principal_id AND s.owner_id=$1 AND c.kind IN ('service','oauth') AND c.revoked_at IS NULL; UPDATE auth.oauth_grants g SET revoked_at=now() FROM auth.service_accounts s WHERE s.principal_id=g.principal_id AND s.owner_id=$1 AND g.revoked_at IS NULL;`. Only SHA-256 hashes of tokens, codes and client secrets are stored.

Client registration is open (RFC 7591), as MCP clients need; nothing a client names (logo, client URI, metadata documents) is fetched. Redirect addresses must be `https://…` or `http://` on loopback, compared by exact string; a loopback address may differ only in its port (RFC 8252 §7.3). The consent screen names the client as the client's own claim (NFKC, controls and invisible characters removed) together with the host the answer goes to, in its heading. Registration shares the per-address sign-in budget and has no global cap, so a flood from some addresses cannot close it for everyone; the table stays bounded instead: at most 5 redirect addresses of 512 characters, clients never connected are removed after a day, and beyond the newest 10,000 unconnected ones the oldest are removed. Expired access tokens are collected a day after expiry (`auth.collect_oauth_access_tokens`), rotated refresh tokens a week after rotation.

MCP tools: `list_projects`, `search_tasks`, `get_task` (with subtasks and the latest discussion), `create_task`, `update_task` and `change_task_status` (with `baseRevision` and an optional `idempotencyKey`), `add_task_comment` (also with `idempotencyKey`), `list_releases`, `list_milestones`, `list_maps`. The changing ones are offered only with `write`. Results with people's text are wrapped as `{"trust":"untrusted-content","notice":…,"data":…}`. There are no resources, prompts, sessions or server-initiated streams (`GET /mcp` is 405).

**Connecting Claude.** In Claude: Settings → Connectors → Add custom connector, URL `https://api.iqui.page/mcp`, no client id or secret. Claude registers itself, opens the consent screen of `sprintique.iqui.page`; sign in, choose one of your service accounts or create a new one (a workspace and your projects), check the rights (untick «Изменять» for read-only) and press «Разрешить». The app then appears under that account in «Сервисные аккаунты», where «Отключить» ends it at once. Claude Code: `claude mcp add --transport http sprintique https://api.iqui.page/mcp`, then `/mcp` to sign in. Other clients connect the same way, or with a service token in `Authorization: Bearer`.

Audit and limits: changes made with a token carry `credential_kind` and, for OAuth, `client_id` in `app.audit_events`; accounts made, changed, suspended, reassigned and deleted, project grants, tokens made and revoked, apps connected and revoked and detected replays are in `auth.access_events` (identifiers only). Logs name the OAuth grant type, error codes and MCP tool names with outcome and duration, never bodies, arguments, codes or tokens. `/internal/metrics` adds `mcpToolCalls` by tool and outcome. Each bearer credential has its own window of 600 requests a minute (in this process; all access tokens of one OAuth connection share it), counted once the token is found live. Requests with a bearer token do not spend the per-address window, because an assistant's servers carry many people's tokens from a few addresses; a bearer header that proves no live credential costs its address one request, and an address whose window is spent is refused whatever it carries. The address budgets still apply to the token endpoint (1,000 a minute) and registration (20 a minute): if many people connect through one assistant at once, raise them or exempt its addresses at the proxy.

## Containers

`npm run build:image` builds the web interface and then the image with Jib (`server/build/jib-image.tar`, image `sprintique-server:<version>`): the production artifact only, the interface in `/app/web`, a JRE 25 base pinned by digest, UID 10001, `SPRINTIQUE_ENVIRONMENT=production` unless the deployment overrides it. The image is built for the architecture of the machine that builds it (CI: amd64); `./gradlew jibBuildTar -Pimage.architecture=amd64|arm64` chooses another. Probe `/ready` for traffic admission (the image carries no HEALTHCHECK). The default command is the API; pass `worker` for the worker. Run `migrate` as a separate pre-start job with migration credentials, never in the API container.

Recommended runtime constraints already exercised locally: read-only root filesystem, writable bounded `/tmp` tmpfs with noexec/nosuid, all capabilities dropped, no-new-privileges, memory/CPU limits. The local API probe uses 512 MiB/1 CPU and loopback publishing. These are test defaults, not a sizing promise. `.dockerignore` excludes output/infra, browser state, test results and backups.

The single-host production layout (PostgreSQL container, API and worker on the host network behind nginx, loopback Postfix with DKIM, S3 under a prefix, daily dumps) is in [deploy/vps](../deploy/vps/README.md).

`scripts/check-container.mjs` loads the Jib image tarball into the owned Docker context and checks it against real PostgreSQL/S3, validates UID/readiness/authenticated session and anonymous rejection, then removes only its probe container. Its `PUBLIC_ORIGIN` remains the application origin; it is not a second public deployment. Sign-in from inside this probe is not exercised: the probe reuses the session that `check-local-sign-in.mjs` opened on the stand.

## Local reference services

`local-storage.mjs` and `local-services.mjs` use context `colima-sprintique-vnext-qa`. Create/start the intended Docker VM separately. Scripts do not select/restart a default VM. Containers carry `sprintique.owner=vnext-qa`; volume adoption is limited to already-owned consumers. Name collisions with unrelated resources stop execution.

| Service | Host binding | Persistence |
| --- | --- | --- |
| API + worker | localhost:4312 | SQL/S3; no browser-only canonical state |
| PostgreSQL | 127.0.0.1:54329 | owned PG volume |
| Mailpit (SMTP relay) | 127.0.0.1:54325 SMTP, 127.0.0.1:54326 letters API | none: keeps letters in memory, delivers nothing |
| Garage S3 | 127.0.0.1:4900 | private bucket/owned data volume; no public/admin endpoint |

`npm run local:services` creates and starts PostgreSQL and Mailpit and writes `output/infra/stand.json`. `output/infra/` is mode 0700; configuration, keys and browser state are mode 0600. The stand signs in by e-mail through the SMTP relay, the way production does; it cannot show Google or Apple, which require their real services and an HTTPS origin.

`npm run local:start` builds the production artifact, applies migrations with the migration role, then starts the API and the restricted worker. SIGINT/SIGTERM stops those children. `node scripts/local-app.mjs --migrate-only` performs only that explicit local migration. It reads generated private config without printing secrets.

## Checks and evidence

- `npm run local:check-sign-in` (`scripts/check-local-sign-in.mjs`): a code by e-mail through the stand's SMTP relay, a refused wrong code, a session, a code spent once, CSRF and a persisted QA task. It creates/updates synthetic `stand-qa` data and writes a **private** browser storage-state file (`output/infra/browser-state.json`) that the checks below reuse.
- `scripts/check-local-agent.mjs`: a scoped temporary grant/run/proposal against synthetic data. The human approves the exact proposal in UI; `--complete` commits its receipt, completes the run and revokes the grant. No shell/LLM provider is invoked. Do not interrupt between token issuance and revocation without inspecting/revoking the owned test grant.
- `scripts/check-container.mjs`: non-root/read-only container probe described above.
- Root `scripts/verify-vnext.mjs`: source fingerprint, library tests/package boundary, product strict build/tests and detached product clean install/build/tests. Use `SPRINTIQUE_TEST_DOCKER=1` and the explicit Docker context for portable PG mode, plus absolute `TEST_S3_CONFIG` for real S3 coverage.
- `.github/workflows/vnext.yml`: fresh CI storage, full gate and container build. Only verification/OpenAPI artifacts are uploaded, never infra configuration. Remote execution is not verified until an authorized push triggers CI.

Evidence timestamps matter: a backup or browser check proves its recorded state, not subsequent changes. Files named `*-verification.json` hold non-secret summaries; other `output/infra` files may contain credentials. Do not recursively copy that directory into a deliverable.

## Backup/restore drill

`node --import tsx scripts/backup-drill.mjs` is intentionally **local-only** and targets the fixed owned QA resources. Stop the local API and worker first. The script refuses active runtime database sessions/online API; keep other writers stopped throughout. It does not overwrite the source database.

The drill streams every object to disk and back with its hash (files may be up to 2 GiB). It creates a private custom-format dump of the application database (people and their ways in included), copies referenced object variants with checksums, and fingerprints canonical tables. It restores into a new isolated PostgreSQL container and S3 prefix, compares table fingerprints, starts the server on the restored copy (runtime role, `SPRINTIQUE_STORAGE_PREFIX` pointing at the restored objects), authenticates a restored session and downloads restored private files; anonymous reads must fail. The restore container holds real private data on a published loopback port, so every TCP login uses a fresh per-run secret and SCRAM; it is never started with trust authentication. Container teardown runs even when a client or object cleanup step fails. It rechecks the source fingerprints at the end. Temporary restored objects/container/anonymous volume are removed; the private checkpoint remains in `output/infra/backups/<id>/`.

Limits: 128 MiB per dump, 50,000 rows per fingerprinted table and 200 assets. This is a small local consistency drill, not a general production backup tool. Checkpoints are mode 0600/0700 but **not encrypted**. The restored ways in are counted; a new sign-in against the restored copy is not exercised. No production RPO/RTO, off-site replication or retention SLA is asserted. Restart with `npm run local:start` after the drill.

## Observability and limits

`/health` is liveness. `/ready` verifies exact schema/runtime-role/S3 readiness and that the image encoder works (see [Files](#files)); use it for traffic admission. Optional `SPRINTIQUE_METRICS_TOKEN` (32–256 characters) enables `/internal/metrics`, requiring its own Bearer token; otherwise the route is absent. Keep it private. Aggregate schema `runtime-metrics/1` is process-local and resets on restart. Labels are bounded route templates/method/status class, never user paths, query strings, principal IDs or tokens. Long-lived streams are counted when closed, not as active-connection telemetry. Request logs omit bodies, cookies, headers, SQL and provider responses.

Default process limits: 1,000 requests/minute/IP (bearer requests excepted, see above); 600 requests/minute per bearer credential; sign-in 20/minute/IP (starting a provider sign-in, both e-mail steps, dev login, OAuth client registration); 64 active requests; transfers in lanes capped in total and per credential (a session or a bearer token — a person with several sign-ins holds several), so one sign-in cannot fill a lane: short uploads up to 32 MiB and a person's photo (8 in all, 2 per credential), uploads over 32 MiB (8, 2 each; not counted in the 64) and downloads of originals (32, 8 each; not counted in the 64); 100 SSE streams overall and 3 per credential. Request bodies: 128 KiB for commands, 2 MiB for map documents, 10 MiB for a person's photo, 2 GiB for a file's content. S3 calls have a 15-second deadline (two minutes for a part, a whole small object or assembling the parts; a minute of silence cuts a connection). The image decoder allows two concurrent operations. These are explicit conservative defaults; distributed deployment needs shared admission control. Load regression tests exercise 2,000 tasks and concurrent reads/CAS writes; their thresholds are not an SLA.

## Files

Uploads stream through the API, never directly from the browser to S3: the bucket stays private, needs no CORS and is never named to a browser; same-origin, CSRF, project policy, RLS and the limits above apply to the upload itself. The browser computes the file's SHA-256 slice by slice (WebCrypto up to 64 MiB, an incremental digest beyond), reserves the upload with name, size and hash, and sends the body with `PUT /api/v1/projects/{project}/assets/{id}/content`. The server:

- opens the upload in a short transaction and closes it before reading the body — no transaction, row or project lock is held while bytes arrive;
- checks the first 512 bytes against the signature of the declared extension, text as strict UTF-8 without NUL to the last byte, and the size and SHA-256 of every byte;
- holds at most one 8 MiB part per upload in memory (files up to 8 MiB and previewable images up to 32 MiB are held whole, within 96 MiB for all held uploads together) and writes larger bodies as an S3 multipart upload that it completes only after the size and hash matched the reservation, so no unchecked byte is ever visible under a key;
- cuts a body off when its reservation expires, when it arrives slower than 16 KiB/s on average after the first minute, or when a body held in memory takes longer than five minutes;
- marks the upload `publishing` in a short transaction, completes the objects with no transaction or lock held (discarding answers `409 FILE_BUSY` meanwhile and cleanup postpones itself; a publication untouched for ten minutes is abandoned — its process died or its session ended — and the upload is open again; a file published close to its expiry gets an hour to be linked), and marks it ready in a last short transaction;
- quarantines a refused body (signature, size, hash, expiry, unreadable image) in its own transaction and aborts its parts.

Accepted formats (the extension picks the type, the first bytes must agree): video `mp4 m4v mov webm`; audio `mp3 m4a wav ogg`; documents `pdf docx xlsx pptx odt ods odp doc xls ppt rtf`; images `png jpg jpeg webp gif heic heif svg`; archives `zip 7z rar tar gz`; text `txt md csv json log`. Any other name is stored as `application/octet-stream`. Up to 2 GiB per file; a project holds up to 20 GiB. Previews (WebP, 2048 and 720 px) are made only for PNG, JPEG and WebP up to 32 MiB and 40 megapixels; a larger or animated image in a task is kept as a file without a preview; a map image must be such an image. Projects have no avatar (migration 033); a person's photo is a separate, small image kept in the database.

**Images and the WebP encoder.** Previews and people's photos are encoded to WebP by a native library (libwebp from `webp-imageio`). Its loader copies the library to `java.io.tmpdir` and loads it from there, which a container with a `noexec` `/tmp` refuses; before 2026-09-30 this turned every photo and preview into `422 IMAGE_DECODE`. The image therefore carries the library in `/app/native` and starts the JVM with `-Djava.library.path=/app/native --enable-native-access=ALL-UNNAMED`; the build fails (`verifyWebpNative`) if the dependency stops carrying it. The first image still prints two lines to standard error (`Failed to load native library …` and the `UnsatisfiedLinkError … failed to map segment`) from the loader's attempt in `/tmp`, which also leaves a copy of the library of about 0.8 MiB there until the process ends, before it loads from `/app/native` — expected. An encoder that cannot run at all is the server's fault: requests answer `503 IMAGE_UNAVAILABLE`, the log says `Image encoder unavailable: <class>: <message>` once per outage, and `/ready` fails until an encode succeeds. Running the JAR directly on a host with an executable `/tmp` needs nothing.

**A person's photo.** `PUT /api/v1/profile/avatar` takes the cropped image the settings send (a 512 px WebP, or PNG from Safari, which cannot encode WebP), at most 10 MiB (`413 FILE_SIZE`), at least 32 px, and stores a 256 px WebP. HEIC, AVIF, GIF, SVG, BMP and TIFF are refused by name (`422 FILE_TYPE`). Before the cropper opens a picture, the browser converts what the cropper cannot take — a HEIC where the browser reads it (Safari), a photo over 10 MB or 40 megapixels, a GIF — to a JPEG (PNG for pictures that may be transparent) of at most 2048 px; a file the browser cannot read gets a message saying what to do. A photo the image processing refuses is logged as `Profile photo refused: <status> <code> (<bytes> bytes, <format>)`, and one over the size limit as `Profile photo refused: 413 FILE_SIZE (<bytes> bytes)`, never with its content; an unauthenticated or empty request is refused before that and not logged as a photo.

Downloads stream from S3 in 16 MiB windows, and project access is checked again before every window. A single `Range: bytes=…` is honoured to its end (`206`, `416`, `If-Range` against the SHA-256 `ETag`, `Accept-Ranges: bytes`), so players seek and download managers resume. A failure after the first bytes (storage, database, revoked access) ends the response short and closes its connection (`Connection: close` on every original), so a reader sees fewer bytes than announced and never a problem body inside the file. PNG, JPEG, WebP, GIF and video are served `inline`; everything else, SVG included, is `attachment`, and SVG, HTML and XML are never named as such (`application/octet-stream`). Every file carries `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox; frame-ancestors 'none'` and `Cache-Control: no-store`.

Cleanup deletes the objects of discarded, quarantined and expired uploads and aborts any unfinished multipart upload under their keys; a completed upload also aborts every other unfinished upload of the same key (a concurrent duplicate of the same content then fails, which loses nothing). Cleanup needs `s3:ListBucketMultipartUploads` and `s3:AbortMultipartUpload` besides get, put and delete; without them objects are still deleted and the lifecycle rule remains the only line against leftover parts. As a second line for a process that died mid-upload, give the bucket a lifecycle rule that aborts incomplete multipart uploads after one day.

The reverse proxy in front of the API must let 2 GiB through without spooling it, and must not buffer long downloads. For nginx, in the server block of the API:

```nginx
client_max_body_size 2050m;          # 2 GiB body plus headroom; the API enforces the exact limits
location ~ ^/api/v1/projects/[^/]+/assets/[^/]+/(content|original)$ {
    proxy_pass http://sprintique_api;  # the same upstream and proxy headers as the other API locations
    proxy_request_buffering off;       # stream the upload to the API as it arrives
    proxy_buffering off;               # stream downloads and ranges without temporary files
    proxy_read_timeout 300s;           # publishing a finished 2 GiB upload may take a while
    proxy_send_timeout 300s;
    client_body_timeout 120s;
}
```

Migration `V20260929000026` (files up to 2 GiB) can be rolled back only while no file is larger than 10 MiB and none is being published; after that, only forward. Stop the API and worker, run this as the migration owner in one transaction, then start the previous artifact (it validates the shortened history). The script refuses when rollback would lose data. Checked on a fresh database: after it, `pg_dump --schema-only` equals a database migrated without 026, the previous artifact migrates cleanly, and 026 applies again.

```sql
BEGIN;
LOCK TABLE app.assets IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM app.assets WHERE size>10485760 OR state='publishing') THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: files over 10 MiB or publications exist; roll forward instead';
  END IF;
END $$;
ALTER TABLE app.assets DROP CONSTRAINT asset_size;
ALTER TABLE app.assets ALTER COLUMN size TYPE integer;
ALTER TABLE app.assets ADD CONSTRAINT assets_size_check CHECK(size BETWEEN 1 AND 10485760);
ALTER TABLE app.assets DROP CONSTRAINT asset_state;
ALTER TABLE app.assets ADD CONSTRAINT asset_state CHECK(state IN ('uploading','ready','attached','detached','quarantined','deleting','deleted'));
CREATE OR REPLACE FUNCTION work.prepare_asset_gc(job_id uuid,token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job work.jobs;asset app.assets;
BEGIN
  SELECT * INTO job FROM work.jobs WHERE id=job_id AND lease_token=token AND kind='asset.gc' AND state='running' AND lease_until>clock_timestamp() FOR UPDATE;
  IF job.id IS NULL THEN RAISE EXCEPTION 'LEASE_LOST' USING ERRCODE='55000'; END IF;
  SELECT * INTO asset FROM app.assets WHERE project_id=job.project_id AND id=job.payload->>'assetId' FOR UPDATE;
  IF asset.id IS NULL OR asset.state IN ('attached','deleted') OR asset.expires_at>clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE app.assets SET state='deleting',updated_at=clock_timestamp() WHERE project_id=asset.project_id AND id=asset.id;
  RETURN jsonb_build_object('id',asset.id,'projectId',asset.project_id,'sha256',asset.sha256);
END $$;
REVOKE ALL ON FUNCTION work.prepare_asset_gc(uuid,uuid) FROM PUBLIC;
DELETE FROM public.flyway_schema_history WHERE version='20260929000026';
COMMIT;
```

### Project avatars retired (migration 033)

Migration `V20260930000033` removes project avatars. Stop the API before running `migrate`, as for any release: a previous API still running reads the dropped column and fails its session requests until it is replaced. It detaches every project avatar that still holds objects and queues an ordinary `asset.gc` job for it, so the running worker deletes the original and both previews from S3 and marks the asset `deleted`, as it does for any replaced file; nothing needs to be done by hand. The column `app.projects.avatar_asset_id` and its foreign key are dropped, and a constraint keeps any project avatar out of a live state. To check that the cleanup has finished, as the migration owner: `SELECT state, count(*) FROM app.assets WHERE target_type='project-avatar' GROUP BY state;` — only `deleted` (and `quarantined`, already cleaned) should remain; failed jobs show in project settings under «Очистка файлов» and can be retried there. The one-off legacy importer of 2026-09-29 wrote project avatars (`avatar_asset_id`); run against a database past 033 it needs its project avatar step removed.

## Before external release

Require an authorized target and real DNS/TLS, SMTP with SPF/DKIM/DMARC and, if offered, Google and Apple client configuration; fresh database and private storage; least-privilege network access; encrypted backups with a complete restore rehearsal; a tested gateway/replica policy; dependency/container security review and independent application security/accessibility testing. Define monitoring/alert routing and capacity targets. Configure notification providers only when selected; do not report SSE as external delivery. External agent providers, arbitrary code execution, MCP sessions/notifications and distributed tracing are future extensions, not hidden local substitutes. Before exposing `api.iqui.page`, check that nginx passes `Host $host` there (see [Public API and MCP server](#public-api-and-mcp-server)).
