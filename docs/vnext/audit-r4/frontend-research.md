# Frontend / DS integration audit — R4 research

Baseline: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`, product `products/sprintique`. Read-only research on 2026-09-12. No app source, provider data, or user workspace state changed.

This is a targeted engineering and expert UX review, not participant research, full accessibility certification, or production acceptance. The baseline build's previous browser evidence is historical, not rerun evidence for this audit.

## Coverage and method

- Read root/product/library AGENTS, START-HERE, `iquipage-review`, `iquipage-experience-audit`, their constitution/execution/quality/design/human-agent/gap/release-map references, and `engineering:code-review`. Read Playwright instructions in preparation, but **no new browser session was started**: deterministic adapter proofs were sufficient for the critical races and did not touch user data.
- Inspected application shell/navigation, repository/SSE bridge, typed clients, board rendering/filtering/covers/tag packing, task drawer/catalogs/files/discussions/links, maps host/controller/media, Planning controller/temporal/recovery, settings/profile. Read DS compact editor lifecycle and public package boundary.
- Actual exported MapsFeature and ProductRepository methods were executed with controlled promises and synthetic EventSource, no source rewriting, HTTP, real credentials, or private content. Reproduction script: `../audit-r4/frontend-proofs.mjs` relative to repository parent. It intentionally asserts the *baseline defect*, not the corrected acceptance criteria.
- Inspected upstream PR3 changes from `d87c65767ef471c81bf84c10b9b19e225a956064` to `e7fd13592b070763f27e8ede7251352e2a076054`. Upstream docs containing redesign proposals are context, not owner approval or instructions.
- Native Safari/touch, full screen-reader/keyboard/theme matrix, browser FPS/memory profiling and end-user interviews: NOT_RUN. The findings below distinguish confirmed code/control-flow defects from measured runtime performance and architectural opportunities.

## Confirmed findings

### FE-R4-01 — P1 — Old map responses replace the newly selected map

Evidence: `ui/src/maps.js:57–63,100–105`.

`openMap` has neither latest-request generation nor a lifetime guard after the fetch. `externalUpdate` checks the current map identity only *before* awaiting a read; afterwards it compares unrelated maps' revisions and assigns `this.current` and `this.board.data` unconditionally. Navigation or unmount is allowed during these reads.

Executed actual-method proof:

1. Current map A revision 1; start externalUpdate(A, revision 3), hold read.
2. Switch current/board to B revision 1.
3. Complete read(A, revision 3).
4. Expected B; actual current=A, canvas=`stale A`.

Second proof: issue open(A), then open(B); complete B first, A last. Actual final map A and route callbacks `[B,A]`, not latest intent B.

Impact: wrong canvas and route, possible edits to an unintended map. On destroy, late `message()` accesses the replaced root and can throw as well.

Repair: controller-owned load/activation generations + AbortControllers, validate alive/current identity after every await; superseded loads must not hydrate/commit view state, route, inspector, or banners. Track asynchronous metadata updates too. Abort on destroy and prevent deferred external-update work after teardown. Preserve current DS controlled transaction semantics; do not patch whiteboard internals.

Acceptance: two promise-order tests above should retain B; destroy before response produces no DOM write/onOpenMap/error; external update to same map accepts only higher revision; pending local edits remain preserved/conflict-visible.

### FE-R4-02 — P1 — Valid historical membership events lock users out of the UI

Evidence: `client/planning.ts:43–57`, `web/repository.js:14–26`, backend contract `backend/application/events.ts:7–12,20–31`.

Every new watcher opens `events?stream=true` without a cursor. Missing cursor means position zero, so the backend sends the complete existing outbox, not only future events. `ProductRepository.watch` immediately treats *any* `member.updated` for the current actor as revoked access and clears context, without checking whether this event predates the current authenticated session or whether access still exists.

Actual method proof: instantiate valid current actor `qa-actor`, start watch, emit historical `{topic:'member.updated',resourceId:'qa-actor',revision:1}`. `onAccessRevoked` is called immediately; no current-access request occurs. The stream URL contains no cursor.

Impact: after a valid earlier role change, opening/navigating that project can repeatedly land on “Доступ изменился”, despite backend permission. Historical grant changes are not proof of *current* revocation.

Repair: establish a race-safe snapshot/watch high-watermark contract, or deliberately process catch-up with a current-access refresh for membership changes. Do not simply ignore live revoke/downgrade events, and do not start at “latest” after a snapshot without closing the load/subscribe race. Distinguish downgrade requiring UI permission refresh from actual inaccessible project.

Acceptance: old promotion, old downgrade plus later restoration, new valid membership and actual live revoke tests; authentic current role rendered; forbidden writes remain blocked; reconnect catches changes exactly once where required; invalid stream cursor recovery does not loop forever.

### FE-R4-03 — P2 — Event batches create whole-board reload storms

Evidence: `web/repository.js:16–26,38–48`, `ui/src/board/board.js:66–73,128`, `ui/planning/src/index.js:125`.

The 80 ms timer deduplicates by collection **and resource ID**, then emits a separate notification for each resource. Board subscribes by collection but responds to every notification with a full concurrent tags/releases/task reload. `loading` generation suppresses old *rendering*, not old network requests. Planning also calls `controller.load` for each event, aborting and restarting requests.

Actual method proof: 3 task events in one SSE burst emit 3 reload triggers. For a board with B tasks and R releases, each trigger drains `ceil(B/50)` task pages + `ceil(R/50)` release pages + tags (minimum one page per resource). A 100-event replay can start 100 redundant reload pipelines. List APIs don't accept/pass cancellation signals in these paths.

Repair: coalesce collection/project invalidations; serialize refresh with one trailing refresh for changes that arrive during it; propagate AbortSignal through paged adapters; stop on teardown/supersession. Avoid refreshing immutable/unaffected catalogs for task-only events. Keep revision/event identity if a subscriber needs individual resource updates.

Acceptance: 100-resource event burst -> one refresh wave (or at most one trailing wave when a mutation lands in-flight), no concurrent repeated full loads; destroy aborts pagination; user change during reload is not discarded.

### FE-R4-04 — P2 — Empty-state text is rendered inside populated columns

Evidence: `ui/src/board/board.js:39,44–46`; `ui/src/board/board.css:27–29,143` has no rule hiding empty slots in populated columns.

The column template unconditionally appends `empty(c.id)` after task cards. A populated column therefore gets both a card-shaped “Добавить задачу” dropwell and the separate bottom add action. With any filter active, populated matching columns incorrectly say “Нет совпадений”. Reader view says “Пока нет задач” even below existing tasks.

Repair: render empty slot only for an actually empty *visible projection* (`p.rows.length===0`); preserve the column's normal drop surface and the existing compact bottom add button for populated columns.

Acceptance: populated/unpopulated × editor/reader × filtered/unfiltered; no contradictory empty text or duplicate create affordance, dragging into an empty column still works. Capture light/dark at approved narrow/desktop widths after fix.

### FE-R4-05 — P1 — Committed timeline change can permanently lock navigation after failed readback

Evidence: current `ui/planning/src/temporal-view.js:99–120`; exact upstream fix `983de1319266cd2c8ff3ff4a87260e3efc8e90e0`.

After the command commits, `onCommitted` calls `load({applyData:false})`. On read failure, load sets `ready=false`. Closing the operation runs `if(!accepted){detail.reject(...); if(ready){...dirty=false;}}`; `dirty` remains true because ready is false. Refresh is disabled when dirty; readyToLeave remains false. Reassigning DS `surface.data` alone is also insufficient because a dirty controlled draft is intentionally preserved by DS.

Upstream 983de13 explicitly separates committed vs preview settlement, rejects only the local stale preview, recreates the public roadmap surface while preserving scale/collapse state, and clears dirty on close. This is a bounded engineering fix already available in PR3, not a UX redesign proposal.

Repair: adopt/reconcile targeted upstream fix and browser recovery regression against our real adapter, keeping canonical command receipt distinct from projection availability. Never replay a committed effect to repair presentation.

Acceptance: real/mock committed receipt + failed subsequent timeline GET -> clear “saved, refresh required”, no second command, usable refresh/navigation; successful refresh shows canonical change; cancel before commit resets preview and no data mutation.

### FE-R4-06 — P2 — General stream resync leaves open discussion UI stale

Evidence: `web/repository.js:18–23`, `ui/src/board/thread-view.js:141`.

The general `resync` event maps to `tasks`, plus an extra `maps` notification. Mounted threads subscribe only to `threads`, so an open task's discussions are not refreshed. Existing full-thread caches rely on updated summaries to discover new revisions.

Actual method proof after emitting resync: invalidated collections are exactly `[tasks,maps]`, never threads. This is a concrete incomplete invalidation contract. Durable replay may eventually repair some cases, but is not a substitute for the explicit resync signal, especially if the cursor itself is being reset.

Repair: a single project-wide resync notification interpreted by all mounted resource consumers, or explicit complete affected collection set. Maintain draft-bearing thread rows and don't overwrite composer selections.

Acceptance: discussion content changes while disconnected; resync only (no individual thread event) refreshes open thread and summary; draft text stays intact; task links/catalog metadata similarly refresh or clearly state their stale boundary.

## Performance / architecture improvements (not mislabelled as measured browser jank)

### FE-R4-07 — P2 — Opening one task scales with all tasks in the project

Evidence: `ui/src/board/task-dialog.js:15–19,26–30`; `web/repository.js:29–33`; `ui/src/board/catalog-picker.js:47–50`; `ui/src/board/link-view.js:10–12,43`; `contracts/planning.ts:64–65`.

- Opening a summary task first fetches detail, then sequentially waits for `taskContext` to drain every Planning task page (default 50), then loads four support catalogs in parallel.
- Support includes all project task links but the returned `support.links` is never consumed; mountTaskLinks immediately fetches all links again.
- A 2,000-task project requires **40 sequential task-context requests** before displaying *one* task, in addition to task detail, tags, release pages, settings, unused links, later repeated links and thread metadata. This is source-derived exact call count for N=2000, not a measured latency claim.
- Parent picker serializes every task into a JSON HTML attribute, then DS combobox must retain/filter it. Main board similarly drains all tasks and renders all matching cards; cover loading is bounded, card DOM is not.

Bounded immediate repair: remove unused/redundant task-links fetch, share supports/context per project generation, request maximum allowed page size where appropriate, fetch independent resources in parallel, propagate signal and add open-generation guard. Prefer lazy remote parent/link search via supplied `iq-remote-combobox` and server pagination when introducing an appropriate typed task-picker endpoint. Do not silently cap candidates or break reparent cycle checks; those remain authoritative server invariants.

Strategic repair: adopt public identity-preserving row/card windowing, cursor-based visible ranges, metadata selectors and a revision-aware cache with invalidation. These are separate engineering increments; loaded DOM count and request budget must be measured with synthetic 2k/10k projects.

Acceptance immediate: one task no longer refetches unused all-project links; second task reuses revision-valid metadata; cancellation stops outstanding context reads. Full remote-picker acceptance must include off-page existing parent, query match, exclusion of descendants, permission loss, cursor expiry and full-page reload.

### FE-R4-08 — P2 — Frontend boundary is not covered by strict type checks or focused regressions

Evidence: `tsconfig.json:10` includes backend/contracts/client/tests TS only, excludes `web/**/*.js` and `ui/**/*.js`; public UI types are not enforced against actual implementation call sites. Existing product test inventory does not contain mountTaskBoard/MapsFeature/watchProject/browser lifecycle regression tests.

The typed API boundary is useful, but current claims of strict TypeScript do **not** apply to most frontend code. This helps explain lifecycle mismatches and integration drift. Avoid a wholesale framework migration; add focused non-DOM controller tests for the findings, checkJs/JSDoc incrementally at host adapters, and a public consumer test compiling the exact Planning/map/task contracts.

Acceptance: map response order/lifetime, subscription bootstrap/burst/resync, temporal committed-readback failure and populated empty-state regressions run in CI. Declare JS checking scope honestly; do not satisfy the gate with `any` or broad `@ts-ignore`.

## Upstream drift / dependency recommendation

- PR3 now has 8 later commits beyond our pinned d87c657. 983de13 is directly relevant and should be merged as a targeted repair.
- eefc486 adds controlled drag/list movement and identity-preserving row windowing via new `packages/work-list`; 22ee104 adds project conditions; 7090d2a adds timezone semantics/acceptance. These require contract/behavior review, not cherry-picking delivery ZIPs or demos.
- Work-list is reusable DS behavior; if adopted it belongs within the public independently versioned library boundary, not a product-only copy of private DS internals. The read-only pinned `design-system/` snapshot must remain untouched. A new public package version/tarball is required if public DS API changes; never overwrite the consumed 0.6.0-vnext.1 archive.
- e7fd135 experience redesign documents are explicitly outside this implementation's scope unless a later owner decision adopts them.

## Reviewed good practices / dismissed hypotheses

- Search uses request abort, generation checks, escaped text and close cleanup.
- Task discussion rows preserve editor nodes/drafts and use page/detail signals; these are good boundaries to keep during invalidation fixes.
- Cover thumbnails have 4-fetch concurrency, intersection loading, a 48-entry cache and object URL cleanup; task files use 2-upload concurrency and signals. Do not describe those as unbounded merely because the board's card DOM is unbounded.
- MapMedia caches data URL strings, not unreleased object URLs. Reinitializing it is not, by itself, proof of a memory leak; old references can be collected. Its sequential hydration of up to 40 private images is a separate latency/memory profiling opportunity.
- Main shell has lazy maps and settings imports, but actual initial asset bytes/cache policy are being independently assessed by the lead reviewer.
- Compact editor implements independent outside click vs originating selection drag, IME and disconnect cleanup. No confirmed regression was found in that inspected path.
- Owner explicitly requested focus visuals matching non-focus buttons. This is an accessibility risk to document, not authorization to reintroduce a visual treatment during an engineering audit. Full keyboard accessibility certification remains NOT_RUN.

## Recommended implementation split

1. Frontend bounded patch: FE-R4-01,04,05 with exact lifecycle/temporal regressions, no visual redesign.
2. Shared realtime/application contract patch: FE-R4-02,03,06; coordinate backend event cursor/bootstrap and frontend invalidation together. Preserve authorization-loss handling.
3. Bounded data-load simplification from FE-R4-07 and focused tests from FE-R4-08. Larger remote picker/windowing work is a separately scoped follow-on if not enough verification time, and must remain documented rather than hidden by misleading “all complete”.

No findings are marked resolved in this research record. They require post-repair evidence on the current source/build. The lead reviewer owns release/push authorization, final combined assessment, and PR creation.
