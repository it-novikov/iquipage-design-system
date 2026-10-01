# Sprintique vNext

Clean-start, self-contained product: the approved board, Planning consumer from PR #3 and maps run against a new PostgreSQL backend. This is a locally verified `2.0.0-alpha.0`, **not a production deployment or a migration of the old platform**.

## Independence and architecture

Copy this entire directory to another repository. No parent workspace, DS source checkout or root install is required. The explicit `vendor/iquipage-web-0.6.0-vnext.26.tgz` release can later be replaced by the same authorized registry package. Its SHA-256 is `d5bedc96e5b29b9d57376d7ea6d49a146003fad02eea3b123452cc21b208e4e3`. Product and library versions are independent.

```text
server                  Kotlin/Spring Boot server: API, worker and migrate commands in one artifact
  src/main/kotlin       Modules (identity, workspace, task, catalog, discussion, planning, map, media, agent,
                        event, job, search, apidoc), each split into domain, application, api, infrastructure
  src/main/resources    Flyway migration ledger (db/migration) and the exported public contract schemas
  src/local             Local-stand-only code (admin/admin sign-in, settings preview); absent from production
contracts               Static Zod contracts; the web client validates with them, the server publishes them
client                  Typed Planning HTTP client
web                     Product host and server-to-UI adapters
ui                      Existing board/maps and imported Planning consumer
scripts                 Test runner, local infrastructure, verification and restore drill
tests                   HTTP tests against the server process, real PostgreSQL/S3, consumer unit tests
vendor                  Explicit public DS package, not library source imports
```

Kotlin 2.3 / Spring Boot 4 / PostgreSQL modular monolith on JDK 25 (see [the server decision](docs/decisions/0001-kotlin-backend.md)); a separately runnable worker uses a narrower database role. Domain commands are independent of HTTP; the MCP transport reuses their authorization, revision checks, retry ledger and audit. Agent text and map documents are data, not executable instructions. There is no arbitrary shell or LLM executor.

## Implemented product surface

