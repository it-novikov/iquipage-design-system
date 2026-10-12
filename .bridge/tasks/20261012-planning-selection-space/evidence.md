# WP02-A: evidence and review boundary

Author: GPT-6 Astra (AI agent), `gpt-6-astra@localhost`.
Baseline: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.

## Problem and candidate

The existing selection bar is fixed to the browser viewport. The Planning list can therefore occupy the same rectangle as the bar: extra space after the list does not protect a selected middle row. Earlier production observations support the problem, but the deployed revision was unknown.

The candidate changes only Planning CSS. The product host contains a full-height column: its workspace is the scrollport and the existing selection bar is a normal-flow sibling that takes its actual wrapped height. Existing markup, event handlers, selection, permissions and move payloads are unchanged. The bar keeps its existing type, colour, radius, shadow and controls.

No browser acceptance has been claimed locally. The parent explicitly authorized preparation of this candidate and execution of red/green proof on the existing GitHub Ubuntu runner after native browser execution proved unavailable in this workspace.

## Local checks actually executed

| Command/check | Result | Meaning |
| --- | --- | --- |
| Existing-lock `npm ci --ignore-scripts` | PASS | Exact product dependency installation; package/lock/vendor unchanged |
| `npm run check:boundaries` | PASS | Product boundaries and style rules |
| `node --test tests/planning-workspace.test.mjs tests/planning-containers-ui.test.mjs tests/planning-operation.test.mjs` | 18 passed, 0 failed | Existing model/markup/operation tests; does not establish server persistence or layout |
| `node node_modules/vite/bin/vite.js build` | PASS, 321 modules | Product bundling phase, **not** complete `npm run build` |
| Dedicated fixture Vite build | PASS, 70 modules | Actual Planning/navigation/product CSS and DS assets resolve |
| Browser runner and baseline recognizer `node --check` | PASS | Syntax only |
| Workflow YAML parsing and `git diff --check` | PASS | Syntax/whitespace only; no Actions execution claim |
| Full `npm run build` | BLOCKED before type diagnostics | Native TypeScript7 panics because `/proc/self/exe` is unavailable |
| Browser geometry/interactions, local | NOT_RUN | Chromium exits with SIGTRAP before rendering `about:blank` |
| Full backend/services/extraction and release browser/AT suite | NOT_RUN locally | Existing GitHub gates remain; release checks retain their separate scope |

DS is the product's `0.6.0-vnext.52` archive, SHA256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`. The browser runner independently checks that expected archive and installed version and records its actual CSS hash, source revision, Node and Chromium version.

## Required GitHub evidence before A1/A2 can close

1. The repair-only historical step exports the complete product at the immutable baseline and adds only the new synthetic test driver/fixture. The normal no-overlap regression must remain red there. The recognizer requires actual intersections for selected middle and selected last rows in all three profiles; startup failures, timeouts, unexpected service requests or incomplete interactions do not count as reproduction.
2. The current-source regression must pass: zero selected-row/bar intersection, hit testing of the visible row, one working scrollport, a contained wrapped bar, Space/range selection/M/Escape, last-row access, dialog close callback/scroll/focus return, drag edge scrolling/cancel without an operation, and exactly one recorded move intent from one command.
3. Inspect synthetic candidate screenshots of selection, last row and menus, alongside their matching baseline frames. Numbers alone do not close visual acceptance. Profiles are light comfortable 1363×936, light compact 1280×720 and dark comfortable 320×568. The narrow profile asserts that actions really wrap. These are headless viewport sizes, not real browser UI zoom or touch/screen-reader validation.
4. The workflow's pre-existing typecheck, library, real-services, extraction and runtime-image gates are still required. The new frontend step does not bypass or relax them.

The fixture mounts actual `mountPlanning`, actual project navigation, exact public DS, and normal product CSS. Its adapter supplies invented deterministic data. A move records the intent and then rejects explicitly instead of inventing a successful commit. Task content is substituted inside the real product dialog wrapper: this proves only Planning's provided return callback, not the complete Task route or server state. The pre-existing focus result of removing the focused clear-selection button is recorded, not promoted to a desired accessibility contract.

The existing workflow uploads the synthetic JSON/screens with its verification artifact. Real production names, task text and private screenshots are not included.

## Reproduction and next action

See `products/sprintique/tests/fixtures/planning-selection/README.md`. Shared CI tools live only under `$RUNNER_TEMP/sprintique-browser-tools`; product runtime and lock dependencies are unchanged. Root publishes the branch and reviews the immutable patch. A1/A2 and visual acceptance remain open until the GitHub results and rendered frames have been assessed. This is a reviewable candidate, not a release-ready claim.
