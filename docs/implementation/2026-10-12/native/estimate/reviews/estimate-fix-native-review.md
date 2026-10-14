# Estimate popup fix — independent native review R2

**Verdict: APPROVE for the frozen targeted native plan A1–A3 at PR #83 head `6423443d71a0817570281cf28822a3c14f7db684`, tree `81fa1c2800632324b09afd86d01b6fd671ccc6a5`.** The actual evidence supports marking **F-EST-01 verified repaired for the exercised Board-to-Task estimate path** and **F-EST-02 verified repaired for estimate horizontal composition in the four specified Task profiles**. No blocking defect was identified in this reviewed scope. This is a new native and visual review, separate from source R1 and from broader release acceptance.

## Immutable evidence and provenance

| Item | Exact reference |
|---|---|
| PR head | `6423443d71a0817570281cf28822a3c14f7db684` |
| Native CI checkout | `7dbb86d6130fef17cecb4810610cfae0976089c0` |
| Head and checkout tree | `81fa1c2800632324b09afd86d01b6fd671ccc6a5` |
| Checkout parents | `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`, `6423443d71a0817570281cf28822a3c14f7db684` |
| Run / job / artifact | `38238395802` / `114774633940` / `11740684903` |
| ZIP | 2,088,348 bytes; SHA-256 `a40d26f6293649b85a02a4b4781f96ddd8ab58956e46764519c660a4ad6d599f` |
| Raw results | SHA-256 `ba5c1e84bbce367dbeb33e9a1ac1c20ffb8465d660b228e132cdb0b1ac244a38` |
| Frozen plan | SHA-256 `853bc181d9f4e4db33f5676b4efd515a49cb89210a2f5e79cb307e08aecba42e` |
| Native runner | SHA-256 `3278407f353501f6d77f5328e2497d0ed18719dd780d88a6696b4c0075282f1e` |
| DS | `0.6.0-vnext.54`; archive SHA-256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Environment | Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `24.20.0`, Ubuntu 24.04; ru-RU, UTC, device scale factor 1, reduced motion |

Primary files: [raw results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-candidate-estimate-11740684903/browser/results.json), [artifact ZIP](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-candidate-estimate-11740684903.zip), and [job log](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-native-job.log). Runner, plan, fixtures, and workflow were read using `git show` at the exact head above.

I independently verified the checkout object and its parents/tree, the ZIP digest/size, all 38 extracted files against ZIP bytes, all 20 screenshot digests, and all 17 compiled output digests. All 15 recorded source fingerprints and all 75 product files in the build input graph match frozen Git source. Input-graph digest `95643bd86a4815c3c66af9bc82c3adcb9aa0cb28e736db716a1451af4a240f40` and compiled-set digest `d62cd9b4c1da4c719c0177b47c5464b8548afccf3d9ce53a1223e32f3805f7a4` also match. The runner checks all 176 installed DS files against the pinned archive. Recorded source changes/untracked source, page errors, console errors, and off-origin requests are empty.

The three runtime/style files retain the source R1 fingerprints. The head adds the harness, continuously configured workflow steps, and review records; it does not change the approved runtime fix. [Source R1](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-fix-source-review.md), SHA-256 `b8b30e10801c31cd9e8dd5f7141a4ceb579d3b015c808c9fa71e6d89d1f80186`, remains unchanged.

## Oracle review and actual outcomes

The frozen `products/sprintique/tests/estimate-popover-browser.mjs` uses ordinary Playwright clicks and keyboard events. Its snapshots read DOM state and geometry; they do not repair focus, scroll, or popup placement. Two animation frames allow state to settle. There are no forced clicks, retries, monkeypatched native popup APIs, or substituted product editors. The isolated fixture deliberately calls native owner close/removal and anchor removal as lifecycle stimuli.

The actual Task fixture mounts the product Board, opens its editable Task through its own card, and imports the existing product CSS in order. Its repository supplies synthetic reads and rejects unsupported writes. The isolated fixture imports the actual product estimate/menu helpers and packaged DS; its outer host and callback counters are synthetic.

