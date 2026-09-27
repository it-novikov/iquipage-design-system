# Sprintique vNext handoff — 2026-09-27

## Where things are

- `libraries/iquipage` — DS source, now `0.6.0-vnext.19`. Changes per version: `libraries/iquipage/docs/CHANGES-0.6.md`; public API: its README; contracts: `tests/vnext*.test.cjs`.
- `products/sprintique` — the product. It consumes only `vendor/iquipage-web-<version>.tgz` (checksum in its README and lockfile). UI decisions and their reasons: `docs/ux-ds-alignment.md`; settings: `docs/settings/DESIGN.md` and `VALIDATION.md`.
- Branches: `main` holds everything up to PR #9. PR #10 (settings) and PR #11 (task drawer) are open and stacked; PR #12 (relation map, whiteboard showcase, docs) is stacked on #11, PR #13 (backend completion with migration 018, fourth drawer round on vnext.18) is stacked on #12, and PR #14 (maps, drawer properties, discussions and covers on vnext.19) is stacked on #13. Merge them in that order; GitHub retargets the next one to `main` after each merge.

## Run it

```sh
cd products/sprintique && npm ci --ignore-scripts && npm run build
LC_ALL=C npm run dev:local        # http://localhost:4311, admin / admin, synthetic data, temporary database
```

The stand serves the built `dist/`: rebuild with `npx vite build` after UI changes, restart it after backend changes, `npm ci` or a new migration. `npm run preview:settings` serves a settings preview with admin and reader logins on port 4383.

## Change the DS and adopt it

1. Edit `libraries/iquipage/src`, raise the version everywhere it appears (see CHANGES-0.6), add a `tests/vnextN.test.cjs` contract.
2. `npm test && npm run build`; for fast iteration copy `dist/` into `products/sprintique/node_modules/@iquipage/web/dist/` and run `npx vite build` in the product.
3. `npm pack --pack-destination ../../products/sprintique/vendor`, remove the previous tarball, update the product README checksum, `package.json`, lockfile `resolved` and `integrity` (sha512), `tests/library-contract.ts` and docs, then `npm ci`.
4. Product checks: `npm run check:boundaries` (includes the style contract: no inline styles, no reaching into DS internals), `npm run typecheck`, `node --import tsx --test tests/frontend-lifecycle.test.mjs tests/appearance.test.mjs`.
5. Full gate from the repository root: `LC_ALL=C TEST_S3_CONFIG=<private storage json> node scripts/verify-vnext.mjs`. Do not edit sources while it runs: it checks source stability.

## Rules that still hold

- No deployment without an explicit target, secrets and a data plan. Never publish cookies, credentials, private infrastructure config (`products/sprintique/output/infra`), user databases or backups.
- Merges into `main` are done by the owner.
- Migrations are append-only (018 is the latest). Product code imports only public `@iquipage/web` entries.
- Russian UI copy; dates as 04.10.2026 or 04.10.2026 14:00; no middot separators.

## Next

Merge PR #10, #11, #12, #13 and #14 in that order. Backend work proposed by the councils is done except a personal profile photo (see STATUS.md).

---

# Sprintique vNext R3 handoff — 2026-09-12

Owner approved same repository with detachable Sprintique and independent DS, then delegated stack choices and requested finishing the locally implementable work including partial Planning PR #3. No push/deploy/publication, production access, paid provider or legacy-data migration in this step. Do not reuse merged PR #2 or modify the Planning writer's branch.

## Source and boundaries

Working branch `feature/sprintique-vnext`; R2 baseline `f69f1d209427433ae51fecfe3a19a3d5dc958172`. PR3 imported read-only from `feature/vnext-planning-ui`, immutable `d87c65767ef471c81bf84c10b9b19e225a956064`. Current implementation is this handoff's Git commit; resolve it with `git rev-parse HEAD`, not a mutable branch name.

`libraries/iquipage` owns its build/types/package. `products/sprintique` owns everything needed to run/extract the product and consumes only vendored public `@iquipage/web` 0.6.0-vnext.1. Tar SHA `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`. No runtime import from the root pinned `design-system/`, historical maps package or parent library sources.

## Delivered

New Node 24/strict TypeScript/Fastify/PostgreSQL modular backend; canonical tasks/discussions/board; complete local Planning intent/preview/commit/recovery integration; versioned maps/sessions/history and templates; private S3 uploads/covers/avatars; profiles/membership/invitations/settings/tags/links/search; bounded agent run/proposal/human approval/receipt/cancel APIs; restricted fenced cleanup worker; live authorization/audit/outbox/SSE; quotas, schema readiness and private route-level metrics. Real local Keycloak and Garage, container/CI scripts, source extraction and two-database/private-object restore drill.

Read product README, docs/planning-integration-r3.md and docs/operations.md before running it. Maps workflow/automation UI is explicitly disabled: no unrestricted executor, MCP or paid provider is hidden behind a toggle.

## Evidence

- Final automatic gate: `products/sprintique/output/verification/2026-09-12T11-15-56.934Z`, 209 DS + 107 product tests, no skips; strict/boundary/build and detached fresh install/build/107 tests PASS. Fingerprint `5750cb964e7424fa61ec1f92bf3c508d1253010ee58cfc3119c996f3b92b64b0`.
- Final runtime image `sha256:98296dfcd70b54e40e6a077bdea809b849dc0e9958e92a2d85c3921798aa9dc3`: non-root/read-only/cap-drop, real PG/S3 readiness/session, anonymous denied. No registry publication.
- Real TLS/OIDC login and callback replay rejection; UI human approval then exact agent commit and grant revocation.
- Browser Planning/create/prepare/start/board/Markdown/cover/discussion/close/remainder/history/date and recovery checks: COMPLETION-R3.md. Full independent browser/security/accessibility acceptance is not inferred.
- Local restore checkpoint at 10:25 UTC: 37 tables/71 rows, two databases, three private variants; source unchanged; temporary restore resources removed. Later synthetic UI records are newer than the checkpoint.

Raw verification/browser output is ignored, not source. Private `output/infra` contains credentials, local CA keys, session state and **unencrypted** backups; never archive or print that directory. Only explicitly selected `*-verification.json` summaries are non-secret. GitHub CI is defined but not remotely run because there was no push.

## Local runtime

API `http://localhost:4312`, private S3 `127.0.0.1:4900`, PostgreSQL `127.0.0.1:54329`, OIDC `https://localhost:9443/realms/sprintique`. Context `colima-sprintique-vnext-qa`, owned resource labels only. Do not alter the user's other Colima/Docker resources. `npm run local:start` applies 001–015 and starts the compiled API + restricted worker from private generated config. Node 24 is required.

## Remaining release boundary

GAPS.md is the current explicit list. Independent audit/full UI matrix, external deployment/pilot, encrypted off-site backups/full identity restore, shared replica quotas/tracing, complete non-Planning response schemas, external notifications and future MCP/provider execution are not claimed. No known failing automated test is relabelled PASS. The old unapproved `assessment.json` and `acceptance-plan.pending.json` remain historical full-platform scaffolds; use the targeted `assessment-r3.json` for this checkpoint, not a fabricated 100% score.
