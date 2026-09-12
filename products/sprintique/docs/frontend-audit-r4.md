# R4 frontend engineering repairs

Research baseline: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`. This record covers targeted application integration fixes, not a redesign or full-platform accessibility certification. The pinned DS package/snapshot is unchanged.

## Repairs and regression evidence

| Finding | Repair | Verification |
| --- | --- | --- |
| FE-R4-01 | Map activation generation, cancelled read/lifetime fences, metadata response guards and teardown cleanup. Task drawer opening has matching cancellation/route fences. | Four actual MapsFeature tests. Chromium delayed open(A), cancel, open(B), then finish(A): B stays open, exactly one drawer, A returns false, URL QA-2. |
| FE-R4-02 | Durable `/events/head` is captured before view snapshots; watcher replays only from that watermark. Membership changes recheck current session. Unchanged effective role is not revocation; changed role shows guarded refresh preserving the draft; actual loss clears protected state. | Current-role, downgrade, loss and watermark client tests. Backend cursor/authorization tests are maintained separately. |
| FE-R4-03 | Per-collection event coalescing, serialized/trailing board reload, coalesced Planning refresh, cancellable pagination. | 100 synthetic events -> one collection notification. Actual mounted Chromium board: initial 3 reads, then 100 invalidations -> 3 additional reads, not 300. |
| FE-R4-04 | Empty slots render only when the visible column projection has no cards; populated columns retain one compact add action. | Actual editor and reader/filtered browser fixtures; filled column has no false “Нет совпадений”. Inspected light 1440×900 and dark 390×844 captures; document width remains390. |
| FE-R4-05 | Reconciled upstream `983de1319266cd2c8ff3ff4a87260e3efc8e90e0`: committed command/readback failure releases only the local preview, recreates the public roadmap surface and enables refresh/navigation. | Pure recovery lifecycle tests and actual DS roadmap preview/requestCommit fixture. After close animation: readyToLeave=true, refreshDisabled=false, commits=1. After refresh: canonical start=2026-09-13, commits still1. |
| FE-R4-06 | Resync invalidates every mounted resource family, including discussions and links. Links now subscribe and abort reads on teardown. | Resync collection-set/cancel tests; discussion draft-preserving renderer is retained. |
| FE-R4-07 | Independent task detail/context/support reads start together, unused support-links read removed, 100-row context pages, short-lived invalidation-aware defensive-copy cache, shared generation across scoped adapters. | 2,000 tasks ->20 requests on cold context and zero additional requests on valid cached read (previous40 each opening). Abort halts pagination; scoped invalidation forces refresh. |
| FE-R4-09 | Successful section navigation writes `#maps` when an empty Maps view emits no map-open callback; the canonical `#maps/<id>` selected during mount is preserved. Previously entering empty Maps from Planning left `#planning`, so reload restored the wrong section. | Pure route regression covers empty Maps entered from Planning/tasks/settings, unchanged Maps and a populated canonical map route. The lead's real-API empty-project walkthrough reproduced the original mismatch. |
| Backend accepted-result invariant | Accepted tasks omit Save/move. Discussion permission remains independent; immutable task content does not prohibit discussion. | Card open action remains, move menu absent, drag disabled. |

`tests/frontend-lifecycle.test.mjs` adds15 focused regressions. Together with the existing Planning controller/operation tests: **34 passed, no skips** in the targeted run. Build and TypeScript checks pass; these checks cover the configured backend/contracts/client TypeScript scope, not every JS UI implementation.

The browser fixture uses actual public DS components and application modules but synthetic in-memory adapters. `/api/**` requests are blocked. It does not touch user data or provide production/OIDC acceptance. Captures under ignored `output/playwright/r4-fe-*` were inspected. Four console entries are Vite HMR/WebSocket local-network test-harness failures, not application runtime exceptions; no blanket “console clean” claim is made. The first temporal observation occurred before the animated `iq-close` callback; the definitive repeat waited for host removal before measuring readiness.

## Explicit remaining improvements

- Full remote parent/link picker and visible-range board/windowing: not part of this bounded repair. Parent candidates are not silently capped; a cold task context still scales with project task count. Reusing the newer PR3 work-list package requires an independently versioned public library integration, not a private copy.
- The broad frontend is still JavaScript; focused tests and public declaration corrections do not amount to full strict checkJs/TypeScript conversion.
- Native Safari/touch, all role/theme/keyboard combinations, browser FPS/memory load profiling and full accessibility certification remain NOT_RUN here. Owner-approved focus styling was not changed during the engineering audit.
- Later PR3 UX redesign proposals were not adopted. Source provenance records only the targeted temporal recovery fix; demo repositories and delivery archives were not imported.

No source commit, push, package publication or deployment is performed by this frontend subtask. Final combined source fingerprint, complete tests and PR delivery belong to the lead integration gate.