| Cases | Evidence reviewed | Outcome |
|---|---|---|
| Four actual Task profiles | Runner lines 120–134; each raw after-open/final state; all four after-open PNGs | Native popup open; actual focused element is `input[name=estimate]`; owner is an open modal native dialog; popup belongs to that owner; forms are not nested. Native typing enters `9.5`. Escape removes the popup, preserves the Task and its displayed estimate, and restores trigger focus. |
| Outside time save | Lines 136–146; raw states/counters; after-open PNG | BODY-hosted editor focuses its input; changing to days returns focus to that input. Enter invokes exactly one synthetic callback `{value:2.5,unit:"d"}`, closes the popup, and restores its trigger. |
| Outside points keyboard cancellation | Lines 148–156; raw states/counters; after-open PNG | Tab/Enter opens the existing SP editor; typing and Escape work; no save callback occurs; trigger focus returns. |
| Outside menu keyboard | Lines 158–170; raw states/counters; after-open PNG | Initial focus is item 0; ArrowDown skips disabled item 1 to item 2. Escape restores the trigger and makes no selection. Reopening, End, Enter produces exactly one `duplicate` callback and closes the menu. |
| Owner close | Lines 172–190; raw states/counters; open/final PNGs | Focus begins inside the popup. Native owner close records `close-owner`, `owner-close-event`; popup disappears, owner is closed, no save occurs. Final focus is the outer open-owner trigger. |
| Owner removal | Same lifecycle source; raw states/counters | Owner and popup disappear; no save occurs; final active element is BODY. |
| Anchor removal | Same lifecycle source; raw states/counters; final PNG | Anchor and popup disappear; owner remains open; no save occurs; final active element is BODY. |

All ten declared cases ran and passed. For each Task case, `unsupported=[]` and `attempts=[]` accompany unchanged trigger text. This supports cancellation without an adapter write during the exercised case. The typed intermediate value, disabled-item navigation, and unit-refocus checks are sequential runner assertions; they are not separately captured intermediate screenshots.

The menu's final state follows selection, not its earlier Escape checkpoint: its active element is BODY. This matches the existing `close(); onPick(...)` selection path and is not evidence of trigger restoration after selection. Similarly, removal cases establish absence of an orphan and save callback; they do not establish a subsequent keyboard focus destination. Native cases do not measure listener/observer counts or long-duration leaks; cleanup structure was assessed in source R1.

## Geometry and visual assessment

The after-open snapshots precede typing. In each Task profile, popup `clientWidth` and `scrollWidth` are both 278 px, with a 280 px outer width. Every measured input, unit group/button, hint, action group/button and applicable rendered-text rectangle stays horizontally within the popup. Independently recalculating the recorded geometry yields zero positive horizontal overhang and zero non-input horizontal scroll excess. The input's editable buffer is deliberately excluded from the non-input text-overflow oracle.

| Actual Task profile | Viewport | Popup horizontal bounds | Popup vertical bounds | Input width / font size |
|---|---|---|---|---|
| Desktop light | 1280 × 720 | 765–1045 | 384–539.5 | 109 / 14 px |
| Narrow light | 390 × 844 | 102–382 | 415–578.5 | 109 / 14 px |
| Narrow dark | 390 × 844 | 102–382 | 415–578.5 | 109 / 14 px |
| Narrow text200 | 320 × 900 | 32–312 | 434–796.1875 | 254 / 28 px |

All four actual Task after-open screenshots visibly show the input, all three time units, the complete hint, and both actions. The input has a visible focus treatment. At text200 the input and unit group wrap into separate rows, the hint occupies three lines, and the two actions stack. The Save action ends at y=783.1875 and the popup at y=796.1875, both inside the measured 900 px viewport. No hidden right-hand unit or clipped action label remains in these captures.

