# Task overview recovery — independent source review R1

**Verdict: CHANGES_REQUESTED for two P2 verification defects. The runtime recovery is approved within its stated source scope; the frozen runner must be corrected before it can substantiate the planned native acceptance. Native, visual, human and backend acceptance: NOT_RUN.**

Reviewer: `/root/task_estimate_review`, independent GPT-6 Astra source reviewer. Review completed 2026-10-12 UTC. This report evaluates the original frozen candidate below. A subsequent correction requires a separate addendum; it does not change this verdict or these bytes.

## Exact subject and method

| Identity | Frozen value |
| --- | --- |
| Candidate commit | `3655be30bf717b1906a0086ad57e0a5d53b36610` |
| Candidate whole tree | `6ba46a934c423b466b0dc534b3686b133e522748` |
| Base / parent | `220af664ef561d3f5ff1b873122281ef352e8f25` |
| Base whole tree | `150b100c88e876204556f9073d830a1b3d55e320` |
| Accepted PR84 predecessor | `4f181ff3589a32fd9ce152f99018d212d74624b6` |
| Predecessor whole tree | `a025d8054ffe5461ac628bb2c442a8dc3ae17690` |
| Acceptance plan v2 SHA-256 | `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d` |
| Preserved plan v1 SHA-256 | `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8` |
| DS package | `0.6.0-vnext.54` |
| DS archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |

Primary material is the complete base-to-candidate Git diff, frozen source and fixture, workflow, recovery card and historical predecessor records. I read the actual Task/Work navigation and DS primitives used by the fixture, plus the server read projection and approval vocabulary where they bear on the synthetic data. I independently compared Git bytes and recorded hashes. This was a read-only review: no application or test changes, Git mutations, browser launch, backend execution or full CI rerun.

The full diff is 22 files, 1,450 insertions and 6 deletions: three runtime files, one model test, the workflow append, seven fixture/runner files, and ten recovery/history records. Runtime provenance is materially narrower than that total. The removal of accepted behavior in PR87 is visible in the source history. The description and motive of that removal are separate facts: root verified the PR metadata; the cause of the broader deletion remains unestablished. Source: recovery `decision.md`, the exact `4f181ff… → 220af664…` history and `220af664… → 3655be30…` diff.

## Findings requiring correction

### R1-P2-01 — Product and fixture are omitted from the claimed complete build-input inventory

**Severity: P2, verification/provenance. Status at this head: OPEN.**

`products/sprintique/tests/task-overview-state-browser.mjs:15` assigns `product` from a directory URL using `fileURLToPath(new URL('../', import.meta.url))`. The resulting path ends in `/`. The inventory filter at lines 238–239 tests each normalized physical module ID against `product + '/'`, which therefore ends in `//`. Product modules fail that prefix test. The realpath-derived dependency prefix does match.

This is visible in the actual frozen `local-build.json`, not just inferred from a possible path spelling: its 136 input hashes are **41 DS files plus 95 Zod files, with zero product or fixture inputs**. The declared graph hash correctly describes that incomplete map. Consequently the OV-PROVENANCE claim of complete module-input hashes is not met. Source: runner lines 15, 233–244; acceptance-plan.json lines 169–177; recovery `local-build.json` SHA-256 `bf45eeadbcb578f635226d82c9d294dfc9d9a76cf445ebee43229b1d6f3edb4b`.

This does **not** establish that the product was absent from the build. The runner separately checks the actual three product modules in `modules` using `join(product, path)`, which normalizes the directory path. The output contains a compiled fixture, and the separate 13 source fingerprints match this Git candidate. Those checks and the frozen tree remain useful; they do not make the incomplete input map complete.

**Minimal required change:** normalize the product root once, then require the three actual runtime modules and the fixture consumer to appear in the emitted input-hash map. Record one corrected build-only result and its source manifest. Retain this original build record unchanged. A new native scenario or broad CI run is unnecessary to establish this path correction.

### R1-P2-02 — The literal fixture cannot detect loss of HTML escaping

**Severity: P2, behavioral witness. Status at this head: OPEN.**

