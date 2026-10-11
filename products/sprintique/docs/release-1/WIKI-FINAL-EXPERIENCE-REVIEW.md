# Independent final wiki experience review — R1

Decision: **APPROVE the immutable DS50 release candidate within the documented review scope** (2026-10-11, receipt14:50:57 UTC). WFR1-1 is CLOSED after independent actual DS50 retest; no open confirmed P0/P1/P2 in the exercised matrix. Product source was not edited. This is candidate approval, not a claim that production is deployed or that the explicitly limited browser scenario below was completed.

This is an independent expert walkthrough of the actual disposable authenticated SPQ stand at localhost:4318, not usability research with recruited users, and not acceptance of deployed production. Checkout: `wiki`, branch `feat/project-wiki`. Source/API correctness and permissions review by R2 remains a separate evidence source.

## Finding history

**WFR1-1 — P2 — mobile touch targets below the agreed 44px. CLOSED in DS50 after independent fresh-load retest.** On actual Chrome 390×844 with installed DS49, page menu commands История / Создать вложенную / Переместить / В архив measured 40px; document-bar navigation and Версии страницы measured 36px; version-dialog close and task-page-picker close / Отмена / Прикрепить measured 36px. Version rows and primary wiki actions measured 44px. This violates the explicit mobile menu/dialog acceptance criterion and makes recovery/navigation actions unnecessarily difficult to tap. Relevant public styling: `libraries/iquipage/src/styles/foundation.css:2657`; consumer navigation dialog: `products/sprintique/web/wiki.js:105`. Repair belongs in the public DS touch contract, preserving desktop density. Root accepted this finding and authorized DS50 repair; the original DS49 source freeze and approval receipt are historical.

DS50 closure: independently reloaded actual4318 with exact public package `0.6.0-vnext.50`, archive `90380ecbfdeff2cca0e0ced052eefa7ec3e3f4bad320cf6891b866e8156d27a3`. At390 all page-menu items and document-bar controls measure44px; history close/back/version rows44; task-picker close/cancel/attach44. Escape preserves history hash and returns to the opener; picker cancellation returns to its trigger. Scroll width390. At1280 the menu remains40px. Read package proof (69 matched files, no mismatches), raw library476/476 fail0skip0 and Linux Node24.20 gzip proof185160/101397 within unchanged185291/101612 budgets. Scope is a public narrow/coarse CSS correction, without runtime command/state changes. Browser viewport reset after review.

## Own actual walkthrough

| Scenario | Independently observed result |
| --- | --- |
| Fresh child deep link | Process page resolves its parent breadcrumb, selected tree context and focused H1; desktop document remains the primary surface. |
| Explicit edit/save/reload | Real title/body fields and formatting toolbar; saved body survives reload. Dirty navigation → Остаться retains exact body and focuses the editor. |
| Cancel unsaved edit | Confirmation → Уйти без сохранения discards only the unsaved replacement. |
| Two-tab CAS move, then archive | Peer moves the page while own text is dirty; first save conflicts and preserves own text. After review, peer archives it; second save conflicts again. Explicit restore confirmation and save preserve own text and latest parent Решения проекта after reload. |
| History 55 versions | Direct version-1 route reads version 1 and reveals the selected early row; Ранние версии loads the remaining rows without losing selection. |
| Restore historical version | Confirmation clearly describes a new version; actual restoration preserves page location/history and survives reload. |
| Archive/restore | Archived state removes editing; explicit restore with selected parent returns the page to active navigation after reload. |
| Search 53 results | Body query returns plain excerpts; Показать ещё expands 50 to 53. Parent identity is independently visible in task picker and restored page breadcrumbs. |
| Document outline | Selecting the second repeated Подготовка heading focuses the correct H3; the page hash remains unchanged. |
| Existing task links | Actual SPQ-2 attach → reload → remove → undo → reload → open passes. Picker and linked rows show parent context. Removing a link does not remove its wiki page. |
| Dirty discussion → wiki link | Отмена retains the exact unsent discussion draft and task route; explicit Не сохранять permits the transition. No discussion was sent. |
| Mobile 390, light and dark | Actual document and editor inspected in both themes, without document-wide horizontal overflow. Title height 35px; all 17 formatting commands are present. Mobile history Escape closes the dialog and returns focus to its opener. Task picker fits the viewport and restores focus to its trigger when cancelled. DS49 touch-target exception WFR1-1 is closed by the separate fresh DS50 retest above. |

