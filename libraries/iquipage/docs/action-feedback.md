# Action feedback API

Public behavior, retained outside the browser runtime since 0.6.0-vnext.45.
The implementation and timing values are unchanged; full declarations remain in types/core.d.ts.

## Action feedback timing

Action feedback (0.6.0-vnext.35): one calm, time-keyed answer to «what happens after I press this».

A button that starts work stops taking clicks at once, but looks the same for the first 150 ms, so a fast answer never
flickers. After that it shows a spinner in place of its icon (or over its label) at the same width, with aria-busy.
Work still running after 1 s lights a thin line under the top bar; after 8 s a quiet notice says the connection is slow
and the action is still under way. Offline is a notice that stays until the connection is back. A failure re-enables
the button and says what went wrong right next to it, with «Повторить» when trying again makes sense.

## pending(button, work, options)

Runs `work` (a function or a promise) as the button's action: no second click until it settles, the pending look
after FEEDBACK_TIMING.pending, the button exactly as it was afterwards. Resolves or rejects with the work's own result.
Calling it again for a button that is already pending returns the running work instead of starting another.
options.label: the text to show while pending (default: PENDING_LABELS of the label; '' for none).

## actionError(button, error, options)

Says what went wrong next to the control that started it, with «Повторить» when `retry` is given. Without `at` the
message floats under the button in the top layer (no layout shift) and stays in the tab order right after it; with
`at` (an element in the flow, e.g. a form's error line) it is written there. Returns {remove()}.

