# Estimate popup fix — independent source review R1

**Verdict: APPROVE within the frozen source scope.** No source revision is required before the planned native regression. This approves the implementation for native verification; it does not resolve F-EST-01/F-EST-02, approve the concurrent harness, or claim backend/release acceptance.

## Immutable review basis

- Commit: `47dcbf2c46496e7908b3c94cee91c9813eec81c5`.
- Tree: `f43689d3a5553c07468ef40eccf5c7af8538892f`.
- Parent main: `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`.
- Reviewed the complete seven-file Git diff: three product runtime/style files, two DS integration documents, and the task/journal. All source reads used the frozen Git objects. Concurrent workflow, fixture, test, and dependency worktree changes were excluded.
- Native regression plan SHA-256 supplied by root: `853bc181d9f4e4db33f5676b4efd515a49cb89210a2f5e79cb307e08aecba42e`. The harness implementation and native results are separate review work.
- Read current repository/product/library rules, the experience entry, scoped task, and `iquipage-review` 1.2 guidance. No task-card or repository mutation was performed.

### Reviewed file fingerprints

| File | SHA-256 at the reviewed commit |
|---|---|
| `products/sprintique/ui/src/popover.js` | `736e15a5b68629ae8adbd095aa84e38b7839cd22b965a466e9f2b01dfb7f41c1` |
| `products/sprintique/ui/src/estimate.js` | `8667c2cedcfb19b5dec758120f3d3895a1102f33950238a41689db6c9c1b7893` |
| `products/sprintique/ui/planning/src/planning.css` | `9c2cecd520739acc5ebc26f61f5f0d06d3edf632e26344023a974ebb5c2978b1` |
| `libraries/iquipage/docs/anchored-editors.md` | `0b026308b1e30e1741d10b1c1b513bf257f58a0886e13fea95589e2e2dc7dd89` |
| `libraries/iquipage/docs/INTEGRATION.md` | `410fa3fb14302de86da85dc3fb78447643f8c981f3f730d0f96be40fb8289620` |

Product package/lock/vendor bytes are unchanged from the parent. The DS archive remains `0.6.0-vnext.54`, SHA-256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`. No DS runtime, type, package export, version, or published artifact changes occur in this commit.

## Findings and implementation assessment

**No new blocking or nonblocking source finding was identified in this diff and its current caller paths.** The existing native findings remain open pending fresh evidence.

| Concern | Source assessment |
|---|---|
| Modal ownership and forms | `popover.js:17–18` uses the nearest native `dialog` as host, with `document.body` fallback. Actual Task markup places its form directly inside that dialog (`ui.js:27`), so the popup's own form is a sibling outside the task form. No nested form, DS private property, or new modal is introduced. |
| Focus and Escape | `estimate.js:58,67` requests input focus with `preventScroll:true`. Popup-local Escape still prevents default, stops propagation, closes the popup, and restores a connected anchor (`popover.js:30,40`). No document-wide keyboard interception changes adjacent overlays. Native focus eligibility is the part that still needs browser confirmation. |
| Owner closure/removal | The owner receives a local `close` listener. One `MutationObserver` watches child-list changes only while this popup exists, with constant-size checks for anchor/popup connectedness (`popover.js:32–45`). Removing the owner disconnects those nodes; internal popup redraws keep them connected. No polling or observer remains intentionally active after close. |
| Cleanup ordering and replacement | `closed` guards repeated callbacks; `current` is cleared only for the closing popup. Pointer, scroll, resize, popup-key, and owner-close listeners are removed; the observer disconnects. The delayed outside-listener installation checks `closed`, so early dismissal cannot reinstall listeners afterward. Closing/replacing an earlier popup removes its owner listener and observer before a later popup takes ownership. |
| Nested owner and unrelated dialogs | The closest dialog determines ownership; its `close` listener is local, and native close events do not bubble into a different owner's handler. Removing an enclosing owner is covered by the connectivity check. No broader modal stack management or focus trap is added. |
| Nonmodal Planning callers | Planning estimate/date editors and row/container/move menus keep body hosting. Menu selection calls `close()` before `onPick`; the row-to-move-menu transition reuses the connected row/header anchor, not a removed menu item (`popover.js:63`; Planning `index.js:148–197`). Internal date-calendar redraws replace popup children, so the new observer does not mistake them for anchor removal (`containers-dialogs.js:32–49`). Planning destruction already calls `closePopover()`. |
| Layout correction | The estimate form gets a `minmax(0,1fr)` grid track; the input/units row and action row can wrap; the input gets a shrinkable 12ch basis; the units remain one group; hints can wrap long text (`planning.css:65–74`). These are product selectors and existing tokens. They address the observed internal overflow without clipping it away, reducing type, or changing generic DS popup/segmented styles. Final geometry and readable input rendering at enlarged text require native evidence. |
| Model, save and cancellation boundary | Parsing, units, estimate values, callback arguments, and backend calls are unchanged. Task save can repaint the anchor; the observer and later save completion can both request closure safely through the same idempotent close path. Escape does not call `onSave`. This is a source assessment, not proof of real persistence. |
| DS integration documentation | The new recipe explicitly covers existing application adapters, prefers supplied controls, and states that it adds no `ui.popover` API or published runtime change. Its host/form/focus/cleanup and intrinsic-sizing guidance matches this repair. It does not pass the native or backend gates by documentation. |

## Connection to the actual failure

The diagnosis is the corrected one in [task-estimate-source-correction-attempt3.md](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-estimate-source-correction-attempt3.md), SHA-256 `e747f5793be5ef5979923648c86f9a86b0d813ba935448dff6084e846df7eb42`.

Attempt 3 result SHA-256 `13b4d157cffdf3653b7fe3073b4bb25e7ee29bc1ae5f4a0f233b3a262512f610` shows a body-owned open estimate, focus remaining on the trigger, then Task disappearance and Board focus while the estimate stays open. Both traces have zero scroll/removal events and zero dropped events. The failure is the post-Escape closed-state wait, not the preceding open-state wait. I previously viewed and hash-verified the baseline after-click/failure PNG pair; this review does not relabel those old screenshots as repaired output.

**Historical source-chain precision:** the actual frozen Task has its own native `cancel` capture handler at `task-dialog.js:456` in `8f8d218…` (line 474 at this candidate). It prevents propagation and runs Task's close/flush guard, which then delegates to `el.close()` when permitted. This refines the earlier correction's sentence attributing Task cancellation directly to the DS cancel listener. The trace did not log keyboard/cancel dispatch; that event route is inferred from source and the known runner. The confirmed ownership/focus/orphan behavior and repair boundary are unchanged.

## Verification and next gate

I independently reviewed the frozen diff and affected caller chains, verified the file and unchanged vendor fingerprints, and ran `git diff --check` successfully. The author's existing syntax/model/boundary checks are separate evidence; I did not repeat them or launch a browser/backend here.

Before closing either original finding, the candidate's frozen native plan must demonstrate actual input focus; Escape returning to the same task and trigger without a save callback; cleanup on owner/anchor removal and on later popup replacement; unchanged nonmodal menu/date/estimate behavior; and readable child geometry in the required desktop, narrow, dark, and enlarged-text captures. Test source review and exact candidate provenance remain the harness reviewer's responsibility. Full Task persistence, real user acceptance, and broader release platforms remain outside this source R1.

**Handoff:** source approved at the exact commit/tree above; no source repair request. This report is the only file written by this reviewer. Existing reports and repositories were left unchanged. Root owns preservation and subsequent native/merge decisions.
