# Planning R2 — implementation contract

Status: implementation authorized by owner, 2026-09-12: «Продолжай делать, пока все не закончишь». Baseline a47c25f. This adds Planning to the existing vNext kernel, not another backend. No push, deployment, legacy import or changes to the design system are implied.

## Decisions

- C-01 accepted: `products/sprintique` owns backend/contracts/client/migrations. This task is their writer; external Planning frontend must adopt this contract, not change it independently.
- C-02 accepted: one Release belongs to one Project within a Workspace.
- C-03 accepted: preparation draft/ready, working status, accepted result and admission are separate. Board eligibility is server-owned: ready, open result, and either an active effective Release or explicit independent admission.
- C-04 accepted: ready_for_release is not accepted or deployed. Closing requires explicit accepted task IDs and a destination for every remainder. Closing does not archive. Cancellation accepts no new outcomes.
- C-05 accepted: inherit/assigned/none; accepted descendants are pinned when accepted. Moving a parent does not move these historical results. Explicit exclusion survives reparenting.
- C-06 accepted with implementation choice: bounded explicit selections OR a server-resolved selector (whole release/project). Persistent preview with paged effects and one atomic finalization. Project planning revision is a conservative concurrency fence: unrelated planning edits can require a fresh preview. There is no release-size product limit. This first implementation computes a project graph in memory; scale and timeout limits are operational, never success with a partial graph.
- C-07 accepted: date-only plans, IANA project timezone inherited from workspace; UTC facts. Timeboxed releases require both dates. Temporal constraints do not automatically shift adjacent work.
- C-08 accepted: unchanged public versioned DS, Repository remains frontend adapter only. Planning frontend is a separate consumer; no invented replacement UI.
- C-09 deferred: optional import is not part of the clean-launch kernel. Referenced acceptance/import appendices were not supplied.

## Invariants and implementation order

1. Add migration 002, never rewrite 001; typed static transport schemas and pure domain planner.
2. Make ordinary task/catalog mutation unable to bypass scope, result or lifecycle transitions. Same Task ID/document/thread survive all changes.
3. Preview binds actor, credential, initiator, policy version, project planning revision and canonical action hash, with TTL. Server computes inherited effects; no trusted client affectedIds or confirmed flag.
4. Commit reauthorizes after acquiring project lock; verifies snapshot; writes tasks/releases/history/audit/outbox/receipt atomically. Retry reauthorizes before returning receipt. Lost ACK uses command key, not a new command. Rejected receipt is distinct from transport uncertainty.
5. Reuse a generic human approval record for agent planning commands, bound to exact action hash. Approval is not execution; expiry, rejection, revocation and stale preview prevent application. No MCP or LLM transport in this stage.
6. Cursor-paged compact Planning/board/roadmap projections. Full descriptions remain task-detail data. No hidden count cap in Planning groups.
7. Typed SDK and consumer/API tests. Integrate existing board adapter without a second Task model; frontend R2 integration requires the actual Planning consumer revision.

## Registered acceptance before implementation

- P01 create -> prepare -> assign -> start -> eligible board -> same task readable by second authorized client; status/owner/document preserved.
- P02 draft/ready independent from work status; independent take/defer; closed accepted results not on active board.
- P03 none survives parent moves; inherited active descendants included in preview; accepted children remain pinned; cycle/cross-project reference rejected.
- P04 close creates recipient and moves remainder atomically; exact accepted outcomes; no archive; retry creates no duplicate recipient.
- P05 concurrent commit and lost ACK produce one state/audit/outbox/receipt; altered same-key payload conflicts; restart preserves prepared plan/receipt.
- P06 expiry, stale preparation/status/hierarchy/release/date, denied role, other tenant, revoked credential and initiator rights reject safely; IDs/counts not leaked.
- P07 direct task/release writes cannot bypass Planning; title/Markdown edits retain planning metadata.
- P08 compact filtered/cursor projections, accurate distinct counts, paged preview effects, whole-release selection above request-size bound.
- P09 date-only validation, timeboxed range, milestones/FS-SS-FF-SF temporal conflicts/cycles; no auto-shift.
- P10 approval proposed/accepted/rejected/stale separate from application, agent cannot self-approve or substitute plan; generic record reusable.
- P11 real PostgreSQL rollback injection; RLS and non-owner runtime; migration checksums; detached build; unchanged DS artifact.

Test results belong to the checked revision. This is targeted backend/SDK acceptance, not full platform/production or the external Planning frontend's INTEGRATED_PASS.

## Completed backend/SDK verification

41 API tests (19 foundation + 22 Planning), 209 DS tests, strict build and detached product install/build/tests pass. Additional P12 checks cover event scope, revocation and commit-ordered reconnect; P13 checks live API response schemas and the typed SDK surface. See STATUS.md for final fingerprint and evidence. Consumer guide: `products/sprintique/docs/planning-r2.md`.

No source revision or acceptance appendix for the other agent's Planning frontend was supplied. Frontend INTEGRATED_PASS remains blocked; backend tests do not substitute for that artifact. General M4–M7 platform work is explicitly not complete.
