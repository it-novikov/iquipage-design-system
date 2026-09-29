# Sprintique vNext

Clean-start, self-contained product: the approved board, Planning consumer from PR #3 and maps run against a new PostgreSQL backend. This is a locally verified `2.0.0-alpha.0`, **not a production deployment or a migration of the old platform**.

## Independence and architecture

Copy this entire directory to another repository. No parent workspace, DS source checkout or root install is required. The explicit `vendor/iquipage-web-0.6.0-vnext.24.tgz` release can later be replaced by the same authorized registry package. Its SHA-256 is `699cb365c09b7153ecaa420d9c958af200ab769fbfd771edc3fe75dc853604e5`. Product and library versions are independent.

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

Kotlin 2.3 / Spring Boot 4 / PostgreSQL modular monolith on JDK 25 (see [the server decision](docs/decisions/0001-kotlin-backend.md)); a separately runnable worker uses a narrower database role. Domain commands are independent of HTTP so a future MCP transport can reuse authorization, previews, approvals and receipts. Agent text and map documents are data, not executable instructions. There is no arbitrary shell or LLM executor.

## Implemented product surface

- Tasks: canonical readable keys, Markdown/checklists, compact DS editor, tags, templates, files/covers, links, status movement, task URLs and discussions with resolution state.
- Planning: release-first list/hierarchy, preparation and board admission, temporal views, milestones/dependencies, atomic previews and commits, explicit remainder on closing, immutable history, exact selection snapshots and lost-response recovery across reload. The same task document is used everywhere. See [consumer provenance](ui/planning/PROVENANCE.md) and [integration contract](docs/planning-integration-r3.md).
- Maps: versioned documents, CAS/draft recovery, private image references, task references, sessions/votes/timer, reusable templates and read-only version history. The existing DS canvas is retained. Executable workflow/automation capabilities are explicitly disabled.
- Administration: a full-width settings workspace on the DS side navigation (Профиль, Внешний вид; О проекте, Участники, Теги, Шаблоны задач, Спринты и релизы, Агенты, Очистка файлов; О пространстве, Участники пространства). Workspace/project profiles and avatars, member roles changed in the row, expiring single-use invitation links (24 hours, 3 or 7 days) with state, revocation, task templates, tags in any RGB colour and scoped search. People who cannot change a setting see values and a lock notice naming an administrator. See [settings design](docs/settings/DESIGN.md).
- Task drawer: the title as a heading, one strip of key values (status, assignee, priority, due date), quiet rows for type, release and tags; the description opens in preview and edits on click, with templates inside the editor; relations as a map (parent, subtasks, dependencies, blocked and related tasks); cover menu on the image. See [UX and DS alignment](docs/ux-ds-alignment.md).
- Agents: scoped expiring credentials, bounded context, run/proposal budgets, action-bound human approval, exact commit receipt, cancellation/expiry fences and revocation. This executes approved **typed Planning commands**, not general code or a shipped MCP server.
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

Live project-scoped authorization is enforced in use cases and PostgreSQL RLS. Workspace administration does not implicitly grant every project's content. Sessions enforce Origin/CSRF; agents enforce project capabilities and expiry. Read and write capabilities are independent: a grant that carries `tasks:write` or `threads:write` without the matching read receives a compact `{"receipt":"task"|"thread"}` acknowledgement instead of preserved content, and `POST /planning/previews` requires `tasks:read` because its effects project existing tasks. Startup rejects superuser, BYPASSRLS and business-table-owner runtime connections. Transactional outbox events feed authorized SSE/pull; **external notification delivery is not configured**.

## Explicit limits and release boundary

- Planning mutations use a conservative project-wide revision fence/serialized transaction; no unlimited-scale or finer task-level ACL claim.
- Planning pages 100; explicit selections 200 (server snapshots support larger operations); legacy task pages 200; catalogs 500; thread pages 50; full thread messages capped at 2,000.
- Files 10 MiB; images 40 megapixels and two decoder slots; private re-encoded variants. No video covers or antivirus claim. Media quota 5 GiB/project, 100 pending assets/actor.
- Maps: 600 objects / 1,600 connections. Agent context: 20 tasks / 100 objects / 64 KiB; runs/proposals have explicit budgets and expiry.
- Rate/concurrency/stream limits are per API process. Horizontal deployment needs shared gateway/limits. Metrics are bounded process aggregates, not distributed tracing.
- Restore verification covers both databases and referenced private objects. It is a local consistency drill, not production RPO/RTO or encrypted off-site backup.
- Independent security audit, exhaustive accessibility/browser coverage, external pilot, SMTP/notifications, distributed tracing and MCP/provider execution are not claimed. GitHub CI is defined but cannot be called remotely passed without a pushed run.

Keep the existing platform/data untouched. Deployment, provider accounts, secret provisioning, publication and migration need their own authorized release step.
