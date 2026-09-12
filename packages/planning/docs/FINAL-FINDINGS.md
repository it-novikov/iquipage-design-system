# Findings from the current Planning completion pass

## PLN-RECOVERY-01 — confirmed
A calendar command commits, then reloading the canonical timeline fails. Closing the confirmation calls the controlled component's rejection as though the operation were cancelled and leaves `dirty=true`. `readyToLeave()` remains false: the user is trapped even though the change is saved.

Reproduction: `node tests/browser-recovery.mjs`. First current-run result: FAIL, assertion `Committed read failure must not trap the user in a dirty preview`. The fixture contains the new date and exactly one receipt. This is an application lifecycle defect, not a database failure.

Required repair: distinguish acknowledged commit from cancel; keep an explicit refresh-required error; clear the unsaved preview state after explaining the committed result; retry reads canonical state without a second command. Acceptance must rerun this exact test.

## Work-list implementation boundary
The supplied `bindBoard` creates card/div placeholders and depends on board card markup; it is not a valid table-row drag controller. It was not forced onto `<tbody>`.

A new generic `table-viewport.ts` write was rejected twice by the tool safety-status check; no file was applied. A separate row-drag candidate was partly saved, but its continuation was also rejected twice. Neither candidate is integrated, advertised or passed as working. Do not change tools or encodings to bypass these refusals. Preserve the partial source separately from the runnable package.

The independent release, calendar, filtering, typing, testing and delivery work continues. This file does not mark the full R2 or new backend as complete.