Synthetic page `wiki-process` was used for these reversible QA operations and ends active under `wiki-decisions`, with the independently saved text. Synthetic existing task SPQ-2 retains its tested wiki link. These are QA data, not production mutations.

## Attributed evidence and release boundary

I read the actual historical gate certificate `output/verification/2026-10-11T14-18-36.491Z/verification.json`: 8/8 PASS; sourceStable=true; before/after fingerprint `b2b652249076df36e1e32d5dee75a732c45b250a91b0566f64ab36c62b6f7a26`; DS49 archive `c4ba43d6cf74313b7b43bb657bde818fc15a91e64e4764567fef51ebd7a48225`; DS474 and product/detached559 each, no failures/skips. This certificate does **not** approve subsequently changed DS50 inputs.

I also read `output/wiki-release/container-rollback.json`: root-owned isolated container probe PASS, migration079, main/fallback ready, retained task/material/wiki page/wiki-task-link, prior web match, nonroot10001/readOnly/capabilities dropped. I did not execute that probe myself.

Rights-revocation exact-draft recovery, reader controls, and access-notice appearance are author/root browser evidence, not my own role-switch experiment. Reviewed evidence: `WIKI-REDESIGN-AUTHOR-REVIEW.md`, `output/wiki-redesign/measurements.json`, and root `output/design-review/root-access-notice-geometry.json` / `root-access-notice-after.png`. Root geometry has notice y56–206.74, document and rail starting206.74 and ending720, widths1032/248, viewport/scroll1280. Author screenshots explicitly distinguish final captures from transitional/incorrect harness captures. The user guide matches observed explicit-save, conflict, history, archive and task-link actions and does not promise silent autosave of wiki text.

## Explicit limitations

Final creation of a **new** test task was rejected by automatic approval review in the author browser pass. It was not repeated or bypassed. Staged new-task page selection and independent model/API tests are evidence for their respective parts, but do not prove the final browser create-and-link round trip. Existing-task browser round trip above is complete.

No physical touch device, screen-reader session, real IME composition session, browser-engine comparison, recruited-user study, production deployment, production permissions or production data were tested by this reviewer. Reader/revocation/access-notice runtime results above are attributed. WFR1-1 closure, exact DS50 package/adoption proof and fresh full gate/source stability receipt are complete. Production verification remains after deployment.

## Current immutable DS50 approval receipt

Independently read the actual `output/verification/2026-10-11T14-40-23.871Z/verification.json` and raw test/source-stability logs. Certificate dated `2026-10-11T14:50:57.978Z`: 8/8 PASS, sourceStable=true, before/after `e9360a887834e09d8304ceea60bf9cac09c2ca52ee917ae4d75612e7e05c59ee`, exact DS50 archive `90380ecbfdeff2cca0e0ced052eefa7ec3e3f4bad320cf6891b866e8156d27a3`. Raw DS476/product559/detached559, each fail0/skipped0. No repeated builds or tests were run by this reviewer.

Read current root-owned `output/wiki-release/container-rollback.json` dated14:42:34.408Z and `artifacts.json`, attributed rather than independently executed: PASS main/fallback readiness on079, retained task/material/wiki page/wiki-task-link, previous web match, isolated network, uid10001/readOnly/capabilities dropped. Artifacts carry the same `e9360a...` fingerprint; main image `sha256:6b188325e8f97423568fce233403f67023fb1b5f3066471361006801ef5f945e`, fallback `sha256:48ecb698ab2bdc9ebcc976be5f8a91cae11f217369057f4aaaa28e6e7eb79de2`, main web index `dfd44d0a98ebfbc933b6416cd7f9fe2e34f2bf3df36c6376679e9e8a7e081d42`. Both loaded manifests match their archives.

APPROVE applies to these immutable inputs and the expert walkthrough scope above. Historical DS49 receipt and WFR1-1 history are retained. New-task final-create browser gap remains explicit; CI and production cutover/post-deployment checks belong to the root release process.
