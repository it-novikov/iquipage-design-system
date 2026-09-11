# Sprintique vNext — execution record

Approved 2026-09-12: use this repository for Sprintique, structurally independent from the design system so the complete product can later move to another repository. Architecture r1 otherwise approved. Base main: f3dd146cc9c7c0544fd663d632704a210a5c13be. Working branch: feature/sprintique-vnext.

## Boundaries

- `libraries/iquipage`: source-owned UI library with its own build, package and types.
- `products/sprintique`: self-contained product, dependencies/lockfile, frontend, API, tests, migrations and operations.
- The product consumes an explicit packed `@iquipage/web` release inside its own vendor directory. No parent-relative library source dependency, no root-only install requirement.
- The existing pinned `design-system/` and historical `packages/maps` remain unchanged reference material. New product runtime must not load them.
- No migration of existing users/data, production access, publication, push or deploy is authorized by this implementation step.

## Acceptance registered before implementation

1. Library: standalone build/pack, public exports and typecheck, no product dependency, provenance hash.
2. Extraction: copy only `products/sprintique` to a fresh directory; clean install, strict typecheck/build and tests still work, consuming the packed library.
3. API: authenticated principal, tenant/project checks, no reference-user fallback, fresh PostgreSQL schema, forbidden cross-tenant read/write/search.
4. Concurrency: compare-and-set, parallel duplicate idempotency, changed request conflict, canonical task number, transactionally recorded audit/outbox.
5. Frontend: existing board and task view against new API; task create/edit/reload; discussion create/decision/retry; no dependency on the old platform.
6. Human/agent: typed actor, narrowed grant, expiry/revocation; proposal/version/approval kept separate from execution.
7. Failures: invalid input, unavailable DB, stale version, failed delivery, restart, no silent in-memory fallback.
8. UI extraction: same DS/runtime/CSS, light/dark and narrow viewport; preserve draft, selection, covers and task navigation.

Full approved roadmap remains M0–M7 in the architecture brief. Partial foundation completion must not be labelled full platform readiness. Every unimplemented surface remains explicit in the final status.

## Current status

- M0: repository and architecture approved; fresh main isolated; pinned DS integrity PASS (297 files).
- M1: implemented. Standalone DS 0.6.0-vnext.1, public-type consumer check, separate product install/build. Detached clean install/build and PostgreSQL test suite PASS.
- M2/M3: first authenticated task/discussion slice implemented and exercised. Real PostgreSQL 18, OIDC PKCE/state/nonce/signature tests, session CSRF, tenant RLS, actor/initiator policy, CAS, idempotency, atomic audit/outbox. This is not complete identity/platform or frontend parity.
- M4–M7: remain open. Maps/files/custom templates/task links/search, memberships, outbox dispatcher/SSE, agent proposals/execution/approval, complete OpenAPI, quotas/rate limits, load/security/backup/CI and external pilot remain unimplemented or unaccepted.
- Existing local artifacts and old platform data are preserved.

## Verified first-slice results

- Node v24.20.0, PostgreSQL 18 isolated Unix-socket test clusters; no existing database connections.
- 209 library tests, 19 API/integration tests: PASS.
- TypeScript strict, Vite build, boundary scan and detached clean install/build/19 tests: PASS.
- Browser: Chromium, synthetic authenticated account; create task with Markdown checklists, canonical SPR-2, open by card, URL/deep-link reload; publish decision thread, resolve, reload persisted state: PASS.
- Preview -> edit by content click; select all 63 characters and move pointer outside (selection 63/63, still editing); outside click -> preview: PASS.
- Screenshots manually inspected: 1440x900 light/dark; 390x844 dark task drawer. Narrow document/dialog width both 390, no horizontal overflow. Full responsive/theme/accessibility matrix remains NOT_RUN.
- Final reloaded browser console: 0 errors / 0 warnings. Earlier expected 404 read-before-thread-create is not a JavaScript crash.
- Initial JS split from 1.82 MB into ~628 KB initial chunks plus deferred ~1.19 MB illustration picker. Lazy illustration chunk still exceeds Vite advisory threshold; full performance budget pending.
- Verification logs: `products/sprintique/output/verification/2026-09-11T23-38-36.463Z/`; source fingerprint `405fe7ffae6d02c1e0fd5f2e2cb8bfd72405d561d62030de366a121ce94149d4`.
- Packed DS SHA256: `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`.
- Git whitespace check passes for new product/scripts/docs. Imported upstream DS modules retain their original extra blank line at EOF (Git reports these as warnings on initial addition); no runtime/source rewrite was performed to hide that provenance-only formatting difference.

## Review and next working point

Targeted implementation self-review, not independent/full-integration acceptance. F01/F02/F03/F04/F05/F07/F08/F09 repaired and checked by the specific build/API/browser/public-type checks in FINDINGS.md. F06 initial load addressed; full runtime performance not accepted. No DS source redesign, old snapshot mutation or production operation.

Next: complete M4 using the new API/application boundary—versioned maps first, then private media, template settings and explicit task-link commands. Preserve the current frontend and library boundary. After that implement outbox dispatcher/SSE and agent proposal lifecycle. Before external pilot, owner must supply the identity/hosting/storage choices (D3); no provider choice is silently inferred.
