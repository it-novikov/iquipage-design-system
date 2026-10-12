# Task: comparative first screen experiment

This is a small, synthetic consumer of the frozen Sprintique frontend and public DS54. Each run builds the same baseline Task and one explicitly selected candidate, then captures identical data in each. The original VT1 and the later compact summary are separate frozen overlays/plans. The deliverable is a comparable set of actual browser images and readable measurements for a composition decision. It is not an accepted production UI, a human study or a persistence test.

The starting product revision is `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`; exact source/tree/package/patch hashes and questions for each frame are in [comparison-plan.json](comparison-plan.json). The source interpretation follows design addendum `8118b3fc868153c9e68cc6080b6f3058b914ac3fe01cdfa2a534de55ccb171c3` and independent review `a690c90b5a5af055510f4f243b224dd1c502b97060650814b7eb96294db73c5f`.

The next CI run selects [comparison-plan-compact.json](comparison-plan-compact.json). Its [decision addendum](design-decision-compact.md) records the actual narrow regression, the agreed compact alternative, its 64-code-point trial and the correction that the original Estimate timeout happened **after Escape**, after opening had succeeded. The original patch and plan remain byte-identical; old captures are not relabelled.

## What is compiled

| Build | Source used at the initial mount |
| --- | --- |
| `baseline` | Original product modules, with zero source overlays. |
| `vt1` | The same original modules, except the three exact files in [vt1.patch](vt1.patch). Their frozen bytes are copied to a temporary directory and patched before Vite loads them. |
| `vt1-compact` | The same baseline plus [vt1-compact.patch](vt1-compact.patch), compiled separately. Property grouping and neutral question copy equal VT1; only the summary is more compact. |

The patch changes the Task template, the existing work summary presentation and neutral question status copy. Existing Task properties use four direct rows and one native `details` before the existing “Описание” heading and editor. All remaining seven rows are in the same form from the first mount. The editable and static templates have structural parity. An explicit existing-task condition keeps the creation template on its baseline path.

Review summary uses the existing `workFocus` selected step and existing CTA, followed by an escaped literal `workText(result)` prefix. Original VT1 uses a provisional budget of 160 Unicode code points including an ellipsis. Compact uses 64, combines state and agent in one naturally wrapping heading, and places the full/partial result label inline. It keeps the existing frame and full step title. The budget does not promise two lines or a complete sentence. Empty text is explicit. Question status depends on `canAnswer`, independently of Task edit permission. There is no generic status addition to other focus branches, second full work step, new grant, selector rule or data contract.

The fixture imports the actual Board, navigation, Task and product stylesheet order used by the existing tabs-geometry consumer. It has no variant flag, extra layout CSS, post-mount node movement, cloned fields or remount-based composition. The outer bootstrap and adapter reads are synthetic; this is an **experimental compiled product**, not the full signed-in application bootstrap. A chosen production implementation would edit the source directly for its initial DOM.

## Run

From the repository root, using the already installed product dependencies:

```sh
node experiments/task-first-screen/run.mjs --plan compact --build-only
```

If dependencies are already installed in another exact product checkout, the build can read that `node_modules` directory without adding a symlink or modifying product files:

```sh
TASK_FIRST_SCREEN_NODE_MODULES=/absolute/product/node_modules \
  node experiments/task-first-screen/run.mjs --plan compact --build-only
```

The native run uses the existing temporary Playwright 1.62.1 installation and its Chromium:

```sh
PLAYWRIGHT_MODULE=/absolute/browser-tools/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/absolute/browser-cache \
  node experiments/task-first-screen/run.mjs --plan compact
```

The only plan choices are `--plan original` (the default, baseline + VT1) and `--plan compact` (baseline + VT1-compact); `--build-only` remains available for either. These are runner choices before compilation, not production flags. Original outputs keep `output/build-only/` and `output/browser/`; compact outputs use `output/compact/build-only/` and `output/compact/browser/`. Rerunning replaces only the selected generated directory. No dependencies or browsers are installed by this runner. Each native run builds two static bundles and serves them with Vite **preview**, not the development server. Public package exports resolve to the selected installed package; the entire installed DS file set must equal the accepted tar bytes first.

For this environment the local native runner is already known to be blocked by missing `/proc`; this experiment does not retry Chromium, TypeScript 7, JDK or PostgreSQL locally. Local syntax and Vite builds are useful checks, with status `BUILT_NOT_RENDERED` and zero frames. Actual native evidence comes from the existing Ubuntu 24.04 / Node 24.20.0 GitHub Actions job. The companion step is restricted to a PR whose head branch is `experiments/task-first-screen`; it reuses installed tools and leaves all prior PF03 steps intact. It now runs `--plan compact` and uploads `task-first-screen-compact` separately. A workflow dispatch from an unmerged workflow is not a prerequisite.

Publication is draft PR #82 based on `fix/tabs-scroll-geometry` (PR #77), the frozen predecessor at the revision above. The comparison retains that base even after main advances, keeping the review delta to experiment/task/workflow files and the dependency explicit. No existing gate is disabled. Root owns the push and PR operations.

## Small staged comparison

