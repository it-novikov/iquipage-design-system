# Task overview state — frozen implementation handoff

## Decision and source boundary

This checkpoint belongs to base `4f181ff3589a32fd9ce152f99018d212d74624b6`, tree `a025d8054ffe5461ac628bb2c442a8dc3ae17690`. Root owns publication and further integration. The source change is only `(q||review)&&` added to the existing additional overview-status condition. It preserves the main `overview.text || overview.status` fallback. The work model, full Work status, result160, permissions, attention, create/disclosure and all CSS are unchanged.

**Current-main drift was reported by root during handoff.** Root verified merge PR87 `220af664ef561d3f5ff1b873122281ef352e8f25`, including removal of review preview, neutral no-answer overview and appended VT1 CSS. The one-condition source delta in this checkpoint therefore is not a patch to new main. Root will preserve this plan/source and authorize a separate bounded repair on `220af…`, retaining its focusin change. This author did not rebase, overwrite those external changes or revise the frozen plan. Root also reported external PR83-head drift; this work does not incorporate Estimate.

## Deliverable scope

- Runtime: `products/sprintique/ui/src/board/task-work-view.js`, one condition change.
- Runner: `products/sprintique/tests/task-overview-state-browser.mjs`.
- Fixture: `products/sprintique/tests/fixtures/task-overview-state/{acceptance-plan.json,data.mjs,index.html,consumer.js,README.md}`.
- Workflow: exactly two appended companion steps in `.github/workflows/tabs-geometry.yml`; every byte of the prior workflow prefix matches base.
- This Bridge task, local-check logs and frozen source/build manifest.

The existing `tabs-geometry/repository.js` is imported unchanged and only its exact GET work response is overridden. The browser mounts actual current `openTaskDialog` and its `mountTaskWork`, public DS54 and actual product CSS. The behavioral oracle uses literal fixture expectations, not work-model helpers or source-string assertions.

## Verification

| Check | Actual local result |
| --- | --- |
| Syntax: runtime, runner, consumer and data | PASS |
| Existing work-model tests | PASS, 14/14 |
| Public boundaries and styles | PASS |
| Actual fixture Vite build | PASS, 136 physical inputs / 12 outputs |
| Installed DS54 versus archive | PASS, all 176 files byte-equal |
| Native Chromium | NOT_RUN; known local blocker, not retried |
| Human/visual/Compact/backend acceptance | NOT_RUN |

The temporary node_modules symlink was removed after checks; no shared dependencies or package/lock changes. Local detailed evidence remains at `products/sprintique/output/task-overview-state/build-only/results.json`; exact command results are in `local-checks.json`.

Native semantic cases: completed+rejected; completed+blocked; review with literal short result and actual review CTA; neutral question with `canAnswer=false` and actual question CTA; genuinely complete with an approved done step. Their scope is overview semantics and existing navigation, never approval, answer or backend save. The session-level completed label is deliberately still expected in the full Work header.

Long-review 1280×900 and 390×844 are separate passive cases with `CAPTURED` status. Initial viewport screenshots and raw title/summary/CTA/preview/property/disclosure/text-range/scrollport geometry support the next Compact assessment. No geometry PASS or perfect-fit oracle. The literal long title/result come from the earlier diagnostic, but Task data and current composition are explicit new inputs; old numbers are not transferred.

Failures retain measurement state and an attempted failure PNG; per-case JSON and aggregate progress are written before context shutdown. Build/source/package provenance is persisted before browser launch. No force clicks, focus or scroll repair, retries or post-mount product patches.

## Workflow decision for root

Both new steps currently require `!cancelled()` and PR head `fix/task-overview-state`, as the delegated scope requested. This runs the candidate and preserves artifacts even after a previous step fails, but **does not establish a permanent semantic regression gate**. Root raised the future-gate question before freeze; the author left its decision to root.

The simplest permanent option is to use `!cancelled()` for both steps and keep all seven small cases. If only semantic cases should remain permanent, one explicit runner mode can select the five semantic cases and report the two passive captures as NOT_RUN outside the designated branch; that change needs a revised plan explaining conditional capture applicability. No additional test framework or dependency is needed. No workflow changes were made after this handoff freeze.

## Independent review and next step

`task_scope_review` independently read base source and approved the problem/scope and five behavioral expectations, including three oracle constraints incorporated here: only the overview omits the completed label; question-without-answer stays neutral but retains its explanation; fixture priority must not accidentally select another question/review. It did not review the final implementation or perform a native run. A follow-up final-diff request was rejected by the collaboration runtime with `agent thread limit reached`; root will assign an available independent reviewer.

Next: root preserves the immutable source/plan, assesses the new-main repair, then reviews the resulting exact diff and native harness before publishing. No commits, push, Git ref updates, merges or deploy were made by this author.
