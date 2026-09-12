# Sprintique R4: backend correctness, performance and architecture audit

Baseline: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`. Read-only research by the backend specialist; source code was not edited. Reproductions use an independently initialized PostgreSQL 18 cluster on a private Unix socket, removed in `finally`. Existing QA/production databases and object stores were not accessed. `engineering:code-review` and `engineering:architecture` informed the structured review.

## Verdict

Request changes before treating the new backend as release-ready. The modular monolith, explicit typed commands, RLS, atomic receipts and outbox, isolated verification and absence of arbitrary agent execution are sound starting choices. However, independent legacy/canonical write paths have already diverged, media lock ordering can deadlock, and valid writes can persist a hierarchy that the Planning reader refuses. Listing code also performs avoidable work that the current 2,000-task/10-second regression test does not tightly detect.

## Confirmed findings

### B01 — P1 — Accepted results remain writable through the legacy task API

- `products/sprintique/backend/application/tasks.ts:50` only rejects a changed status for an accepted result; lines 51–64 still update its title, Markdown, owner, due date, type, priority, rank, tags and files.
- The canonical rule is different: `backend/domain/planning.ts:126–130` calls `open(t)` for `task.edit`, and `open` rejects every accepted result. This is observable protocol/domain drift, not merely naming/style.
- Isolated API proof: create task, prepare, assign, start release and close/accept it using actual public commands. Canonical edit preview returned `409 RESULT_PINNED`; legacy `PUT /tasks/accepted` with the same revision returned **200**, title `Legacy modified`, result still `accepted`.
- Fix: share an explicit immutable-result guard across direct and canonical task writes. Reject any post-acceptance mutation unless a future deliberate reopen/correction command is designed. Preserve idempotent replay of an already committed request.
- Regression: table-driven direct PUT and position PATCH after acceptance, covering title/description/media/priority/rank/status; confirm unchanged task, history, audit and outbox after denial. Canonical and legacy routes must agree.

### B02 — P1 — Valid hierarchy writes can poison the Planning read surface

- `backend/application/tasks.ts:30–36` checks ancestor existence and cycles but not depth. `backend/domain/planning.ts:118–130,147–151` permits task creation/edit/reparent without a hierarchy-depth invariant.
- `backend/application/planning-view.ts:73` rejects depth greater than 100, after hierarchy state has already been persisted. The limit is applied while constructing the entire result, before page slicing at line 87.
- Isolated API proof: **103 tasks in a chain**, all created through public task PUT with **200**; Planning groups returned **200**, then Planning rows returned **422 HIERARCHY_DEPTH**. A legal save produces a board section that cannot be read.
- Fix: one canonical bounded hierarchy validator used before every hierarchy-changing commit and direct creation. Keep a defensive reader check, but enforce the same documented limit on writes. Validate the resulting subtree depth, not just the moved task's ancestor count.
- Regression: exact boundary, boundary+1 create/edit/reparent, moving a deep subtree beneath another parent, unrelated group recovery, atomic denial (no task/event/number allocation).

### B03 — P1 — Media writes invert aggregate/asset lock order and deadlock task saves

- `backend/application/media.ts:29–30` upload locks the asset first; lines 44–45 later call `recordEvent` after object storage finishes. Discard also locks the asset first at line 63 and emits an event at line 66.
- `migrations/004_project_events.sql:11–16` makes every outbox insertion acquire the project row through `UPDATE app.projects`.
- Task save first acquires the project row (`tasks.ts:27`, `planning.ts:17–18`), then asset rows (`media.ts:77–80`). Map/avatar saves have the same project→asset order.
- Isolated real-transaction proof calls actual `uploadAsset` and `putTask`, with an intentionally delayed, in-memory object-storage adapter to control overlap. PostgreSQL returns **40P01** to upload; the waiting task save then fails `TASK_FILE_ACCESS` because upload rolled back. No external storage was used.
- Fix: define/document a single lock graph and apply it consistently to upload/discard and attachment mutation. A minimal fix is project-before-asset with credential/policy rechecks after waiting. A better later design stages decoding/object writes outside the business transaction, then a short fenced finalization transaction—requires careful GC lease/state coordination, not an unreviewed broad rewrite.
- Regression: deterministic overlap for upload vs task save, discard vs attachment save, and avatar/map equivalents; assert no 40P01 and coherent outcome. Include revoked/expired credentials while queued.

### B04 — P2 — Thread pagination loads the complete catalogue and does N+1 SQL

- `backend/application/discussions.ts:22` selects all threads for the task without LIMIT; line 23 hashes every row to create the cursor binding. There is no admission cap in `createThread` lines 40–44.
- Lines 33–35 issue a metadata/count query once per selected thread, so a page of 50 uses **58 SQL queries** including authentication/transaction checks in the isolated API proof. At local Unix-socket latency the measured page was 5–6 ms; this is not a production latency claim. Remote database latency multiplies those round trips.
- Fix: select page summaries and count/first-message metadata in one bounded SQL query, with SQL-side cursor positioning and a bounded version/count aggregate. Retain the stale-cursor contract and tenant binding. Avoid replacing the current implementation with silent truncation.
- Regression: large thread catalogue, page traversal, no duplicates, stale cursor after append/resolution/create, task scope denial, and an explicit constant-query-count assertion.

### B05 — P2 — Planning row projection is quadratic before page slicing

- `backend/application/planning-view.ts:70` repeatedly copies an entire sibling array with `[...existing,row]`; for flat groups this is quadratic.
- Line 85 filters all members for every row to compute `childrenCount`; line 83 maps the whole group before applying page size at line 87. Similar repeated filtering appears in `describeRelease` line 111 and release grouping line 57.
- CPU-only proof invokes the real exported `rows` use case with a synthetic read adapter and a page of 200: 1,000 tasks took 6–10 ms, 2,000 took 23–24 ms, 5,000 took 70–102 ms, and 10,000 took **273/540/529 ms** across three runs. This isolates JavaScript work from database/network latency; it is not an SLA benchmark.
- Fix: build child counts and parent lookup once using maps, append into owned arrays, prepare only the requested page's DTOs after sorting/visibility, and avoid repeated linear `find/filter` on release loops. No persisted schema change is needed for the immediate improvement.
- Regression: 10,000 flat siblings plus deep/wide hierarchy, stable ordering/cursor behavior, matched ancestor context and collapsed children. Compare a benchmark/operation-count profile, not only the current broad <10-second integration threshold.

## Architecture growth opportunities (not additional proven vulnerabilities)

1. **One application command boundary.** `backend/http/catalogs.ts` contains business rules and SQL; tasks, Planning, maps and profiles repeat authorization, aggregate locks, active-credential checks and revision logic. First extract shared guards and lock policy, then make legacy routes thin adapters to canonical use cases. Avoid a generic CRUD executor or UI-domain dependency.
2. **Read concurrency and snapshot strategy.** `planningLock` uses `FOR UPDATE` even for read-only groups, rows, options, history and capabilities. This is a documented conservative fence, not a new accidental bug. After correcting CPU/query issues, use an explicit consistent read snapshot/shared-read protocol while keeping command serialization. Simply changing every lock to `FOR SHARE` would introduce lock-upgrade deadlocks for `previewIntent` and other read-then-write paths; design this separately with concurrency tests.
3. **Durable record retention.** Successful OIDC callbacks consume their login state, but expired/uncompleted login states, project plans/selections, idempotency receipts, map versions, run history and outbox have no product-level retention/compaction policy. Define audit/recovery requirements before adding deletion. Keep replay tombstones long enough to prevent reuse of expired idempotency keys from replaying old actions. A bounded worker and explicit quotas are preferable to request-time cleanup of unrelated records.
4. **Contract completeness.** Non-Planning responses remain only partially schema-described; `/api/v1/contracts` also regenerates runtime schema objects per request. Precompute immutable schema objects; evolve runtime response validation and generated SDK compatibility tests module by module. Do not claim complete OpenAPI SDK coverage today.
5. **Storage transaction scope.** Image decode and up to three object-storage calls currently hold SQL connections and row locks. This increases tail latency and cross-feature contention. Introduce staged upload/finalization only with an explicit failure/GC state machine and fences.
6. **Policy/limit consistency.** Canonical Planning permits 1,000 releases, while legacy catalog GET rejects >500 (`http/catalogs.ts:16–17`). Frontend bootstrap should use paginated canonical releases or a consistent shared limit. Workspace-template admission also counts a workspace while locking only one project; evaluate a workspace-scoped lock/counter before allowing concurrent cross-project template publishing.
7. **Worker observability.** Restricted worker functions, lease tokens and finite attempts are good. Add redacted job timing/cause metrics and readiness for long-running workers; move to notifications or adaptive idle polling only if measured traffic warrants it. Do not introduce a separate broker merely to replace a bounded local SQL queue.
8. **Code readability.** Most backend modules are extremely compressed multi-statement lines, obscuring transaction boundaries and guard placement. Format touched modules and extract named use-case helpers as each issue is fixed; avoid a giant cosmetic rewrite that hides reviewable behavioral changes.

## Coverage / limitations

Reviewed all backend module families at code level: domain Planning/media, command/idempotency handling, tasks, discussions, maps/templates, workspace/search, profile/membership, agent runs, authentication/database role boundaries, job leases, events/SSE, HTTP routing and migration invariants; inspected relevant tests and isolated test harnesses. Deep security threat modeling is owned by the independent security specialist. Parent owns build/release pipeline findings and cache-policy fix. No claim of exhaustive fuzzing, multi-node production load, all browser flows, or independent production penetration testing.

Evidence scripts: `work/audit-r4/backend-proof.mjs` (isolated database and concurrency) and `work/audit-r4/backend-cpu-proof.mjs` (pure synthetic CPU). Initial sandboxed initdb failed because shared-memory allocation is prohibited; approved isolated rerun succeeded and cleaned its cluster. No credentials or private output/infra data entered this report.

## Suggested implementation ownership

- Backend specialist: B01/B02 domain guards + tests, B04 query rewrite + tests, B05 projection optimization + tests.
- Coordinate B03 with security specialist because credential revocation during queued media mutations and lock policy overlap; one owner edits `media.ts`.
- Parent: integration, contract completeness prioritization, overall evidence, docs and PR. Read-concurrency/storage redesign and retention policy need a focused ADR; report them as explicit next steps rather than silently expanding scope.

## Implementation record (audit worktree only)

Implemented in `work/sprintique-audit-r4`, branch `feature/sprintique-vnext-audit`; original `work/sprintique-vnext` remained unchanged for the independent security baseline.

- B01: `backend/domain/task-invariants.ts` now owns `requireOpenTask`; both canonical Planning and direct task PUT/position enforce it. Receipt replay remains intact. Regression covers ten field mutations, position changes, no audit/history/state mutation and replay of the original pre-acceptance receipt.
- B02: the same module owns iterative memoized cycle/parent/depth validation with `MAX_TASK_DEPTH = 100` (root depth zero). Both canonical creation/edit/reparent and direct writes validate the whole resulting hierarchy. Regression proves depth 100 works, depth 101 is denied, moving a deep subtree is denied and no number/revision/event survives rejection.
- B04: `application/discussions.ts` now fetches one SQL snapshot for aggregate counts/version, keyset anchor, bounded page and message summaries. Only 51 rows maximum become a response buffer. Thread catalogues are append-only, and every supported update increments revision, so `count:sum(revision)` is a monotonic catalogue version without application-side full materialization or an unbounded string aggregate. Older opaque cursors become stale instead of silently changing page order. SQL scans aggregate metadata to retain exact totals/version; this is not a claim of constant total database work.
- B05: `application/planning-view.ts` builds release buckets/child counts/parent maps once, appends into owned sibling arrays and slices the visible page before DTO construction. Existing hierarchy/filter/collapse and historical description tests pass. No DS source, UI contract or schema migration was changed by the backend specialist.

Current verification: Node 24 strict typecheck **PASS**; isolated native PostgreSQL + real S3 full product suite **117 passed, 0 failed, 0 skipped** (included other specialists' already-present tests at execution time), 14.535 seconds. B04 application query count **2**, versus 52 before (58 when counting the old full HTTP/auth wrapper). Exact 1,000-thread traversal and sub-millisecond ordering pass. B05 CPU-only 10,000 tasks/page 200: **23 ms, 3 whole-group filter calls**, compared with baseline 273/540/529 ms and per-row rescans. Timing is a local comparative profile, not an SLA. Parent must rerun the final immutable integration gate after all specialists finish.

Remaining beyond these fixes: read-concurrency snapshot redesign, staged storage finalization, durable retention policy, comprehensive non-Planning response schemas, release catalogue limit consistency and workspace-scoped template admission. These were not relabeled fixed by the targeted work. B03 media concurrency is implemented and tested by the parent, not owned by this specialist.
