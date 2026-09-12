# Sprintique vNext

Clean-start, self-contained product: the approved board, Planning consumer from PR #3 and maps run against a new PostgreSQL backend. This is a locally verified `2.0.0-alpha.0`, **not a production deployment or a migration of the old platform**.

## Independence and architecture

Copy this entire directory to another repository. No parent workspace, DS source checkout or root install is required. The explicit `vendor/iquipage-web-0.6.0-vnext.1.tgz` release can later be replaced by the same authorized registry package. Its SHA-256 is `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`. Product and library versions are independent.

```text
backend/domain          Invariants, errors and media validation
backend/application     Transactional use cases, never UI/transport code
backend/infrastructure  PostgreSQL authorization, S3 and fenced job leases
backend/http            HTTP, OIDC, SSE, limits and observability adapters
contracts               Static Zod contracts; no dynamic user-supplied schemas
client                  Typed Planning HTTP client
web                     Product host and backend-to-UI adapters
ui                      Existing board/maps and imported Planning consumer
migrations              Immutable clean-start schema (001–015)
scripts                 Build, local infrastructure, verification and restore drill
tests                   Real PostgreSQL/S3 and consumer unit tests
vendor                  Explicit public DS package, not library source imports
```

Node 24 / TypeScript strict / Fastify / PostgreSQL modular monolith; a separately runnable worker uses a narrower database role. Domain commands are independent of HTTP so a future MCP transport can reuse authorization, previews, approvals and receipts. Agent text and map documents are data, not executable instructions. There is no arbitrary shell or LLM executor.

## Implemented product surface

- Tasks: canonical readable keys, Markdown/checklists, compact DS editor, tags, templates, files/covers, links, status movement, task URLs and discussions with resolution state.
- Planning: release-first list/hierarchy, preparation and board admission, temporal views, milestones/dependencies, atomic previews and commits, explicit remainder on closing, immutable history, exact selection snapshots and lost-response recovery across reload. The same task document is used everywhere. See [consumer provenance](ui/planning/PROVENANCE.md) and [integration contract](docs/planning-integration-r3.md).
- Maps: versioned documents, CAS/draft recovery, private image references, task references, sessions/votes/timer, reusable templates and read-only version history. The existing DS canvas is retained. Executable workflow/automation capabilities are explicitly disabled.
- Administration: workspace/project selection and profiles, project avatars, member roles, expiring single-use invitation links, revocation, task settings/templates/tag colors and scoped search.
- Agents: scoped expiring credentials, bounded context, run/proposal budgets, action-bound human approval, exact commit receipt, cancellation/expiry fences and revocation. This executes approved **typed Planning commands**, not general code or a shipped MCP server.
- Operations: real OIDC code+PKCE, private S3 validation/re-encoding, quotas/throttling, audit/outbox-backed authorized SSE, leased asset cleanup jobs and admin retry, exact schema readiness, redacted route-level metrics/logs, container/CI scripts and an isolated restore drill.

## Build and test

Requirements: Node 24 and npm. Use PostgreSQL 18 binaries as a normal user for native tests, or an explicitly selected Docker context. Real S3 tests need a private test bucket, never production storage.

```sh
npm ci --ignore-scripts
npm run check:boundaries
npm run build
PG_BIN=/path/to/postgresql/18/bin TEST_S3_CONFIG=/absolute/private/test-storage.json npm test
```

`TEST_S3_CONFIG` contains `endpoint`, `region`, `bucket`, `accessKeyId`, `secretAccessKey`. Keep it mode 0600 and outside source control. Tests create their own database/storage namespace and separate migration/API/worker roles, then remove only their resources. Skipped S3 cases mean the full gate has **not** passed.

Portable Docker mode (fresh PostgreSQL container; explicit context, no root `initdb`):

```sh
SPRINTIQUE_TEST_DOCKER=1 SPRINTIQUE_DOCKER_CONTEXT=your-isolated-context TEST_S3_CONFIG=/absolute/private/test-storage.json npm test
```

From the original repository root, `node scripts/verify-vnext.mjs` additionally builds/packs/tests the DS, verifies the public boundary and copies **only** this product to a clean directory for a fresh install/build/test. The product remains independently testable without that root script.

`npm run preview:fixture` is a disposable synthetic-auth test entry, not compiled into `npm start`. Do not expose it to a network.

## Local reference stack

PostgreSQL 18.6, Garage 2.3.0 and Keycloak 26.7.3 are pinned by image digests in local scripts. They use loopback ports, an explicitly selected Docker context, owned resource labels and private ignored `output/infra/` configuration. Scripts refuse unrelated containers/volumes and never start/restart the user's default Docker VM.

```sh
SPRINTIQUE_DOCKER_CONTEXT=your-isolated-context npm run local:storage
SPRINTIQUE_DOCKER_CONTEXT=your-isolated-context npm run local:identity
npm run build
npm run local:start
```

API: `http://localhost:4312`; issuer: `https://localhost:9443/realms/sprintique`. The local CA is process-scoped, not installed in system trust. A browser may require explicit trust for the provider certificate. The provider check verifies TLS with that CA and performs a real authorization-code login; it does not bypass OIDC checks.

See [operations](docs/operations.md) for runtime configuration, worker/container, private evidence and restore procedures. Credentials and backups must never enter a PR or source archive.

## Contracts and reliability

Prefix `/api/v1`. `/openapi.json` is an OpenAPI 3.1 route inventory with code-owned request schemas and explicit Planning response contracts. `/api/v1/contracts` exposes runtime schemas. Some non-Planning responses are marked `x-response-schema: see-resource-contract`; do not claim fully generated SDK coverage for the whole platform.

Task/Planning/map/media/catalog commands use `Idempotency-Key` and/or `baseRevision` as declared in OpenAPI. Changed bodies under the same key conflict. Planning has durable receipts and a browser write-ahead journal. Profile/member CAS changes reject stale revisions; once-only secret issuance and identity bootstrap calls are not automatically retried. Approval binds an exact prepared plan and is not execution itself.

Live project-scoped authorization is enforced in use cases and PostgreSQL RLS. Workspace administration does not implicitly grant every project's content. Sessions enforce Origin/CSRF; agents enforce project capabilities and expiry. Startup rejects superuser, BYPASSRLS and business-table-owner runtime connections. Transactional outbox events feed authorized SSE/pull; **external notification delivery is not configured**.

## Explicit limits and release boundary

- Planning mutations use a conservative project-wide revision fence/serialized transaction; no unlimited-scale or finer task-level ACL claim.
- Planning pages 100; explicit selections 200 (server snapshots support larger operations); legacy task pages 200; catalogs 500; thread pages 50; full thread messages capped at 2,000.
- Files 10 MiB; images 40 megapixels and two decoder slots; private re-encoded variants. No video covers or antivirus claim. Media quota 5 GiB/project, 100 pending assets/actor.
- Maps: 600 objects / 1,600 connections. Agent context: 20 tasks / 100 objects / 64 KiB; runs/proposals have explicit budgets and expiry.
- Rate/concurrency/stream limits are per API process. Horizontal deployment needs shared gateway/limits. Metrics are bounded process aggregates, not distributed tracing.
- Restore verification covers both databases and referenced private objects. It is a local consistency drill, not production RPO/RTO or encrypted off-site backup.
- Independent security audit, exhaustive accessibility/browser coverage, external pilot, SMTP/notifications, distributed tracing and MCP/provider execution are not claimed. GitHub CI is defined but cannot be called remotely passed without a pushed run.

Keep the existing platform/data untouched. Deployment, provider accounts, secret provisioning, publication and migration need their own authorized release step.
