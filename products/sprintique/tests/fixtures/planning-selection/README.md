# Planning selection geometry

Dedicated synthetic frontend fixture for WP02-A. It mounts the real `mountPlanning`, project navigation and product dialog wrapper, with the public IQUIPAGE package and the same CSS imports as the product entry. All task and person data here are invented.

## Boundary

The adapter provides a deterministic `ContainersView`. A move records its outgoing intent and rejects with an explicit synthetic-boundary error; it does not fabricate a committed result. Task content is replaced, so the dialog check covers Planning's close callback and scroll/focus return, not the complete Task route or server persistence.

The regression checks selected-row/action-area geometry, keyboard selection and menu return, the last row, the existing drag edge-scroll/cancel path, and one recorded move intent. It does not close the independent move-recovery, browser compatibility or assistive-technology release checks.

## Run

From `products/sprintique`, install the product with its existing lockfile (`npm ci --ignore-scripts`). Provide Playwright and a compatible Chromium in the execution environment, then run:

```sh
node tests/planning-selection-space.browser.mjs
```

The runner uses a local Vite server and blocks external requests. It verifies the expected `.52` vendor archive SHA256 and installed package version. It writes `output/planning-selection/results.json` and synthetic screenshots. The same no-overlap assertions must fail on the unchanged baseline and pass after the fix.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `PLANNING_PLAYWRIGHT_MODULE` | Absolute path to an externally provided Playwright module when it is not normally resolvable |
| `PLAYWRIGHT_MODULE` | Shared CI fallback for the same module |
| `PLANNING_CHROMIUM_EXECUTABLE` | Explicit browser executable; actual version is recorded |
| `PLANNING_CHROMIUM_ARGS` | JSON array of arguments required by that browser distribution |
| `PLANNING_EVIDENCE_DIR` | Separate absolute evidence directory, for example for baseline and candidate |
| `PLANNING_SOURCE_REVISION` | Source revision recorded alongside the actual CSS hash |

Use the default Playwright Chromium when available. The fixture needs no credentials, backend, local service stack or product dependency changes. A successful fixture bundle alone is not browser acceptance. If the browser cannot launch, record `NOT_RUN` and retain the layout acceptance as open.

## Historical red proof in the repair PR

The existing `vnext.yml` workflow runs the ordinary green regression for the current source. For the original `fix/planning-selection-space` repair PR it also exports immutable baseline `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` into a temporary directory and adds only this new test driver/fixture. Its product source and CSS remain the archived baseline. The baseline uses its own normal `npm ci` and must fail the same no-overlap assertions. `planning-selection-baseline-proof.mjs` rejects a launch failure, timeout, unexpected request or incomplete interaction run as evidence.

That historical counterexample is a separate, repair-specific CI step. Later changes run the normal green regression; an already fixed PR base is not expected to fail. Baseline/candidate metrics and synthetic screenshots are uploaded with the existing verification artifact.
