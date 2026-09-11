# vNext foundation checkpoint — 2026-09-12

Owner approved architecture r1 and the current repository with a detachable product subtree. Branch `feature/sprintique-vnext`, based on main `f3dd146cc9c7c0544fd663d632704a210a5c13be`. PR #2 is merged and must not be reused. No push/deploy/public package authorization for this new change.

## Actual delivery

Independent `libraries/iquipage` and `products/sprintique`; consumed DS 0.6.0-vnext.1. New Node 24 / Fastify / PostgreSQL 18 backend plus adapter for the approved board. Tasks, Markdown descriptions, hierarchy, tags/releases, discussions/resolution, principal/session/agent permissions, revision CAS, idempotency and transactionally persisted audit/outbox.

19 PostgreSQL/API tests, 209 DS tests, strict build, public-type/boundary tests and detached clean install/build/tests passed. Tests cover real OIDC crypto/claims against an in-process provider transport, not a production provider account. Chromium synthetic task/discussion/reload and editor-selection flows passed. Screenshots inspected in light/dark at 1440x900 and dark at 390x844. This is partial self-review, not independent review or the full M0–M7 acceptance matrix.

## Artifacts and limits

`STATUS.md`, `FINDINGS.md`, `fix-ledger.csv`, `GAPS.md`, `run-state.json` contain current implementation evidence and remaining scope. `assessment.json` and `acceptance-plan.pending.json` are explicitly unapproved full-task acceptance scaffolds for later parity; their NOT_RUN states do not erase the actual partial checks listed in STATUS. They must not be presented as READY.

Raw logs/source manifest: `products/sprintique/output/verification/2026-09-11T23-38-36.463Z`. Browser observations: `products/sprintique/.playwright-cli`. These local evidence folders are excluded from source control and included in the user-facing delivery separately. Temporary browser/DB fixture was stopped after QA; no persistent demo login was added.

DS tar SHA256 `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`. Source fingerprint (code/build inputs, manifest in raw evidence): `405fe7ffae6d02c1e0fd5f2e2cb8bfd72405d561d62030de366a121ce94149d4`.

## Next implementation point

Proceed with M4: versioned map documents and host adapter using existing map UI; private-media upload/read/crop integration; project template persistence; typed links and search. Then outbox dispatch/SSE and agent proposals/approval/execution. Do not migrate or delete old-platform data. Do not substitute reference-user/MemoryRepository for missing production features.

Use product README for build/test/migration setup. `scripts/verify-vnext.mjs` reruns all current checks and detached extraction. Keep concrete identity provider/hosting/storage choices open until owner supplies D3; do not block local feature development on those future deployment choices.