`tests/fixtures/task-overview-state/data.mjs:4` uses the short result `История «<готово> & проверено» сохранена после обновления.` The native review case checks exact text and that the result paragraph has only its one label element (`task-overview-state-browser.mjs:122–123`). The element-count assertion explicitly says it detects angle brackets becoming markup.

However, `готово` begins with a non-ASCII character. HTML's tag-open state creates a start tag on an ASCII alphabetic character; the relevant other-character path emits the `<` as text and reconsumes the following character. An ampersand followed by a space also supplies no entity witness. Thus this sample can retain the same text and child count even if the result interpolation stops escaping HTML. Primary parsing source: [WHATWG HTML, tag-open state](https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state), ASCII-alpha and anything-else branches.

The production renderer **does escape the result**, and the full Work primitive also escapes its text. This is not a finding of an injection defect in the restored runtime. It is a hole in the particular regression oracle that claims to protect literal rendering.

**Minimal required change:** keep the existing short review case and its exact-text/child-count assertions, but give them a discriminating benign literal such as `<em>готово</em>` and literal `&amp;`. Losing escaping would then create an element and alter the displayed text. Keep the long-review strings and acceptance criteria unchanged. No additional test case, permission gate or general security audit is required.

## Runtime recovery and user meaning

| Reviewed file | Verified recovery boundary |
| --- | --- |
| `ui/src/board/work-model.js` | Byte-identical to accepted PR84 predecessor; SHA-256 `3b672ef6983017309ec2a1ad1ba6463b5208ae3a544ee264f73b9213a7ddfde1` |
| `ui/src/board/board.css` | Byte-identical to accepted PR84 predecessor; SHA-256 `4d201e7f54c098a48582fa564a8f6d2ca35298657dc64ea187714a96cfeb71cd` |
| `tests/work-model.test.mjs` | Byte-identical to accepted PR84 predecessor; SHA-256 `aa224349dbb414393e551420072ca2d11775229edb943aeddab8d1ee57a57055` |
| `ui/src/board/task-work-view.js` | PR84 renderer with exactly the additional `(q || review) &&` condition on its extra status row; SHA-256 `71f3eadee77c1cbd3636f552c85d06129494eeaff7ea922d612b560033ac12f8` |
| `ui/src/board/task-dialog.js` | Entire file byte-identical to base PR87, including the summary focusin guard; SHA-256 `a5a35c0300044bb6c9cb6b802ac1ca9e508b01e2466afb6cac9f147671f5be55` |

Paths in this table are relative to `products/sprintique/`. The existing tabs read adapter is also unchanged from the base and predecessor. No DS package, approval commands, persistence path or Estimate implementation is changed. The eight historical PNG deletions are not silently reversed; they are not needed by this runtime recovery.

For a reader of a returned or blocked step, the chosen title remains the main overview text. The extra, unqualified session status disappears. This is a presentation decision: the session may indeed be completed while its selected step needs follow-up. The guard applies to ordinary selected steps generally, not only to a completed-session fixture. The actual session status remains in the full Work heading. No state is rewritten.

For a reviewer, the accepted separate review status, selected-step title, result prefix and review CTA return. The restored preview is the existing plain-prose prefix with its 160-code-point budget, optional word-boundary adjustment and explicit continuation label; it is not a newly generated summary or an exact reproduction of source Markdown. The complete result remains in the existing selected step in Work. No new preview length or first-screen fit threshold is adopted.

For a person with `canAnswer=false`, the overview says “Агент ждёт ответа” and offers the secondary “Открыть вопрос” CTA. It no longer asks that person for a decision they cannot submit. Question priority over a pending result is retained. The fixture holds `canEdit=true` and `canDecide=true`; this is specifically a no-answer presentation case, not an all-read-only role or a proof of server permission enforcement. The server's separate permission expressions permit this combination.

For genuine completion with no pending question, review or problematic step, `overview.text || overview.status` still provides the nonempty “Работа завершена” main text. Restricting only the extra row preserves that fallback. Both `q` and `review` come from the renderer's already computed `workFocus(state)`; the guard does not create another priority implementation. Source: `work-model.js` workFocus/workResultPreview/workOverview; `task-work-view.js:35,54` and existing Work action handling; `task-dialog.js:279`; `server/.../work/application/TaskWork.kt:38–63`.