The first four PNGs are H01 and H02 at 1280 × 720, each baseline then the selected candidate. Both plans preserve the same seven cases and 14 initial PNGs. H01 has real Markdown containing a goal, readiness criteria and a next step. H02 has a server-shaped work read, with the history result and criterion from the existing `work-preview-seed.ts`. It contains no open question in the main review case. The fixture is authored synthetic data; it is not a claim that the server persisted it.

The remaining pairs answer specific outstanding questions:

| Pair | Reason |
| --- | --- |
| Long review, 390 × 844 | Title/result wrapping and the cost of the summary on a narrow screen. |
| Same long review and width, dark | Readability and visual hierarchy under a second theme. |
| Ordinary Task, text200 | Record the known DS54 property label/value clipping; fewer rows do not prove reflow is repaired. |
| Review without result text | Explicit lack of text, without substituting the title or session summary. This is an incomplete read edge, not a valid new done-step command. |
| Open question, `canAnswer=false` | Question priority and neutral copy while Task remains editable. |

These are finite questions, not a cross-product test matrix. C, VT2, 320px and additional contexts are deferred until a specific observed conflict needs them.

Each initial screenshot is the viewport, with actual Board opening, neutral pointer at (0, 0), settled fonts, and the existing initial focus. The runner reads scroll positions and geometry before screenshot and before any focus, keyboard or scroll probe. It never scrolls the description into view to improve that frame. Results include title, first meaningful paragraph, selected summary/result/CTA, property labels/values, active element, initial body/window scroll and ancestor scrollports. Layout clipping and visible height are observations, not visual PASS assertions. No off-origin request is allowed.

After all initial pairs, separate fresh contexts exercise real select/date/estimate opening and Escape cancellation; native Tab → disclosure → Enter; node/form identity through tabs, resize and existing fullscreen; and the existing review/question transition. The tags value and single mount are recorded, but the tag picker is not interactively accepted. Plan is deliberately read-only because the adapter has no `applyPlanningChange`. No probe reports a successful synthetic write. The opened disclosure and review transition have additional PNGs, clearly separated from initial frames.

## Read the evidence

`results.json` names the selected plan file/id/version and candidate, alongside the frozen production tree IDs, current source revision/tree, overlay before/after hashes, fixture and scenario hashes, accepted tar/lock hashes, installed package verification, Vite input graph hashes, all emitted bundle hashes, PNG hashes, actual browser version, full measurements and operation logs. Compact also verifies the frozen original plan and new design-decision bytes. A shallow checkout is sufficient: the runner verifies the current production subtree IDs against frozen IDs without fetching or reading the old commit object. Root publication separately checks the complete production delta.

`CAPTURED` means PNGs exist and listed engineering checks passed. `FAILED` retains available captures and a concrete error. Neither status proves visual acceptance. `visualAcceptance`, `humanAcceptance` and `backendAcceptance` remain `NOT_RUN`; an expert's preference is not a human PASS. Page errors and off-origin requests fail the run. Console errors are saved for inspection, not a blanket fatal gate, so the runner does not imply that the console was error-free.

Use the first pair to decide whether ordinary Task exposes useful real content while keeping direct controls accessible. Use the second pair to decide whether the selected review result and transition explain what needs checking. If a long summary still displaces description, or the disclosure imposes too much search/reopening, record that negative result before choosing C or a wide fullscreen comparison. Baseline→VT1 changes both property grouping and summary presentation; its full H02 effect cannot be attributed solely to grouping. A summary-only control is justified only if that causal question becomes decisive.

For compact, the specific next narrow criterion is fully readable due/priority with the full selected step title, CTA and honest literal excerpt retained. Disclosure/hint visibility is measured separately. Existing Estimate Escape failure stays fatal to the native probe and is not repaired by this overlay; checks after that failure remain unexecuted. A failed native result can still contain all 14 useful initial captures.

## Acceptance still required

Readonly and accepted existing tasks have structural template parity, but their actual first screens/actions are not accepted by this minimum. Creation, cover and personal supplement behavior/position are untouched by the patch and not runtime-accepted here. There is no new cross-browser or release gate.

Real H11 acceptance needs the existing backend and disposable tasks: edit actual values, exercise estimate/type/release/Plan, close/reopen, and verify persistence, conflicts, type/template/default-priority behavior and draft/error visibility. A concrete source-review risk remains **NOT_RUN**: start slow/failing Plan Apply, close the outer disclosure while busy, then observe error visibility and focus. The Plan popup's busy guard does not itself manage the new outer `details`; the read-only fixture cannot establish this outcome.

The frozen source-R1 approves only the original exact VT1 overlay; compact needs its own source-R2. R1's raw redirected work-model test run is 12 pass / 1 failure: the original `canAnswer=false` assertion expects the old “Нужно ваше решение” presentation. The failure is preserved as a documented changed expectation; no unmodified suite under this overlay is claimed fully green. Review artifacts are in [the task card's source-R1 packet](../../.bridge/tasks/20261012-task-first-screen-prototype/reviews/source-R1/README.md). The existing production tests and PF03 harness/plan are unchanged.
