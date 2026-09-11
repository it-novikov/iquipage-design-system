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
