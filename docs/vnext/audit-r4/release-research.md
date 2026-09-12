# Integration and release engineering audit

Baseline `8e189329b84649e20c8e02b70ba7f94f69af8c4d`. Source-only audit plus isolated Node process reproduction, actual local public-asset HTTP responses, public npm advisory lookup, and read-only GitHub branch inspection. No production source changes during research.

## R4-REL-01 — signal-aborted native tests reported as successful

Confirmed, P2, high confidence. `products/sprintique/scripts/test.mjs:29–30` forwards signals to the child then sets `process.exitCode=code||0`. Node reports `code=null` when a child terminates from a signal, so this expression emits success. A child spawned on Node24.20.0 and self-terminated with SIGTERM returned `{code:null,signal:SIGTERM,currentNativeHarnessResult:0}`. Docker test mode already uses `code??1` and is not affected.

Repair: common tested child-exit handling with nonzero signal/error behavior, stream completion and listener cleanup. Regression must include normal success, nonzero exit and signal termination. Do not claim the historical tests were aborted; the defect is that the harness would accept such an outcome.

## R4-REL-02 — verification identity omits HTML and lacks a drift fence

Confirmed, P2, high confidence. `scripts/verify-vnext.mjs:23–34` collects a source fingerprint only after all verification and uses a suffix filter that excludes HTML. Actual final R3 inventory has386 records and omits `products/sprintique/web/index.html`, which is the Vite entry. Thus HTML changes do not affect the claimed identity, and edits during tests could be attributed to results for earlier content.

Repair: central source-input inventory including actual HTML/static build inputs; snapshot before and after the gate, fail on drift, preserve both identities. Add fixture tests for HTML inclusion, build/private output exclusion and changed/added/removed input detection. Keep evidence timestamp and commit independent. Update CI paths to include verification helpers/tests. This does not retrospectively invalidate the recorded successful R3 commands; it limits the old fingerprint's claim.

## R4-PERF-01 — public content-addressed assets cannot be cached

Confirmed, P2, high confidence. `backend/http/app.ts` globally overwrites Cache-Control with `no-store`; `backend/http/static.ts` provides no static override/validator. At `2026-09-12T11:40:02.570Z`,9 hashed JS/CSS asset responses from the running baseline returned200/no-store/no ETag, totaling1,118,728 uncompressed bytes. Evidence: `static-assets-before.json`.

Repair: immutable long-lived caching only for explicitly served hashed public assets, with conditional ETag handling; retain no-store for HTML, API/auth, protected files and errors. Test positive asset reuse plus API/private/error negative controls; measure repeat-load network bytes in browser separately from file size. Avoid new unbounded in-process cache.

## R4-REL-03 — library clean installation fails in CI without a lockfile

Confirmed during independent clean-worktree verification. `.github/workflows/vnext.yml` invokes `npm ci --ignore-scripts --prefix libraries/iquipage`, but the package has no package-lock in the baseline. A clean invocation exits EUSAGE before any test. Added the standalone library lockfile (zero new dependencies); the exact clean command now passes. This closes a local-vs-CI reproducibility gap, not a DS API change.

## Upstream integration drift (baseline research)

Verified GitHub main `f3dd146cc9c7c0544fd663d632704a210a5c13be`; open PR3 head `e7fd13592b070763f27e8ede7251352e2a076054`, user has ADMIN access. Our import is pinned earlier at `d87c657`. Subsequent upstream983de13 fixes committed-calendar-refresh recovery. Frontend specialist independently confirms applicability. Import only applicable source fixes with provenance and real backend tests; do not treat upstream fixture PASS as integration proof. New row-windowing package is an additive DS candidate, not permission to silently install a second unreviewed private UI boundary or apply UX redesign docs.

## Dependency signal and counterevidence

`npm audit --json` against the exact current product lock returned0 advisory findings,214 total dependency entries. This is advisory-database coverage, not proof against unknown vulnerabilities or a container/OS scan. Raw machine result: `npm-audit-product.json`.

Suspected missing container migration assets was dismissed: `scripts/build-assets.mjs` copies SQL to `build/migrations`, and the runtime image copies the entire build tree. Real S3 test skipping was also dismissed: `tests/media.test.ts` explicitly requires a real config/service and does not skip missing storage.

## Architecture growth opportunities

- Preserve the portable modular monolith and independently versioned DS boundary. Microservice splitting would introduce distributed transaction/outbox/authorization failure modes without current load evidence justifying it.
- Treat bounded read projections and command invariants as shared application contracts; remove divergence across legacy/Planning routes instead of adding UI workarounds.
- Increase automated browser adapter/lifecycle and contract tests where strict backend TypeScript cannot protect the JavaScript integration layer. Do not claim the whole frontend is typechecked by the current tsconfig.
- Keep production capacity, cross-replica rate limits, encrypted off-site recovery and remote observability as explicit release work; local synthetic measurements do not set an SLA.

## Primary technical references

1. Node.js, Child process — exit event (`code` is null on signal termination): https://nodejs.org/api/child_process.html#event-exit . Source-backed local Node24 reproduction is the decisive evidence.
2. MDN, Cache-Control response directives — immutable, no-store and private/shared caches: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control . Accessed2026-09-12.
3. GitHub PR3 exact commits and consumer integration docs in `refs/remotes/design-audit/pr-3`; read-only inspection, not deployment or approval of all proposed UX.
