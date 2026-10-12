# Task overview: recover the result and a clear next action

Current main `220af664ef561d3f5ff1b873122281ef352e8f25` repairs disclosure focus in PR87 but also removes the accepted PR84 result preview, neutral question and associated CSS. This candidate restores those bounded presentation behaviors and limits the extra status row to questions/reviews. The ordinary `text || status` fallback and full Work heading retain genuine completion. Result160, stored states and permissions stay unchanged. The entire current `task-dialog.js`, including the PR87 disclosure fix, is preserved.

The original plan is preserved as `acceptance-plan.v1.json`, SHA256 `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8`. Revision2 `acceptance-plan.json`, SHA256 `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d`, was written before recovery runtime edits. It explains the main drift and permanent applicability of all seven small cases. Predecessor local results refer to the original4f181ff scope and are not evidence for this new composition.

The two companion workflow steps use `!cancelled()` on every applicable run. The seven cases form a permanent targeted regression; the two long-review captures still do not approve geometry or aesthetics.

## What runs

The fixture uses real `openTaskDialog`, `mountTaskWork`, the public DS54 package and the same product CSS imports as the existing tabs fixture. Its existing `tabs-geometry/repository.js` is imported unchanged; only the precise GET work response is overridden. Initial Task fields are explicit synthetic data passed to the real dialog. No product model helper is imported into the behavioral oracle.

Five native semantic cases cover completed+rejected, completed+blocked, short literal review, question with `canAnswer=false`, and genuine completion with an approved step. Each begins with the Task overview and clicks its existing CTA to the matching full Work view. Review does not approve/reject, and question does not submit an answer. Adapter attempts/unsupported operations and browser errors remain observable.

Two further cases passively capture long review at 1280×900 and 390×844. They share title/result strings with the earlier diagnostic, but use the current product composition and their own explicit Task data. No previous geometric measurement is transferred. Their status is `CAPTURED`, never a Compact or layout PASS. Geometry includes summary/title/CTA/result, the first four properties, disclosure box and text ranges, description, actual scrollports and current scroll. DOM ranges are not exact painted glyph masks; human interpretation of screenshots is separate.

## Run and evidence

From `products/sprintique`:

```sh
node tests/task-overview-state-browser.mjs --build-only
PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/task-overview-state-browser.mjs
```

The native command requires the workflow's existing Playwright 1.62.1 and installed Chromium. It is not run locally in the restricted environment. No extra dependency or browser installation is added by this task. CI source must be a clean committed checkout; local build-only records actual dirty files. Override `TASK_OVERVIEW_EVIDENCE_DIR` for an artifact directory and `TASK_OVERVIEW_SOURCE_REVISION` for the independently supplied CI checkout SHA.

The default output is `output/task-overview-state/{build-only,browser}`. It includes plan/source/package/Git-tree fingerprints, a byte check of every installed DS file against the pinned archive, fixture data, complete physical module-input and compiled-output hashes, per-case JSON and viewport PNGs. `provenance.json` is saved before browser launch; each case and aggregate progress are saved before context shutdown, including assertion/capture failures. Screenshots never force element scrolling. The fixed Date uses [Playwright setFixedTime](https://playwright.dev/docs/api/class-clock#clock-set-fixed-time), leaving timers running; environment metadata records the exact instant.

`nativeAcceptance: PASS` applies only to the defined semantic assertions and capture completion. `compositionAssessment`, `visualInspection`, `humanAcceptance` and `backendAcceptance` remain `NOT_RUN`. The base does not contain PR83; no Estimate interaction is attempted. Backend writes/grants, creation, disclosure redesign, Compact and pre-release cross-browser/screen-reader checks are outside this correction.