## Native runner: source readiness and limits

Apart from the two findings above, the planned browser checks have useful independent oracles. The fixture mounts actual `openTaskDialog`, `mountTaskWork`, installed DS54 and product CSS. It reuses the existing tabs adapter and overrides only the precise work GET. The behavioral oracle does not import the work model under test to compute its answer. Synthetic `pending` and `unreviewed` approvals are established source vocabulary; the fixture does not claim to validate backend transitions or evidence requirements. Sources: fixture consumer/data, unchanged tabs repository adapter, server `TaskWork.kt:327–330` and `WorkPlanCommands.kt:249–266`.

The five semantic cases assert selected titles and action meaning, absence of overview decision controls, the actual Work panel and selected tab, and the selected full step/question after ordinary strict clicks. Review focus targets its real summary; the no-answer case requires disabled/unavailable answer controls and real question-heading focus. The rejected/blocked cases check the step-specific revision/answer state in Work while preserving the completed session heading there. The checks distinguish the overview scope from all text in the DOM.

I followed the exact locators into `IqTabs`, Task and work-story markup. The fixture's `[data-tab="work"]` is the existing sole trigger, with its role/selection state set by the component. The selected review uses `data-step="focus-S1"`; its first result paragraph is the actual selected result because that focused primitive receives no preceding summary text. Disabled question inputs and fallback heading focus match the implementation. I found no corresponding hidden locator defect in this source review. Native execution is still required to establish actual browser behavior.

The two long-review cases are passive desktop and 390px viewport captures before navigation. Raw rectangles/text ranges and PNGs are informational. They neither pass a Compact proposal nor prove readable painted glyphs or human discoverability. Runtime source identity is not approval of this geometry.

The adapter records unsupported operations and synthetic write attempts, and each completed case requires both lists empty. The runner also checks that the expected scenario was read and records page, console and off-origin errors. The CTA checks do not invoke accept/reject/answer commands. This can establish that these tested frontend paths attempted no adapter writes; it cannot establish backend persistence or authority enforcement.

The workflow has an exact byte-equal original prefix and exactly two appended steps: the scoped runner and its artifact upload, both `!cancelled()`. It reuses the existing temporary Playwright/browser setup. There is no branch-specific enablement added, no full native-suite substitute and no PR83 Estimate integration claim. The runner records plan/package/source/build provenance before browser launch, retains per-case evidence before context shutdown, and marks failures explicitly. Source: `.github/workflows/tabs-geometry.yml`; runner lines 158–266; acceptance plan.

## Available verification, remaining boundary and disposition

The original local record is **BUILT_NOT_RENDERED** on Node `v24.19.0`. Its source revision is base `220af664…` with declared dirty/untracked authoring inputs, not a claimed native run of commit `3655be30…`. All 13 separately recorded source hashes and all 12 entries in the recovery source manifest match the frozen candidate. The stored compiled set has 12 outputs; the reviewed stored graph/bundle digest calculations are internally consistent. The input inventory defect remains as described above.

The card records syntax, 14 model tests, boundary and style checks as passing, and 176 installed DS files matching the archive. It also retains the first failed boundary invocation from the wrong working directory, followed by the required product-directory check. I reviewed these records and relevant source; I did not rerun those tests or turn their results into native evidence. The predecessor checks explicitly belong to `4f181ff…` and are not transferred to this repaired composition. Original source-manifest SHA-256: `ba31487820c5a9eeabbd2a08e5d853f5db8d5da9cba8eed13a28318891ab18f3`.

**Required next action:** make the two bounded harness corrections, preserve the original local records, and obtain targeted source follow-up on the corrected frozen head. The runtime recovery itself requires no change from this review. After that, the existing seven-case workflow can supply native evidence for independent review.

Native Chromium, visual composition, human acceptance, backend writes/permissions, other engines and assistive technology remain NOT_RUN here. Create/type/template, disclosure interaction redesign, accepted Task result, Estimate integration and unrelated flows are outside this review. No broader matrix, new approval loop or speculative architecture change is requested.
