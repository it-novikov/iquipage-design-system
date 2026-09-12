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
- Planning R2 backend/SDK: implemented on the same kernel; see PLANNING-R2.md and product docs/planning-r2.md. Static contracts, atomic prepared plans, hierarchy/close history, dates/constraints, generic agent approvals and authorized outbox-backed SSE are verified. External Planning UI integration is not accepted without its source revision and ACCEPTANCE-R2.md.
- M4–M7: remain open. Maps/files/custom templates/task links/search, memberships, external outbox dispatcher, general agent execution, complete platform OpenAPI, quotas/rate limits, load/security/backup/CI and external pilot remain unimplemented or unaccepted.
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

## Planning R2 checkpoint — 2026-09-12

- Original P01–P11 covered by 22 Planning tests alongside 19 foundation tests: **41 API tests PASS**. Additional P12 durable events/revocation/commit-order and P13 live SDK/response-schema coverage was added during implementation; it is not misrepresented as a separately approved full-platform test plan.
- **209 library tests PASS**, strict product build, public boundary checks and detached clean install/build/41 PostgreSQL tests PASS. DS package bytes unchanged. Final verification `products/sprintique/output/verification/2026-09-12T01-01-03.146Z`; source fingerprint `3a8dbc3b97933b149917065739600b064c039f00d3e3fd3b0e56365f9b5db947`.
- Tested whole-release operation on 206 tasks beyond the explicit request limit of 200; effects paginate 100/100/6. This is not production load acceptance.
- Browser: full task hydration preserves Markdown; create/save/reopen/reload via SPR-2; publish discussion and observe another tab without manual refresh. Light/dark 1280×720 and narrow 390×844 inspected; document width remains 390. Final delayed-tags-response + session revocation scenario clears the board and does not reopen a protected dialog. Synthetic preview and its temporary PostgreSQL fixture were stopped cleanly.
- Browser interaction checks used fingerprint `636e05cf860f9eadd49c40b467b991ac86487b8b8471a3ee2074e43cd2d100b9` before additive SDK/read-response schemas and event correlation/causation fields; board/dialog/watch implementation is unchanged. The additions were checked by the 41-test final API/detached run. Full-browser parity remains NOT_RUN.
- Planning revision is a conservative project-wide fence. Project-level authorization is implemented; finer task-level ACL and distributed stream quotas are not claimed.
- Existing editor direct parent/release assignment now returns PREVIEW_REQUIRED; the external Planning confirmation flow still needs to be wired into that UI. No silent bypass or replacement frontend was built.

Next integration prerequisite: obtain the other agent's Planning branch/commit or source path plus ACCEPTANCE-R2.md, connect its UI to the versioned SDK and execute the consumer suite. Remaining independent roadmap is M4 versioned maps/private media/templates/links, followed by external worker/general agent execution and M7 release gates. Before external pilot, owner must supply identity/hosting/storage choices (D3); no provider choice is silently inferred.
