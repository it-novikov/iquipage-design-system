# Same56 capture diagnostic — comparison revision3

This checkpoint changes observation, not DS layout or popup positioning. Native R2 remains CHANGES_REQUESTED. The goal is to determine whether the measured popup detachment persists when taking the image does not emit a window resize.

The original revision2 is retained as `experiments/property-list-reflow/comparison-plan.v2.json` (SHA256 `8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f`). Revision3 SHA256 is `940aa92a1ef88941f8d3dfed46b81cd3a649351e56388eb84f6efc46445503d5`. DS54/56 archive bytes, public fixture/data/styles, measurements, five profiles, acceptance and semantic assertions are unchanged. Library source, workflow and product delta to accepted main41ebe are empty. Root's staged index still equals native56 tree `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6`.

## Local evidence

- `local/checks.json`: syntax, immutable fixture/plan scope, staged index, library/workflow/product boundaries; three metadata-only negative controls reject the old fullPage packet and forged clean statuses with a changed post-PNG window or visualViewport resize counter. These are checks of the diagnostic, not fabricated browser evidence.
- `local/build-summary.json`, `build-only/{control,candidate}/{results,provenance}.json`: both fresh public consumers BUILT_NOT_RENDERED;36 compiled inputs and4 outputs each, exact176/178 package files and unchanged source proof. Generated compiled bytes are retained in the scratch location recorded by the summary rather than duplicated in this PR.
- `local/*-build.log` and negative-control logs: exact local command results. The full DS478/478 PASS belongs to the already completed native56 CI, not to these local checks; the unchanged library was not needlessly rerun.

## Diagnostic records to inspect in native CI

For each owner/date resize entry: `before` → `resized` → viewport PNG → `afterPNG` → two animation frames → `afterCaptureFrames` → `cancelled`. Each state records monotonic observation time, trigger/popup rect, value/focus/expanded, viewport/host, window scroll and event counters, plus visualViewport size/offsets/page offsets/scale and its own passive resize/scroll counters (explicit null if unavailable). `capture.fullPage` must be false. Both post-capture states must preserve viewport, host width, window scroll and window/visualViewport geometry and resize/scroll counters from `resized`; changes fail the observation check. Raw geometry is retained even when it naturally evolves. No code calls a DS positioning function, dispatches resize, scrolls to repair the anchor or reopens it for the screenshot.

The paired verifier exposes adjacency before/after capture and independently compares the invariant values; a declared clean status alone does not pass. Existing open/cancel, identity, exact select intents, single-line input, tag search and complete-text checks stay intact. Closed-editor full-document frames remain separate reading artifacts. The new native capture is **NOT_RUN** locally and A3 remains open. Use the existing guarded trial workflow and the same `compare.mjs --variant=control`, `--variant=candidate`, `verify-comparison.mjs` commands; no workflow or general gate change is needed.

Layout57 is not in this checkpoint. The provisional alternatives and targeted fixes are in `decision-r2.md`; root will authorise resumed writes after recording this immutable diagnostic checkpoint.
