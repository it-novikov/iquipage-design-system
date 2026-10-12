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

1. The repair-only historical step exports the complete product at the immutable baseline and adds only the new synthetic test driver/fixture. The normal no-overlap regression must remain red there. The recognizer requires the confirmed counterexample: positive visible middle-row intersections in all three profiles and a visible last-row intersection with narrow wrapped actions, after measured overflow clipping. Startup failures, timeouts, unexpected service requests or incomplete interactions do not count as reproduction. The candidate still requires strictly zero visible intersection for every selected middle and last row and both return states; raw rectangles/intersections remain diagnostic evidence.
2. The current-source regression must pass: zero visible selected-row/bar intersection, independent row-fit and centre/lower-edge hit tests, one working scrollport, a contained wrapped bar, Space/range selection/M/Escape, last-row access, dialog close callback/scroll/focus return, drag edge scrolling/cancel without an operation, and exactly one recorded move intent from one command.
3. Inspect synthetic candidate screenshots of selection, last row, menus and the saved state after menu Escape, alongside their matching baseline frames. Numbers alone do not close visual acceptance. Profiles are light comfortable 1363×936, light compact 1280×720 and dark comfortable 320×568. The narrow profile asserts that actions really wrap. These are headless viewport sizes, not real browser UI zoom or touch/screen-reader validation.
4. The workflow's pre-existing typecheck, library, real-services, extraction and runtime-image gates are still required. The new frontend step does not bypass or relax them.

The fixture mounts actual `mountPlanning`, actual project navigation, exact public DS, and normal product CSS. Its adapter supplies invented deterministic data. A move records the intent and then rejects explicitly instead of inventing a successful commit. Task content is substituted inside the real product dialog wrapper: this proves only Planning's provided return callback, not the complete Task route or server state. The pre-existing focus result of removing the focused clear-selection button is recorded, not promoted to a desired accessibility contract.

The existing workflow uploads the synthetic JSON/screens with its verification artifact. Real production names, task text and private screenshots are not included.

## First actual GitHub browser result and narrow correction

[Run 38207967799, job 114675580643](https://github.com/it-novikov/iquipage-design-system/actions/runs/38207967799/job/114675580643) rendered the immutable baseline in Chromium `151.0.7922.34` using exact DS `.52`. `sourceRevision` was `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`; baseline CSS SHA256 was `abc64121cac705d4cb6a7a183cc79e2bb0e3e5992e01a0f3483eaff0ff0b7f1a`. All three profiles completed the interaction smoke. Page errors, interaction failures and external requests were empty. The normal no-overlap regression correctly returned FAIL.

| Baseline profile | Selected middle-row intersection, CSS px² | Selected last-row intersection, CSS px² |
| --- | ---: | ---: |
| Desktop 1363×936 | 19,592 | 0 |
| Compact 1280×720 | 19,592 | 0 |
| Narrow 320×568 | 23,682.09375 | 15,677.375 |

The author inspected all six selection/last-row frames. At the wide list end, the footer and bottom inset leave the last row just above the bar (`row.bottom = bar.top`, 858 px desktop and 642 px compact). This incidental space does not protect a middle row. The narrow bar wraps to 147.09375 px high and overlaps the last row too. These observations confirm a position-dependent overlay, not a requirement that the old UI fail at every position.

The first CI job stopped because the historical recognizer incorrectly demanded wide last-row overlap; the candidate step was skipped. The correction changes only that historical expectation to the observed counterexample. The candidate's geometry, hit, single-scrollport, keyboard/drag/intent and error checks are unchanged. Replaying the downloaded, unmodified result through the corrected recognizer verifies this correction without claiming a new browser run. Candidate green and visual acceptance remain pending.

Browser evidence is now uploaded immediately after the browser steps, even when they fail, under `planning-browser-evidence`. The final artifact and existing backend/build/extraction gates remain in place.

## Actual candidate FAIL, independent R2 and clipping correction

[Run 38209281679, job 114679612012](https://github.com/it-novikov/iquipage-design-system/actions/runs/38209281679/job/114679612012) passed the corrected historical proof and executed the candidate in Chromium `151.0.7922.34`, Node `v24.20.0`, exact DS `.52`. Candidate source revision `b3505803dd4dfc6a78558566422ad2d5f274532d` had the same tree as reviewed head `a52d285b5f46975639a19d21ba1ad3212ae33cb5`. Candidate CSS SHA256 was `0916a36d4a682ce7b05e84fc8732382ce4bbda03b707578ffd909dc16b6650f4`. The downloaded artifact SHA256 is `ee84471a776f43c31177b70f826c7f300c036248832913be2d84b57ca471bca5`.

The overall candidate result remains **FAIL**: three overlap assertions failed, while page errors, external requests and interaction failures were empty. All three profiles completed selection, menu/Task-wrapper return, drag/cancel and one recorded move intent. Existing later build/backend/extraction/image gates were skipped, not passed.

The author inspected the candidate desktop/compact selection frames, narrow selection/last/menu frames and matching baseline evidence. The action area occupies separate space. In the two wide selection snapshots, the raw row bottom is 0.375 CSS px below its `overflow:auto` workspace boundary: 858.375 versus 858 (desktop), 642.375 versus 642 (compact). The bar starts at that boundary. The old rectangle calculation counts a hidden tail, giving 118.5 CSS px²; the actual clipped row has no overlap there. The narrow menu-return failure cannot yet be explained from the old artifact: its geometry was discarded and the menu screenshot was taken before Escape.

The correction changes only the dedicated runner/recognizer, documentation and review packet. It keeps complete raw rectangles as `rawIntersection`, measures overflow clipping ancestors and insets without rounding fractional BCR edges, and requires `visibleIntersection === 0` with no overlap allowance. Existing row-fit, centre hit, bar/viewport bounds, scroll, keyboard and intent guards remain. An additional lower visible-edge hit and `menuReturn` geometry/after-Escape frame make the previously missing boundary independently inspectable. Runtime CSS/JS, executable fixture, manifest/lock/vendor and workflow are unchanged in this follow-up.

[R1 index](reviews/R1.md) and [R2 index](reviews/R2.md) link to the complete independent reports preserved verbatim. F1 is independently closed by R2; **F2 remains open** until the new actual baseline/candidate run and visual review, including narrow menu return. Index text separates reviewer findings from the author's response.

Local correction checks: runner/recognizer syntax and diff/bridge validation; [offline probes](reviews/evidence/clip-metric-probes.json) replayed the actual saved rectangles through the current rectangle arithmetic (18 snapshots), exercised 10 negative guard cases and 8 recognizer cases. A 1/64 CSS px real intersection still fails; a fully clipped-away row with zero visible area still fails row-fit; missing visible metrics, failed hits and extra scrolling remain failures. These are arithmetic/guard probes using old captured scrollport bounds, with the new boundary-hit input supplied only for guard isolation. They do not measure the new DOM clip chain or new hit points and do not produce browser PASS. The old JSON/PNGs are unmodified. New real render and narrow menu-return acceptance remain pending on GitHub.

## Reproduction and next action

See `products/sprintique/tests/fixtures/planning-selection/README.md`. Shared CI tools live only under `$RUNNER_TEMP/sprintique-browser-tools`; product runtime and lock dependencies are unchanged. Root publishes the branch and reviews the immutable patch. A1/A2 and visual acceptance remain open until the GitHub results and rendered frames have been assessed. This is a reviewable candidate, not a release-ready claim.
