# Estimate popup: targeted source diagnosis

**Status: source hypotheses; native cause unresolved.** This is an independent, read-only investigation of the estimate opening timeout in attempt 2. It does not approve the prototype, diagnose a confirmed product defect, or change product/DS/fixture code. The next useful evidence is the already planned passive native estimate trace, with the original click and `:popover-open` assertion retained.

## Evidence boundary

- Frozen product checkout: `repo-tabs`, HEAD `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`; product tree `277e232729b1cca297f4091384e6488bfbd952ca`; DS tree `f623bc26da31a0abd282496f2bc943c27a88d2b1`. It was clean when read.
- Experiment checkout observed at HEAD `0c74ab69487fa5d7ec66ead92400043901e85af2`, tree `31a104b961394c1bf5c9a27c414df94c00aa1db0`. Attempt 2 reports revision `80ebf480ce479f77b04a261be77fa68605ee9f29` with that same tree. Author is separately preparing diagnostic fixture changes; references to `run.mjs:217` below refer to attempt 2, not subsequent working lines.
- Native record: [results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-attempt2-11739432628/results.json), SHA-256 `c7b4fc68a14669ed93f457bf16689454f03944106d1f037c39a9e1dcfafcd5ba`. Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `24.20.0`, H01 ordinary task, light, 1280 × 720, reduced motion, synthetic read adapter.
- DS `0.6.0-vnext.54`, archive SHA-256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`. The installed DS inspected here is **`repo-tabs/products/sprintique/node_modules/@iquipage/web`**. Its `components.js`, `date-field.js`, `interaction.js`, and CSS hashes match attempt 2 inputs. The older `research/runtime/sprintique` installation is .50 and is not evidence for this diagnosis.

Both native `property-access` probes record successful opening, Escape cancellation, and trigger-focus restoration for six selects and the due date. Both then time out in `page.waitForFunction` at `accessProbe`, attempt-2 `run.mjs:217:54`, after the estimate's awaited ordinary locator click. Neither probe records a successful estimate open. Page errors, console errors, and external-request arrays are empty.

Attempt 2 contains initial screenshots and the VT1 disclosure-open screenshot, but **no estimate failure screenshot, popup event trace, or failure DOM snapshot**. The timeout cannot distinguish “never opened” from “opened and closed before observation.” The separate broad `[aria-selected=true]` locator failure is not the estimate failure.

## Verified source chain

1. [task-dialog.js](sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/task-dialog.js), `mountEstimate`, lines 171–186: a click listener on the estimate slot resolves the clicked button and calls `estimateEditor`. Its asynchronous settings repaint replaces the button's markup, but the listener remains on the containing slot. The fixture's `viewSettings` is an immediately fulfilled async read, with no explicit delay; no observed repaint race is established.
2. [estimate.js](sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/estimate.js), lines 48–71: `estimateEditor` delegates to product `openPopover`, then its `onMount` calls `input.focus()` and `input.select()`. That focus has no `preventScroll` option.
3. [popover.js](sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/popover.js), lines 12–41: close any previous product popup; create a `div`; set `popover='manual'`; append it to `document.body`; call `showPopover()` inside a silent catch; position it; schedule outside-pointer, resize, and document capture-scroll listeners through `setTimeout(0)`; install an Escape listener on the popup itself; invoke `onMount`.
4. The scroll/resize handler closes whenever the event target is not inside this popup. `close()` hides/removes it. Escape requests anchor refocus with `preventScroll:true`; outside scroll does not request refocus. The listener is attached asynchronously, so synchronous source ordering does not prove which native scroll events it receives.

Baseline and VT1 use identical `estimate.js` SHA-256 `e509718b460a002ed8316cacc9453f4bb98f75a9d06c7f843690d007abcb0a86` and `popover.js` SHA-256 `ef10bf12d66e1586ce85ff568ec4552863bc1c17ae1718bb2fae480ecc519e21`. Their recorded Vite inputs match these files, and both captured JS bundles contain the same body append, swallowed show call, outside-scroll removal, and input focus sequence. The VT1 patch modifies the task composition, work view, and work model; it does not modify these popup modules.

## Candidate mechanisms and distinguishing evidence

| Candidate | Source support and limits | Native evidence needed |
|---|---|---|
| **H1: popup opens, then a queued outside scroll removes it.** | This is an explicit product close path. Potential event origins include click auto-scroll, native focus, or the prior date popup. It is not yet a demonstrated harness bug or product race. | Popup insertion and opening, followed by an outside `scroll` target and closing/removal, with monotonic timestamps, target identity, and scroll/anchor geometry. |
| **H2: `showPopover()` never establishes native open state.** | Product code suppresses any thrown error. Empty page/console-error arrays therefore cannot rule this out. Working select/date popovers show that the browser has native Popover support; this is not evidence of a missing API. | Popup exists after the click but never matches `:popover-open`; record opening `beforetoggle`, `toggle`, connectedness, parent, and final native state. An attached hidden popup without an opening transition would justify investigating the swallowed call next, not claiming its exact exception. |
| **H3: modal scope prevents estimate input focus.** | Estimate popup is a `body` child. DS54 `IqDialog.show()` calls native `showModal()` (`components.js:497–505`); date/select popups remain descendants of their controls inside the modal. The HTML modal-inertness rule supports a focus/interactivity concern for a body sibling. **That rule alone does not explain absence of `:popover-open`.** | Record the popup's parent, `closest('dialog')`, whether the active modal contains it, actual focus before/after click, and whether the estimate input ever receives focus. A persistent open but unfocused popup is a distinct failure from H1/H2. |
| **No popup insertion despite a delivered estimate click.** | Would move investigation back to handler dispatch/lifecycle. Source alone does not show this happened. | Pointer/click target and popup mutation trace. Do not infer a show/close race if the popup was never inserted. |

### Why “Playwright auto-scroll” is not yet the answer

Installed Playwright `1.62.1` source was inspected at `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/lib/coreBundle.js`. Lines 19838–19950 show the ordinary click path checking visibility/enabled/stability, scrolling into view if needed, checking the hit target, and dispatching the mouse action. Lines 37878–37887 call Chromium `DOM.scrollIntoViewIfNeeded`. This proves that the action includes that operation, not that any scroll changed or that a queued event arrived after popup listener attachment.

H01 baseline's initial body scrollport is y=53–661, scrollTop=0; due label y=279.7, estimate y=351.7, parent y=495.7. The VT1 disclosure-open snapshot before select probes has scrollTop=87; due y=192.7, estimate y=337.7, parent y=481.7. Those recorded positions are within the scrollport. They are not snapshots immediately before the failing estimate click.

DS54 calendar focus also deserves correct attribution: `components.js:922–936` focuses with `preventScroll:true`, then may explicitly adjust its **own date popup's** `scrollTop` to expose the selected day. A delayed scroll event from that prior popup would be “outside” the estimate popup as far as the product handler is concerned. No such event has yet been observed.

### Platform source used only to check H3

The [HTML Standard's modal-dialog inertness rule](https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees), read 2026-10-12, makes connected nodes outside the active modal and its flat-tree descendants inert; inert nodes generally cannot focus. The [popover validity algorithm](https://html.spec.whatwg.org/multipage/popover.html#check-popover-validity) does not reject an element merely because it is outside a modal. Therefore modal topology supports an interaction hypothesis, not an asserted explanation of the current opening timeout. Browser behavior still needs the native trace.

## Minimal next native evidence

Use the planned attempt 3 unchanged estimate click and native-open oracle. Attach passive observers **before** the click, retain them until success/failure is recorded, and export before context closure:

- `pointerdown`, `pointerup`, `click`; `focusin`/`focusout` and actual active element.
- `beforetoggle`/`toggle` states and source; popup insertion/removal; connectedness and modal containment.
- Capture-phase `scroll` with the event target's class/id, its scroll offsets, estimate-anchor rect, body/dialog scroll offsets, and popup state. Keep hidden prior date-popup identities.
- Popup state directly after the click and at failure; failure screenshot. Log observer truncation if any.

A `beforetoggle` opening event alone is not proof that the popup reached or retained open state; a queued `toggle` alone may also conceal a fast reversal. Interpret transitions, actual state samples, and removals together. Preserve attempt 2 as failed. Do not repair scroll, change parentage, force focus, retry the click, replace the native-open oracle, or reclassify the failure as PASS while diagnosing it.

If H1 is observed, the next narrow comparison should separate a settled, directly accessed estimate from the current select/date sequence while preserving the original failed scenario. If only H3 is observed, test real focus and Escape behavior before proposing a modal-containment correction. No production fix is authorized by this report.

## Handoff

The author and root received the candidate chains and trace requirements. No repository files, prior reports, Git state, remote systems, or product/DS packages were changed by this investigator. No local browser/JDK/PostgreSQL retry was attempted. Root owns evidence preservation and any subsequent decision. This report remains **diagnostic and inconclusive about the native cause** until attempt 3 evidence exists.
