# Sprintique vNext

Self-contained product for a clean major launch. Authenticated board/discussions plus the Planning R2 backend/SDK are implemented; **not complete platform parity or a production release**. Planning consumer integration is documented in [docs/planning-r2.md](docs/planning-r2.md).

## Independence

Copy this entire directory to another Git repository. No parent workspace, DS source tree or root install is required. `vendor/iquipage-web-0.6.0-vnext.1.tgz` is an explicit private DS release, verified by `package-lock.json`. It can later be replaced by the same version from an authorized package registry. The server never imports DS or the browser domain model.

```
backend/domain          Errors and domain invariants
backend/application     Task, discussion, identity and Planning commands
backend/infrastructure  PostgreSQL, principal and authorization context
backend/http            HTTP and OIDC adapters
contracts               Static command schemas and transport types
client                  Typed HTTP client
web                     Product host and existing-UI adapter
ui                      Approved frontend source (vanilla ESM + Web Components)
migrations              Fresh schema; separate migration owner
tests                   Real PostgreSQL tests, synthetic browser fixture
vendor                  Explicit library release
```

## Build and tests

Requirements: Node 24, npm, PostgreSQL 18 binaries for integration tests.

```sh
npm ci --ignore-scripts
npm run check:boundaries
npm run build
PG_BIN=/path/to/postgresql/18/bin npm test
```

Tests create their own temporary Unix-socket-only PostgreSQL cluster, migration owner and restricted runtime role, then stop and remove only that cluster. They never use an existing database. Local default `PG_BIN` is the Homebrew PostgreSQL 18 directory; override it on Linux. The test harness must run as a normal user, not root.

`npm run preview:fixture` starts a synthetic authenticated board at localhost:4311 and prints the path of a temporary browser storage-state file, never the token. Use Playwright CLI `state-load` on that file, then reload. Ctrl+C tears down the fixture. This test entry is not part of `npm start` or the compiled server; no reference login exists in production.

## Fresh deployment preparation (not executed)

Provision a new PostgreSQL database owned by a migration role. Provision a separate LOGIN NOSUPERUSER NOBYPASSRLS runtime role. Do not point this application or migration command at an old-platform database.

Supply `MIGRATION_DATABASE_URL` and `DATABASE_RUNTIME_ROLE`, then run `npm run migrate`. Applied migration checksums are immutable. API startup rejects a superuser, BYPASSRLS or business-table-owner connection.

Runtime environment: `DATABASE_URL`, `PUBLIC_ORIGIN` (origin only, no trailing slash), `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`; optional `PORT=4311`, `HOST=127.0.0.1`. Secrets must be injected by the environment/secret manager, not committed. Register `PUBLIC_ORIGIN/auth/callback` at the provider. HTTPS is mandatory outside loopback. OIDC issuer must use HTTPS; code+PKCE, state, nonce, audience and ID-token signature checks are enforced. Browser sessions use HttpOnly Secure SameSite cookies plus Origin/CSRF checks. API does not trust forwarded headers by default; TLS termination requires an explicit deployment review.

Build, then `npm start`. `/health` is liveness; `/ready` checks the runtime role and migration ledger access. Configure readiness before exposing traffic. Identity provider, TLS ingress, quotas, rate limiting, backup/restore, metrics, S3 and external pilot configuration are still outstanding. Do not expose this alpha directly to the Internet.

## Implemented API

Prefix `/api/v1`. Session/workspaces/projects, project-scoped tasks, tags, releases, task discussions, append-only messages, resolution state and restricted agent credentials. Mutations to tasks/discussions/catalogs require `Idempotency-Key`; retries with a different payload conflict. Task updates require `baseRevision`, return the canonical `displayId` and revision. Client-generated opaque resource IDs are distinct from human-readable server-allocated task keys.

Human and agent identities are distinct. Agent grants last at most 24 hours, are project-bound, have explicit capabilities, record their human initiator and are checked for expiry/revocation on every request. Grant issuance returns its token once and does not log/store the plaintext token. Planning agent proposals use a generic action-bound human approval record; a decision is not execution. The token is not an MCP OAuth token; MCP/OAuth transport and general agent-run orchestration are not implemented yet.

Planning adds separate task preparation/result/admission, inherited release membership, atomic preview/commit, close/cancel with explicit remainder, immutable history, milestones, temporal constraints and compact cursor-paged projections. Same Task records and Markdown documents serve Planning and the board. `/api/v1/contracts` exposes version 2 command/response JSON schemas; this is not complete platform OpenAPI.

## Explicit remaining scope

- Maps and agent-session UI integration, versioned documents and concurrency.
- S3/private uploads, processing/quarantine, avatars, covers and orphan cleanup.
- Custom template persistence, non-parent task links, membership management, workspace-wide search.
- External outbox dispatcher, notification delivery retries/dead-letter handling. Authorized durable project SSE with reconnect/revocation is implemented.
- General agent execution/cancellation and future MCP adapter; Planning approval/command application is implemented.
- Complete platform OpenAPI, message-level pagination; current transport limits: Planning pages 100 and explicit selection 200 (server selectors have no release-size product cap), legacy task pages 200, legacy catalog values 500 and 2,000 messages per thread. The board now uses paged Planning projections and no longer imposes a 10,000-task adapter cap.
- The external Planning frontend and its ACCEPTANCE-R2 appendix were not supplied. Its action confirmation flow still needs integration. The existing task editor cannot directly change release/parent via ordinary PUT; use Planning preview/commit as documented, not a client-side PATCH loop.
- All identity/platform mutations need durable retry/audit policy before pilot. Project creation has uniqueness protection; workspace/credential creation are not safely replayable commands and SDK does not automatically retry them.
- Full-browser regression, performance, security/load review, backups and CI release gates.

The outbox is persisted transactionally and feeds authorized project changes over SSE. It is **not delivered to external notification systems**; SSE does not mark external delivery success. Existing approved UI is retained, with explicit disabled capabilities for unavailable services; the original platform remains separately runnable and unchanged.
