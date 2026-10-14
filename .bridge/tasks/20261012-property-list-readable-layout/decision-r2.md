# PF04 — correction after private56 native R2

Written before diagnostic or layout edits on 2026-10-12. Author: `gpt-6-astra-ds`. Root authorised this bounded correction; product adoption, merge and deploy remain outside it. The existing decision and all55/56 packages/plans/evidence stay historical and immutable.

## Evidence and the human problem

Independent R2 is `property-list-private56-native-r2.md`, SHA256 `ecb66d5d4218fca7193ff7ccb7d7dd3bdc540d640e6568b3f6e793d3e46ed56f`. It reviewed actual checkout `c267edee80d49660e22fa03bc4442c19e3b4d2d1`, tree `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6`, built from immutable private56. This worktree has the same main41ebe integration staged by root, without a merge commit. The author does not touch the index or refs.

My own inspection of control/candidate wide-normal and candidate narrow/wide-text200 agrees with the following observations. Complete display text is a real improvement over54. The extra height needed to read it is acceptable. Three specific layout costs are avoidable: a213px label wraps in its196px allocation although its own row has270px; static author metadata always occupies another grid row even when name247 + metadata73 + gap8 fit in437px; owner/author first text baseline is visibly lower than its label at root32 (R2 estimates18.3125px), unlike the date. These are reading and grouping problems, not a request to restore fixed heights or shrink text.

Raw popup geometry after host615→270 differs from the later full-page PNG. A resize event occurs in that capture interval, and existing DS window listeners can reposition the popup. The source mechanism and native counters make capture interference plausible, but the clean painted stale state still needs a direct observation. The automatic paired PASS is not acceptance of layout A or A3.

## First checkpoint: observe the same56 without repairing it

Preserve comparison revision2 byte-for-byte and create revision3 before running. Both archives, fixture data/DOM/styles, five profiles, semantic and full-text oracles stay identical. Only interaction capture changes: viewport PNG while owner/date is open; record state immediately before it, immediately after the PNG and after two further animation frames. Each state includes trigger/popup rectangles, focus, value, viewport, host width, scroll and resize/scroll counters. Observe both window and visualViewport (size, offsets, scale and its own passive resize/scroll counters; null when that API is absent), because Date already listens to both. Preserve the pre-capture state even on failure. Capture interference must be reported, not mistaken for an anchor fix. Do not dispatch resize, scroll, reopen, call positioning or change DS JS.

Keep closed-editor full-document frames for reading the whole list. Failure screenshots use the viewport so that a failed open-editor path cannot acquire the same full-page side effect. The verifier retains raw adjacency classification and exposes whether the capture remained observational. Existing keyboard, cancellation, identity, exact intent counts, input and geometry assertions remain in force.

Root will publish this harness-only checkpoint and obtain a native same56 diagnostic. I pause writes after handing it off so root can record the pending main integration and immutable checkpoint. No local native retry and no new general browser framework.

## Next layout trial: alternatives and provisional choice

| Alternative | Mechanism and benefit | Cost and reason to reject |
| --- | --- | --- |
| Corrected intrinsic A | Let a label grow; give each existing value carrier a basis of `max(value minimum, 100% - label budget - gap)`. On a shared row the two bases already fill the row, keeping the compact label allocation; on its own row the label can use the whole width. Keep explicit border-box carriers and zero outer layout margins. | Percentage basis requires a definite available inline size; shrink-to-fit/intrinsic parents remain a boundary to assess. The7U/14U budgets remain hypotheses, not new public knobs. Reject if the actual carriers still wrap inconsistently or values become harder to compare. |
| Explicit stacked B | A container-relative mode sets label/value rows deliberately, with a full-width label and a distinct but shared pair rhythm. | It can express the mode more directly, but establishing size containment affects intrinsic parents and adds threshold/container ownership. Reject if that machinery costs more than the observed reading benefit or collapses useful wide pairs. B remains a real alternative if corrected A fails; it is not implemented merely to satisfy a count of variants. |

Prefer the bounded correction of A for the next native trial: it addresses the observed label cost without a viewport breakpoint, grow-ratio trick, observer, remount or new consumer setting. This is permission to test a hypothesis, not a visual verdict.

For owner, align the existing inner select flex items to the first text baseline so its caption participates in the shared baseline. For static avatar/name/date, replace the forced metadata grid row with natural inline text flow; preserve avatar association, allow metadata beside the name when it fits and wrapping when it does not. Do not use per-row translateY or enlarge all avatars to the text size. Other property modes, static values without avatar and ordinary controls stay within their current contracts. A native frame must still decide whether the resulting optical alignment and normal density are useful.

If the clean56 diagnostic confirms a persistent detached editor, report the causal/lifecycle alternatives to root before a separate DS JS correction. The layout trial must not hide that issue or receive adoption approval while it remains open.

## Acceptance and package boundary

The layout change receives a new immutable private57 with consistent source/version/types/docs/build/pack/proof. Product code, lock and vendor remain accepted main41ebe/DS54. Retain every55/56 archive and source proof. Keep the same values and five native profiles; no ellipsis, line limit, smaller font or weaker clipping/intent oracle. The existing213px label, author metadata and avatar rows discriminate the hypotheses without new mockups. First-line optical grouping, useful normal density and full long captions require fresh native PNG review. Build-only and applicable DS tests support source quality, not human acceptance. Actual Task adoption and release platform checks remain later applicable work.
