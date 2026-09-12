# vNext Planning R2 checkpoint — 2026-09-12

Owner approved architecture r1 and the current repository with a detachable product subtree. Branch `feature/sprintique-vnext`, based on main `f3dd146cc9c7c0544fd663d632704a210a5c13be`. PR #2 is merged and must not be reused. No push/deploy/public package authorization for this new change.

## Actual delivery

Independent `libraries/iquipage` and `products/sprintique`; consumed DS 0.6.0-vnext.1. Foundation commit `a47c25fe9741f7c0e46661bd0fb31633ed6ef1c8`. Node 24 / Fastify / PostgreSQL 18 backend plus adapter for the approved board. Tasks, Markdown descriptions, hierarchy, tags/releases, discussions/resolution, principal/session/agent permissions, revision CAS, idempotency and transactionally persisted audit/outbox.

Planning R2 adds separate preparation/work/result/admission, Release lifecycle and inherited assignment, atomic preview/commit/receipts, close/cancel remainder and immutable history, milestones/date-only constraints, generic human approval for agent plans, static command/response schemas and typed SDK. The existing board consumes compact server-owned eligibility, hydrates detail safely, uses a dedicated position command and receives authorized project events; discussions refresh across tabs. Read PLANNING-R2.md for C-01…C-09 and `products/sprintique/docs/planning-r2.md` for the consumer contract.

41 PostgreSQL/API tests, 209 DS tests, strict build, public-type/boundary tests and detached clean install/build/41 tests passed. Tests cover real OIDC crypto/claims against an in-process provider transport, not a production provider account. Chromium synthetic task/discussion/reload, two-tab updates and delayed-response revocation flows passed. Light/dark 1280×720 and 390×844 screenshots inspected. UI/watch sources are unchanged after browser checks; additive SDK/read-schema changes have their own final live API test. This is partial self-review, not independent review or the full M0–M7 acceptance matrix.

## Artifacts and limits

`STATUS.md`, `FINDINGS.md`, `fix-ledger.csv`, `GAPS.md`, `run-state.json` contain current implementation evidence and remaining scope. `assessment.json` and `acceptance-plan.pending.json` are explicitly unapproved full-task acceptance scaffolds for later parity; their NOT_RUN states do not erase the actual partial checks listed in STATUS. They must not be presented as READY.

Raw logs/source manifest: `products/sprintique/output/verification/2026-09-12T01-01-03.146Z`. Browser observations: `products/sprintique/.playwright-cli`. These local evidence folders are excluded from source control and included in the user-facing delivery separately without session tokens. Temporary browser/DB fixtures were stopped after QA; no persistent demo login was added.

DS tar SHA256 `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`. Source fingerprint (code/build inputs, manifest in raw evidence): `3a8dbc3b97933b149917065739600b064c039f00d3e3fd3b0e56365f9b5db947`.

## Next implementation point

The attached handoff did not include Planning frontend code, its branch/commit or ACCEPTANCE-R2.md. The backend scenario create → prepare → assign → start → board → second authorized client passes; the other frontend cannot be labelled INTEGRATED_PASS yet. Obtain those inputs, connect its preview/approval/receipt-recovery UI through the SDK and run its consumer acceptance suite. Existing editor parent/release changes deliberately require Planning; confirmation integration remains open, not a working direct PUT flow.

M4–M7 remain separate: versioned maps, private media, custom templates/settings/links/search/membership, external outbox delivery, general agent-run lifecycle/MCP, full OpenAPI, performance/security/load/backups/CI and external pilot. Project-level ACL and a serialized in-memory Planning graph are current constraints; no task-level ACL or unlimited-scale claim. Optional import is deferred. Do not migrate or delete old-platform data, substitute mock persistence or rewrite the DS.

Use product README for build/test/migration setup. `scripts/verify-vnext.mjs` reruns all current checks and detached extraction. Keep concrete identity provider/hosting/storage choices open until owner supplies D3; do not block local feature development on those future deployment choices.
