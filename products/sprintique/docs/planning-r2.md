# Planning R2 consumer contract

Contract catalog version **2**, policy **planning-r2.1**, product **2.0.0-alpha.0**, unchanged private DS **0.6.0-vnext.1**. `contracts/` has no backend or DS dependency; `client/planning.ts` is the typed consumer facade. Do not copy server resolvers into a frontend store. This is a clean-launch schema (migrations 001–004), not an old-platform database upgrade.

## Model and compatibility

Release belongs to one project. `preparation` (draft/ready), work `status`, `result` (open/accepted), and independent `admitted` are distinct. The board displays ready/open tasks in active effective releases, or independently admitted ready/open tasks. Starting a release does not change work status, owner or Markdown. `ready_for_release` is only a candidate for explicit acceptance, never a production fact.

Assignment is `assigned`, `inherit`, or explicit `none`. `releaseId` stores the explicit reference; `effectiveReleaseId` and `assignmentSourceId` are authorized server projections. `none` survives reparenting. Closing pins accepted descendants to the historical release before moving an open parent. Closing/cancelling requires one explicit remainder destination (existing/new/unassigned), is atomic and never implicitly archives.

Ordinary Task PUT edits the document and ordinary fields, preserving planning metadata. Existing release/parent changes return HTTP 409 `PREVIEW_REQUIRED` with `action.kind=planning-preview`; the host must offer the Planning confirmation flow. Newly created tasks default to draft. The existing board explicitly uses `createInBoard=true` to create a human's ready/admitted independent task. New release assignment is a subsequent Planning command, not an ordinary Task PUT field. A compact board row is not a complete Task: hydrate detail before editing; use the dedicated position command for board drag to avoid overwriting the Markdown with missing data.

## Command flow

```ts
const api = new SprintiqueClient();
await api.session(); // current authenticated cookie/CSRF session
const planning = new PlanningClient(api, projectId);
const capabilities = await planning.capabilities();
const preview = await planning.preview({
  kind: 'assign', selection: {kind: 'release', releaseId: sourceId},
  assignment: {mode: 'assigned', releaseId: destinationId}
});
// Render preview summaries and cursor pages from planning.effects(preview.id, cursor).
// An agent must obtain the separate human approval before commit.
const key = crypto.randomUUID();
// Persist key + preview.id + preview.token securely before dispatch.
const receipt = await planning.commit(preview, key);
if (receipt.status === 'committed') {
  // Invalidate projections and fetch canonical rows/revisions.
} else {
  // Display durable rejection; obtain a new preview and a new key if retrying intent.
}
```

The preview is server-prepared, actor/credential/initiator bound, policy/action-hash bound, and expires after 10 minutes. It makes no task changes. It fixes the project planning revision, a conservative fence: even an unrelated task edit can require a fresh preview. The server reauthorizes after acquiring the project lock. It rejects stale/revoked/expired or different-actor plans, and recomputes the full effect set before finalization. Client `affectedIds`/`confirmed=true` are not accepted.

Tasks/releases/history/audit/outbox/idempotency receipt finalize in one PostgreSQL transaction. An opaque command UUID passed as `Idempotency-Key` identifies the attempt; `receipt.operationId` is a correlation identifier, **not the receipt lookup key**. Exact retry after current authorization returns the same result; another body with that key conflicts. A plan cannot be applied twice even with another key.

On a lost response, keep the original attempt and call `planning.receipt(originalKey)`. A 404 is not proof of rollback: retry the exact original body/key. `sendAttempt` tracks unsent/sending/uncertain/settled; a network failure never triggers compensating local rollback. Persist tokens only in protected session-scoped storage; never telemetry/logs. Server receipts are synchronous committed/rejected; there is no fake pending worker. A stored rejection (including approval-required) stays rejected under that key; after approval, a still-valid plan needs a new attempt key.

An agent preview creates a generic approval. Human readers may inspect; human editors/admins may decide via revision CAS. Agents cannot self-approve. `approval.status` is proposed/approved/rejected; `approval.application` is separately null or a committed receipt. Approval expiry, preview staleness, actor/grant revocation and the approver's current rights are checked at application. Approving does not execute a command.

## HTTP and SDK surface

