# vNext implementation review

- F01, build: new host referenced `styles.css`, but copied UI stylesheet is `maps.css`. Confirmed by Vite unresolved import. Repair import, rerun build and browser.
- F02, security review: agent grant checked its own membership but not its human initiator's current membership. Recheck grantor access on every command/read; test removal of grantor.
- F03, domain review: archived tags/releases already assigned to a task must survive unrelated edits. Permit retaining an existing reference, reject new assignment of archived values. Test both paths.
- F04, integration boundary: product's optional settings/links were requested unconditionally by old UI. Add explicit capability gating; keep unavailable features visibly out of scope, do not return mock persistence.
- F05, readiness: runtime role needs read-only access to the migration ledger. Add grant and readiness test.
- F06, performance: approved UI eagerly pulls cover assets/advanced helpers into a 1.82 MB minified initial bundle. Code split before release; currently a known M7 acceptance gap, not hidden by increasing the warning limit.
- F07, test fixture: static routes were registered after the first injected request booted Fastify. Move route registration before fixture provisioning; production entry already uses that order.
- F08, browser: assigning native `fetch` as an SDK instance property changed its receiver, causing Chromium `Illegal invocation`. Wrap the native call without changing injected-transport support; rerun browser task flow.
- F09, package integrity: rewriting a tarball under the same version did not update the installed dependency. Public-type test caught stale declarations. Issue a new local package version and update the lockfile; do not mutate a consumed release in place.

These are implementation findings, not a claim of full-integration or independent security acceptance. Verification status is recorded in STATUS.md and test output.

## Planning R2 findings and verification

- R2-01, deterministic comparison: PostgreSQL JSONB key ordering caused false PLAN_STALE. Canonical serialization is used for hash/recomputed effects. Happy path/restart/idempotency tests pass.
- R2-02, scoped timezone: workspace RLS prevented an agent from resolving the project timezone. Migration 003 adds a project-authorized, fixed-search-path helper without granting workspace-wide access. Agent planning and inherited timezone tests pass.
- R2-03, compact adapter: writing a compact board row as a full task could discard Markdown. Dedicated versioned position command and detail hydration preserve document content; API and browser checks pass.
- R2-04, event confidentiality: task-only scopes initially included credential events. Scope-specific task/thread/approval filters were added; task-only and threads-only tests pass.
- R2-05, reconnect ordering: a globally allocated cursor can skip a transaction committed late. Per-project transactional position allocation in migration 004 plus two-transaction test prevents that gap.
- R2-06, revoke lifecycle: board destruction must close active dialogs and prevent late hydration opening new ones. isActive checks plus closed-board cleanup; browser delayed authorized response released after logout cannot reopen a protected task.
- R2-07, shutdown: streams must close during preClose before Fastify waits on active connections. Real HTTP SSE delivery/revocation/close tests pass.
- R2-08, approval/application: expose the applied receipt separately from human decision; wrong token, stale/expired/rejected proposal and self-approval remain denied. Tests pass.
- R2-09, consumer types: added missing typed capabilities/release counts/roadmap/history/approval reads and static schemas. Live SDK-to-API test validates actual payloads; all 41 API tests pass.
- R2-10, integration remains open: external Planning source and ACCEPTANCE-R2 appendix absent; parent/release changes in existing editor require the missing confirmation UI. Reported explicitly, not masked by direct writes.

Early failed runs (JSONB order, timezone RLS, fixture payload/type errors) remain in local raw logs. Sandbox PostgreSQL shmget failure was environmental; reruns used isolated temporary clusters with the needed local permission. Browser CLI harness failures (unsupported setTimeout and an animation-in-progress screenshot) were corrected and the actual scenario rerun; they were not treated as application passes.
