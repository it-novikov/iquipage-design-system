# Sprintique engineering audit R4

## Scope and authority

Baseline: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`, clean worktree. Audit the new product in `products/sprintique`, its public library in `libraries/iquipage`, relevant verification/CI/delivery scripts and the current Planning integration. The historical `design-system` snapshot and old platform/data remain unchanged. The owner authorizes investigation, fixes without a second approval, and a new PR in `it-novikov/iquipage-design-system`; no deployment, publication to npm or external paid services.

## Independent research workstreams

1. Security: delegated Codex Security Deep scan of the product, offline source review, actual threat boundaries and calibrated validated findings. Its artifacts remain owned by that workflow; missing access/tool failure is not a clean bill of health.
2. Backend architecture and performance: canonical domain invariants, request/use-case/SQL flow, lock order, idempotency, read bounds, jobs and transaction effects. Evidence includes synthetic isolated reproductions where practical.
3. Frontend and DS: public contracts, lifetimes, stale responses, drafts and lost ACK recovery, request fanout, rendering bounds, form state, event/blob cleanup and real component behavior. Keep approved visuals.
4. Integration/release engineering (parent): immutable source provenance, completeness of verification/fingerprints, process failure propagation, dependencies, CI and extraction, upstream Planning drift and PR compatibility.

## Research and fix order

- Preserve baseline; record findings before editing production source.
- Distinguish confirmed defects from architectural opportunities and unmeasured hypotheses. Each confirmed finding has ID, severity, exact source, reproduction/control, impact and regression acceptance.
- Consolidate independent reports, remove duplicates and check counterevidence. Incorporate relevant upstream bug fixes without importing fixture persistence or UX redesign instructions.
- Implement bounded root-cause fixes in separate owned areas; public DS changes require new version/package/types/provenance, never overwrite the historical consumed tarball.
- Cross-review fixes and run focused regressions followed by the complete existing gate. Do not weaken assertions, replace failures or claim old screenshots for new code.
- Commit, push a dedicated branch and open a PR against verified current main. Include all prior local vNext commits and new audited changes. Do not overwrite or close PR #3 automatically.

## Verification requirements registered before implementation

- New regression for every fixed correctness/security failure, with applicable forbidden/reader/stale/retry/cancel cases.
- Node 24 clean builds, strict typechecks, public package boundary tests, library tests, real PostgreSQL/S3 product tests, detached product extraction.
- No skipped required integration tests; failed/signal-aborted child processes fail the gate.
- Source fingerprint bound to build inputs and stable across the verification interval, including HTML/config/public types and consumed package identity.
- Targeted current-build browser walkthrough: auth/project navigation; board/task edit; Planning uncertain/committed-refresh recovery; map change/destroy/race; uploads and overlays. Light/dark; desktop 1440x900 and narrow390; reduced-motion and keyboard for changed flows. Broader engine/role/accessibility matrix remains explicit if not run.
- Performance before/after where the changed path permits a controlled measurement: request count, row/DOM bounds or query count; no invented SLA/FPS or production capacity claim.
- Final diff/secret scan, extraction/container checks, exact commit and real remote PR/CI state. No claims of deployed state.

## Research output

Comprehensive engineering report with source-linked evidence, fix ledger, architectural tradeoffs and remaining release limits; safe verification summaries and deliverables only. No private sessions, raw infra secrets, user databases or backups in Git/PR/artifacts.