All routes below are relative to `/api/v1/projects/:projectId` and require current project authorization. Session writes require Origin + CSRF, agent writes require a scoped bearer credential. PUT/decision/commit require `Idempotency-Key`; preview creates a fresh expiring prepared plan.

| Method and suffix | SDK |
|---|---|
| GET `/planning/capabilities` | `capabilities()` |
| GET `/planning/tasks`, `/board/tasks` | `tasks(query)`, `board(query)` |
| GET / PUT `/planning/releases[/:id]` | `releases(cursor)`, `writeRelease(id, revision, value, key)` |
| POST `/planning/previews` | `preview(command)` |
| GET `/planning/previews/:id/effects` | `effects(id, cursor)` |
| POST `/planning/commands` | `commit(preview, originalKey)` |
| GET `/planning/commands/:originalKey` | `receipt(originalKey)` |
| GET `/planning/releases/:id/history` | `history(id, cursor)` |
| GET `/approvals/:id[/effects]` | `approval(id)`, `approvalEffects(id, cursor)` |
| POST `/approvals/:id/decision` | `decideApproval(id, revision, status, key)` |
| PUT `/planning/milestones/:id` | `writeMilestone(id, revision, value, key)` |
| GET / PUT `/planning/constraints[/:id]` | `constraints(cursor)`, `writeConstraint(...)` |
| GET `/planning/roadmap` | `roadmap({from,to,undated,cursor,limit})` |
| GET `/events?cursor=…` or `?stream=true` | `watchProject(...)` for browser SSE |

Read `contracts/planning.ts` for exact request unions and `contracts/planning-responses.ts` for response schemas. `/api/v1/contracts` exposes these JSON schemas; it does not claim complete OpenAPI. SDK reads include counts, history before/after/outcome, approval effect pages, timezone and roadmap rows.

Queries support q, releaseId/unassigned, parentId, preparation, status, owner, tagId. Pages max 100; explicit selected IDs max 200. Use the server `release`/`project`/`unassigned` selector for larger groups, then read all effect pages. `total` counts unique authorized tasks, not contextual rows. Cursors bind project/query/revision; restart paging on a stale cursor. Current ACL is project-level: no claim of task-level visibility filtering. The in-memory graph resolver and project serialization have operational memory/time limits; 206-item atomic selection is tested, not a production load certification.

Plans are date-only YYYY-MM-DD. Project timezone inherits from workspace (UTC default), while facts are UTC timestamps. Timeboxed releases require both start/end; flexible releases need neither. FS/SS/FF/SF constraints use the appropriate start/end boundaries plus signed calendar-day lag. Missing dates do not invent a schedule. Cycles and conflicts reject; adjacent tasks are never shifted automatically.

## Events and cache lifecycle

Events expose metadata, authorized references/revisions, actor/initiator and correlation/causation; never whole descriptions or files. Per-project positions are allocated under the project row lock and published only from committed outbox rows, so a later commit cannot be skipped by an earlier cursor. SSE reconnect uses Last-Event-ID; clients deduplicate event IDs and refetch projections. The stream rechecks access, emits access-revoked/clearCache and ends; the host cancels pending reads, closes drawers and removes protected cache. Late task hydration cannot reopen a revoked task. On reconnect 401/403/404 also triggers eviction; transient network failures alone do not imply lost access.

The server caps three streams per credential per process and closes slow consumers; it does not pretend this is distributed rate limiting. Shutdown closes streams in preClose, before draining connections ([Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Server/#preclose)). SSE is not collaborative editing or external notification delivery. External outbox dispatch/dead-letter/retries still require the later worker stage.

## Reproduction and integration boundary

Run the product build/tests and `npm run preview:fixture` as documented in the product README. Tests use an isolated real PostgreSQL cluster and synthetic identities; no object storage is implemented in this stage. Never reuse the fixture login for deployment.

The existing board adapter uses these backend projections and authorized SSE. The other agent's new Planning UI and `ACCEPTANCE-R2.md` were not supplied, so its consumer test suite and INTEGRATED_PASS remain blocked. Supply its exact branch/commit or source path and appendix, adopt this contract, connect its preview/approval/recovery UI, then run the shared create → prepare → assign → start → board → second-client scenario. The backend scenario already runs against PostgreSQL; that is not a substitute for the missing frontend integration.