- Tasks: canonical readable keys, Markdown/checklists, compact DS editor, tags, templates, files/covers, links, status movement, task URLs and discussions with resolution state.
- Planning: release-first list/hierarchy, preparation and board admission, the board shows one release at a time (the running one by default; the person may pick a planned one or «Без релиза», remembered on the server for them and the project), a task created on the board joins the release it shows after a confirmation the person can turn off (a personal preference kept on the server), temporal views, milestones/dependencies, atomic previews and commits, explicit remainder on closing, immutable history, exact selection snapshots and lost-response recovery across reload. The same task document is used everywhere. See [consumer provenance](ui/planning/PROVENANCE.md) and [integration contract](docs/planning-integration-r3.md).
- Maps: versioned documents, CAS/draft recovery, private image references, task references, sessions/votes/timer, reusable templates and read-only version history. The existing DS canvas is retained. Executable workflow/automation capabilities are explicitly disabled.
- Finance: a project ledger of income and expense entries in integer minor units of an ISO currency (RUB by default, per entry currency allowed): planned by a due date, posted on the day the money moved, voided with a reason and final; an immutable version of every revision written by the database; totals per currency, by month and by category computed on read. People of the project read it, project administrators change it, agents never see it. No accounts, transfers, budgets or exchange rates. See [finance](docs/finance.md) and [ADR 0003](docs/decisions/0003-project-finance.md).
- Administration: a full-width settings workspace on the DS side navigation (Профиль, Внешний вид; О проекте, Участники, Доступ, Теги, Шаблоны задач, Спринты и релизы, Агенты, Очистка файлов; О пространстве, Участники пространства, Пресеты прав, Приглашения). Workspace/project profiles (a project is known by its name; there are no project or workspace avatars), people's photos; access as named permissions with editable presets and personal additions/removals, workspace roles (owner, administrator, member, guest), ownership transfer and a recorded administrator entry; invitations by e-mail and by single-use link with state, resend and revocation (see [access and invitations](docs/access/access-and-invitations.md)); task templates, tags in any RGB colour and scoped search. People who cannot change a setting see values and a lock notice naming an administrator. See [settings design](docs/settings/DESIGN.md).
- Task drawer: the title as a heading, one strip of key values (status, assignee, priority, due date), quiet rows for type, release and tags; the description opens in preview and edits on click, with templates inside the editor; relations as a map (parent, subtasks, dependencies, blocked and related tasks); cover menu on the image. See [UX and DS alignment](docs/ux-ds-alignment.md).
- Agents: scoped expiring credentials, bounded context, run/proposal budgets, action-bound human approval, exact commit receipt, cancellation/expiry fences and revocation. This executes approved **typed Planning commands**, not general code.
- Public API and MCP: apps and scripts act as **service accounts** (owned by a person, never above the owner's rights, finance only by explicit grant), never as the person. `https://api.iqui.page/api/v1` with service tokens, and a remote MCP server at `https://api.iqui.page/mcp` with OAuth 2.1 (dynamic registration, PKCE, consent in the interface that picks or creates the service account, rotating refresh tokens, revocation from settings) and typed tools, narrowed by read/write scopes. See [ADR 0003](docs/decisions/0003-public-api-mcp.md) and [operations](docs/operations.md#public-api-and-mcp-server).
- Operations: sign-in by an e-mail code, Google and Apple, private S3 validation/re-encoding, quotas/throttling, audit/outbox-backed authorized SSE, leased asset cleanup jobs and admin retry, exact schema readiness, redacted route-level metrics/logs, container/CI scripts and an isolated restore drill.

## Build and test

Requirements: JDK 25 (found through `SPRINTIQUE_JAVA_HOME`, `JAVA_HOME` or the usual install paths), Node 24 and npm. Use PostgreSQL 18 binaries as a normal user for native tests, or an explicitly selected Docker context. Real S3 tests need a private test bucket, never production storage.

```sh
npm ci --ignore-scripts
npm run check:boundaries
npm run build
PG_BIN=/path/to/postgresql/18/bin TEST_S3_CONFIG=/absolute/private/test-storage.json npm test
```

`npm test` is the whole gate: the contract export check, `./gradlew check` (style, static analysis, unit tests, the production artifact), the Flyway ledger applied to an isolated cluster, the Kotlin integration tests and the HTTP suites against a server process. `npm run build:server` builds `server/build/libs/sprintique-server.jar`; `npm run build:image` builds the container image as `server/build/jib-image.tar`.

`TEST_S3_CONFIG` contains `endpoint`, `region`, `bucket`, `accessKeyId`, `secretAccessKey`. Keep it mode 0600 and outside source control. Tests create their own database/storage namespace and separate migration/API/worker roles, then remove only their resources. Skipped S3 cases mean the full gate has **not** passed.

Portable Docker mode (fresh PostgreSQL container; explicit context, no root `initdb`):

```sh
SPRINTIQUE_TEST_DOCKER=1 SPRINTIQUE_DOCKER_CONTEXT=your-isolated-context TEST_S3_CONFIG=/absolute/private/test-storage.json npm test
```

From the original repository root, `node scripts/verify-vnext.mjs` additionally builds/packs/tests the DS, verifies the public boundary and copies **only** this product to a clean directory for a fresh install/build/test. The product remains independently testable without that root script.

`npm run preview:fixture` is a disposable synthetic-auth test entry served by the local artifact only. Do not expose it to a network.

## Local debugging stand

`LC_ALL=C npm run dev:local` starts an ephemeral PostgreSQL, applies the migration ledger, starts the server's local artifact, seeds synthetic workspaces (five projects with boards, releases, members, tags and maps) and serves the built UI at http://localhost:4311. Sign in with **admin / admin**, or by e-mail: letters with codes land as files in `output/local-mail/`. Run `npm run build` (or `npx vite build`) first so `dist/` is current. Object storage is optional: without `output/infra/storage.json` or `TEST_S3_CONFIG`, attachments and covers are unavailable.

The fixed login exists only in the local artifact (`server/src/local`, enabled with `SPRINTIQUE_DEV_LOGIN=true`); the production artifact does not contain it, which its build verifies. The server refuses to start with it when `SPRINTIQUE_ENVIRONMENT=production` or on a non-loopback origin. The mail drop is local-only in the same way. The sign-in screen asks `/api/v1/auth/methods` and offers only the configured ways in.

## Local reference stack

PostgreSQL 18.6, Garage 2.3.0 and Mailpit 1.31.3 are pinned by image digests in local scripts. They use loopback ports, an explicitly selected Docker context, owned resource labels and private ignored `output/infra/` configuration. Scripts refuse unrelated containers/volumes and never start/restart the user's default Docker VM.

```sh
npm run local:storage
npm run local:services
npm run build
npm run local:start
npm run local:check-sign-in
```

API: `http://localhost:4312`. `local:start` builds the production artifact and runs its `migrate`, `api` and `worker` commands; sign-in codes go through the Mailpit SMTP relay (letters at http://127.0.0.1:54326), as they would through a real one. `local:check-sign-in` signs in by e-mail and leaves the session the container check, the agent check and the restore drill reuse. Google and Apple need their real services and an HTTPS origin: see [Sign-in](docs/operations.md#sign-in).

See [operations](docs/operations.md) for runtime configuration, worker/container, private evidence and restore procedures. Credentials and backups must never enter a PR or source archive.

## Contracts and reliability

Prefix `/api/v1`. `/openapi.json` is an OpenAPI 3.1 route inventory the server builds from its handlers; its schemas are exported from the Zod contracts (`npm run contracts`, checked by `npm test`), and every request contract is checked against them field for field. `/api/v1/contracts` exposes the same schemas. Some non-Planning responses are marked `x-response-schema: see-resource-contract`; do not claim fully generated SDK coverage for the whole platform.

Task/Planning/map/media/catalog commands use `Idempotency-Key` and/or `baseRevision` as declared in OpenAPI. Changed bodies under the same key conflict. Planning has durable receipts and a browser write-ahead journal. Profile/member CAS changes reject stale revisions; once-only secret issuance and identity bootstrap calls are not automatically retried. Approval binds an exact prepared plan and is not execution itself.

Live project-scoped authorization is enforced in use cases and PostgreSQL RLS: every action needs one permission on the caller's membership row (`auth.can`). Workspace administration does not implicitly grant every project's content. Sessions enforce Origin/CSRF; agents enforce project capabilities and expiry; a service account's tokens enforce scopes and their resource within the account's permissions, and never replace a person's session for access decisions. Read and write capabilities are independent: a grant that carries `tasks:write` or `threads:write` without the matching read receives a compact `{"receipt":"task"|"thread"}` acknowledgement instead of preserved content, and `POST /planning/previews` requires `tasks:read` because its effects project existing tasks. Startup rejects superuser, BYPASSRLS and business-table-owner runtime connections. Transactional outbox events feed authorized SSE/pull. Personal notifications (assigned, mention, request, deadline) are raised in the transaction of their cause and shown in the header bell; Telegram delivery is optional (docs/operations.md, «Notifications and Telegram»).

## Explicit limits and release boundary

- Planning mutations use a conservative project-wide revision fence/serialized transaction; no unlimited-scale or finer task-level ACL claim.
- Planning pages 100; explicit selections 200 (server snapshots support larger operations); legacy task pages 200; catalogs 500; thread pages 50; full thread messages capped at 2,000.
- Files up to 2 GiB, streamed to S3 in 8 MiB multipart parts and read back by byte ranges (video plays and seeks in the task). Video, audio, office documents, images, archives, text and PDF are checked by signature; any other file is a generic download. Previews only for PNG/JPEG/WebP up to 32 MiB and 40 megapixels, two decoder slots; private re-encoded variants. No video transcoding, posters or antivirus claim. Media quota 20 GiB/project, 100 pending assets/actor. See [operations](docs/operations.md#files).
- Finance: 100,000 entries per project; amounts up to 10^15−1 minor units; ledger pages 100, history pages 50; the summary lists up to 240 months and 200 categories.
- Maps: 600 objects / 1,600 connections. Agent context: 20 tasks / 100 objects / 64 KiB; runs/proposals have explicit budgets and expiry.
- Rate/concurrency/stream limits are per API process. Horizontal deployment needs shared gateway/limits. Metrics are bounded process aggregates, not distributed tracing.
- Restore verification covers both databases and referenced private objects. It is a local consistency drill, not production RPO/RTO or encrypted off-site backup.
- Independent security audit, exhaustive accessibility/browser coverage, external pilot, mail bounce tracking, e-mail or push notifications, distributed tracing and agent/provider execution are not claimed. The MCP server is stateless and offers tools only. GitHub CI is defined but cannot be called remotely passed without a pushed run.

Keep the existing platform/data untouched. Deployment, provider accounts, secret provisioning, publication and migration need their own authorized release step.
