# Grouped choices

`ui.choiceGroups({name, value, groups})` is a core composition of native radio choices and optional disclosure sections. Each group has `id`, `label`, `options`, and optional `collapsible` / `expanded`. Options have `value`, plain-text `label`, optional plain-text `description` and `disabled`. Labels are escaped. Groups without options are omitted. A collapsed group does not imply that its options are unavailable.

The host owns search, ordering, selected value and persistence. Listen to the native `change` event. Keep the selected value when search hides a row. Preserve disclosure state when replacing search results. A hidden selected choice must be summarized outside the results; confirmation uses the host's selected value.

The composition uses public `iq-choice-group`, `iq-choice` and `iq-work-details` styles. It has no domain knowledge, network requests or inferred grouping.

In a collapsible group the summary is the visible heading; the fieldset legend remains available to screen readers without repeating that heading on screen. The underlying `ui.radioGroup(label, name, options, selected, {legendHidden:true})` option is also public (vnext.42).

Version .40 also makes every transient toast tone/action expire after 3500 ms. Hover, focus and a hidden browser tab pause the countdown. Explicit `duration:0` remains available for truly persistent state; ordinary product success/error/action notices use 3500 ms.
