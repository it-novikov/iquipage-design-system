# Sprintique Planning — release lifecycle and temporal review

This is the reusable Planning consumer and its isolated browser fixture, in the owner-confirmed `it-novikov/iquipage-design-system` repository. The branch is `feature/vnext-planning-ui`; PR #3 collects this track. The legacy Sprintique repository is not a runtime dependency.

## Current boundary
The fixture supports release/backlog groups, expanded children, explicit and snapshot selection, shared task documents, preparation, start, transfer, bulk fields, close/cancel with carry-forward, immutable outcome history, sprint defaults, timeline, milestones, temporal dependencies and condition filters.

**This is not a finished production feature.** `npm run verify` currently fails the required committed-calendar refresh-recovery scenario. The write of that repair was rejected by the tool safety-status check. List pointer DnD and virtualization are not integrated. New backend/SDK/authorization/PostgreSQL are owned by the parallel backend track and are not connected here. See `docs/FINAL-FINDINGS.md`.

The fixture stores synthetic work separately in IndexedDB. It is not a production fallback. Paid LLM, deployment, email invitations and external automation are not invoked by Planning.

## Run
Use Node.js 24. From the repository root:

```sh
cd packages/maps
npm ci --ignore-scripts --no-fund --no-audit
npx --no-install playwright install chromium
npm run build
cd ../planning
npm ci --ignore-scripts --no-fund --no-audit
npm run preview
```

Open `http://127.0.0.1:4328/`. `npm run verify` runs the required consumer tests, including the known failing recovery case; do not remove that test to obtain green CI.

## Integration
Use `mountPlanning` with one host-supplied adapter and the existing task-document callbacks. `types/index.d.ts` describes the consumer projection, not an invented HTTP API. `src/` has no SQL, tenant policy or fixture imports. The generic DS extraction belongs to its designated owner; pinned `design-system/` remains unchanged.
