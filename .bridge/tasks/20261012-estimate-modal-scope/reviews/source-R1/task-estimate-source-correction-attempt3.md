# Correction: estimate Escape failure and product popup ownership

## This corrects the earlier report

I misread the failing runner line in [task-estimate-source-diagnosis.md](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-estimate-source-diagnosis.md), preserved unchanged at SHA-256 `a049443907155be45ca7128416515da6dbc7cab460a9a14ab176bd263aca6279`. Its claim that attempt 2 timed out waiting for the estimate popup to **open** is incorrect. It timed out waiting for popovers to **close after Escape**; the preceding open check had passed. The absence of an estimate entry in `controls` did not mean opening failed: the entry was pushed only after cancellation and focus assertions.

Root/preservation review identified the line-mapping error. I independently reread the exact Git objects and verified their runner bytes against each native result:

| Evidence | Runner SHA-256 | Exact failing operation |
|---|---|---|
| Attempt 2; source revision `80ebf480ce479f77b04a261be77fa68605ee9f29`, same tree as inspected `0c74ab69487fa5d7ec66ead92400043901e85af2` | `44951fca53d840c819e590ed5492164935502c78205425339bcae110a3e945d8` | Line 216 clicks and awaits open. **Line 217:54 awaits closed after `keyboard.press('Escape')`.** |
| Attempt 3; source revision `e7a4bb9eb1f9ed8878edd00d4128bdc332e6dd8e` | `dce1ae5f13e6a48753e3fcfedb4f0ea1fae0547d16d82d48b4aab8f07bb61f93` | Line 274 awaits open. **Line 275:54 awaits closed after Escape.** |

The earlier opening-failure framing and H1/H2 as explanations of the observed failure are withdrawn. The source facts about body placement, local Escape handling, and outside-scroll closure remain accurate; the new native evidence establishes which matter here.

## Native evidence personally reviewed

Source: [attempt 3 results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-attempt3-11739838266/results.json), SHA-256 `13b4d157cffdf3653b7fe3073b4bb25e7ee29bc1ae5f4a0f233b3a262512f610`. Exact source tree `a294b5e551154bc8f57103e5158a72b0e49682dc`; Chromium `151.0.7922.34`; Playwright `1.62.1`; DS `0.6.0-vnext.54`; unchanged frozen product `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`. Scope remains the synthetic ordinary task at 1280 × 720 in light/reduced motion, baseline and VT1.

Each estimate trace has 13 events, zero dropped events, zero scroll events, and zero popup-removal events:

| Observation | Baseline | VT1 |
|---|---:|---:|
| Native popup recorded open at `popup-added` | 38 ms | 41 ms |
| At `click-resolved`: popup open under `BODY`, outside modal; focus remains on estimate trigger | 40 ms | 43 ms |
| Opening `toggle`; focus still outside popup | 49 ms | 52 ms |
| Modal becomes absent, trigger loses focus; Board task title receives focus | 101 ms | 105–106 ms |
| At trace stop: popup still connected and open; anchor disconnected; modal absent | 12,111 ms | 12,114 ms |

No event records focus inside the popup. The recorded modal disappearance follows the runner's Escape operation. **The logger does not record `keydown` or native `cancel` separately:** their exact dispatch target/time is inferred from the frozen runner, focus state, stack, and implementation, not represented as a captured event.

I personally viewed both baseline images:

- [H01-baseline-estimate-after-click.png](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-attempt3-11739838266/H01-baseline-estimate-after-click.png), SHA-256 `9d319a0fb7cc4262dc0d18e9f9c4614acf50a6eadc9a20ccff8bffcb30d7b7a1`: task drawer and estimate popup are visible together.
- [H01-baseline-property-access-failure.png](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-attempt3-11739838266/H01-baseline-property-access-failure.png), SHA-256 `02444e288406f38cfe09a63d5eca9a3c3cb708e7bf1a7f3726d12d57685f78eb`: drawer is gone, Board task title has its focus outline, estimate popup remains over the Board.

## F-EST-01 — confirmed P1: Escape closes the task and leaves an orphan estimate popup

**Confirmed native behavior:** the estimate opens, receives no input focus, and survives Escape while the task drawer closes. Both variants fail identically. The trace contradicts an opening timeout, an immediate outside-scroll removal, and a missing Popover API explanation.

**Source-supported cause:** product [popover.js](sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/popover.js), line 16, appends to `document.body`; [estimate.js](sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/estimate.js), line 58, then attempts input focus. DS54 `IqDialog.show()` uses native `showModal()` (`components.js:497–505`). The HTML modal-inertness rule makes a body sibling outside that modal ineligible for normal focus. The popup's Escape listener exists only on the popup (`popover.js:28,38`), so it cannot receive a bubbling key event while focus remains on the trigger. DS54's modal `cancel` handler closes the dialog and its settle path restores the Board opener (`components.js:448–456,532–547`). The body-owned popup is not removed with the task. That source chain explains the native observations; the exact keyboard/cancel dispatch remains an inference as qualified above.

Platform reference: [HTML Standard, modal dialogs and inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees). Native open state and focus eligibility are distinct; that distinction is material to this correction.

**Minimum fix boundary: the shared product popup helper.** No DS defect or need for a DS release is demonstrated. Keep a popup opened from a native modal inside that owning dialog, as a sibling outside the task's form because the estimate contains its own form. Preserve the body host for nonmodal Planning callers. Tie popup cleanup to owner closure/removal; preserve popup-local Escape prevention and anchor focus restoration. `preventScroll:true` alone or a document-wide Escape interceptor would not correct the modal ownership error.

Acceptance must show input focus inside the open estimate; Escape closes only the estimate and returns focus to its connected trigger while the task stays open; task dismissal/removal leaves no popup or stale listener; existing nonmodal popup cancellation remains correct. Keep the original failed sequence and both variants in regression evidence.

## F-EST-02 — confirmed P2 in inspected images: estimate content clips inside its popup

Both inspected baseline images show the units extending beyond the popup's right edge, the week choice outside the visible area, a truncated hint, and a clipped Save action/label. The popup itself is fully within the viewport: native rect x=765, width=280, right=1045 at viewport width 1280. This is internal layout overflow, independent of Escape and not viewport-edge placement.

The product sets `.pl-est-pop{width:280px}`, an automatic grid in `.pl-est`, and a flex row for input plus units (`planning.css:63–71` in the frozen source). The precise overflowing child metrics were not captured, so intrinsic grid/flex sizing is a source candidate rather than a measured final root cause. Correct the estimate's product composition so its track/row can shrink or wrap and all units, help, and actions fit; do not hide the overflow or change generic DS popup/segmented styling to conceal it. Verify child widths and actual images after the repair, including a narrow viewport and text enlargement. This report does not claim those additional states were tested.

## Applicability and handoff

Current main inspected at `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`, tree `b20e2c969415e618cec2b199c365b50cb16b3cdc`, retains identical `estimate.js` (`e509718b…`) and `popover.js` (`ef10bf12…`) bytes. Its estimate CSS block is also unchanged, SHA-256 `66b9f2857eccf7f3dff903c52f1d37303a7e6b3eb76c15c3926e0db01b77aef5`, although the complete Planning stylesheet differs. Thus the source fix applies there; native acceptance on a repaired current-main build remains required.

The experiment checkout was observed at `2f66973538605035bf354ed264ee0c95f2a34ec5`, the same tree as attempt 3, with a pre-existing journal change. I changed no repository or existing report, and ran no browser/backend retry. This new correction is the only artifact created. Root owns preservation, implementation, and release decisions. Neither finding is resolved by this report.