**Measured limits:** A3 asserts horizontal containment. The vertical fit above is an observation from these raw rectangles and inspected PNGs, not a short-viewport or on-screen-keyboard test. `text200` sets the HTML root to 32 px and leaves visual viewport scale at 1; it is not browser zoom. The input remains 36 px high with computed line-height 42 px at text200. Its visible placeholder is readable, and typing is asserted, but DOM Range returns no glyph rectangles for the input's internal editing buffer and no enlarged-text typed-value PNG is captured. This evidence does not establish every input glyph/long-value rendering case. The enlarged Task background also has truncated property labels/values; this targeted popup review does not certify the whole Task form at 200% text.

### Personally inspected images

I opened 12 candidate PNGs: all four `task-*-after-open`, desktop-light and narrow-text200 `final`, the three `outside-*-after-open`, `owner-close-after-open`, `owner-close-final`, and `anchor-removal-final`. All 20 candidate PNG hashes were verified, including the eight not individually opened. The raw result's `visualInspection: NOT_RUN` is preserved; this report records the additional independent inspection.

| Required Task after-open image | SHA-256 |
|---|---|
| `task-desktop-light-after-open.png` | `7b9bebefa2b93254cb463b36533a13ad77d3c2363722f63403c0a5914814bb51` |
| `task-narrow-light-after-open.png` | `890bc4c689fd9729a8b0e8d68d715724ebe8cf86cebc3dbc36e672ba17c84943` |
| `task-narrow-dark-after-open.png` | `684955e919ee0c60fefe921e820db56f6fb9ae471fb5904d9dae2591c559c7cd` |
| `task-narrow-text200-after-open.png` | `cf49fe62e5dd37bd0066a4939cfc0588cb2bba4c990d7f8a5884a4e3ff0b5c85` |

## Comparison with the preserved failure

I reopened the attempt 3 baseline after-click/failure PNG pair from `task-prototype-attempt3-11739838266`. Its [raw results](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-attempt3-11739838266/results.json), SHA-256 `13b4d157cffdf3653b7fe3073b4bb25e7ee29bc1ae5f4a0f233b3a262512f610`, remain unchanged. The [correction](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-estimate-source-correction-attempt3.md), SHA-256 `e747f5793be5ef5979923648c86f9a86b0d813ba935448dff6084e846df7eb42`, is the historical diagnosis; source R1 refines its Task cancel-handler attribution.

The old evidence shows BODY hosting, focus left on the trigger, then Task disappearance and an estimate popup left over the Board after Escape. Its open-state oracle had passed; the closed-state oracle failed. It also visibly clips the unit group, hint and action at the popup's right edge. The new native evidence shows modal ownership and input focus, followed by popup removal with Task and trigger preserved, and complete horizontal content.

The before and after datasets differ: the old Task is SPT-101 with a 3-hour estimate; the new actual Task is TFX-101 with an empty estimate. This is behavioral and component-geometry verification across actual product fixtures, not an identical-content pixel comparison. The isolated time case additionally opens the actual editor with an existing 3-hour value. The former opening-timeout interpretation is not reinstated.

## Scope boundaries and handoff

This run covers actual Task cancellation and isolated estimate/menu/lifecycle contracts. Actual Planning integration, the date editor/calendar redraw, nested owners, later-owner closure after popup replacement, and rapid replacement races were not exercised here; their source assessment is not upgraded to native PASS. Full Task save, backend persistence, authentication, human observation, final aesthetic preference, performance, genuine browser zoom, Firefox/WebKit, iOS touch, and assistive-technology acceptance remain outside this plan. Other Maps/Tabs results and the broader vnext CI are separate evidence and contribute nothing to this verdict.

No new tests, browser sessions, source edits, report edits, or remote actions were performed by this reviewer. Only this new report was written. **Handoff: targeted native A1–A3 and inspected estimate composition approved at the exact head/tree above; no fix request within that scope.** Root owns preservation, finding-state updates and subsequent merge/release decisions.
