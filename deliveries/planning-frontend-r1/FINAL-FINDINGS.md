# Planning Frontend R1 — repair ledger

## PLN-RECOVERY-01 — resolved in source and browser regression

The original failure was an acknowledged calendar commit followed by a failed projection read. The host conflated a committed effect with a cancellable preview; additionally, assigning `data` intentionally preserves a dirty DS edit session.

Repair `983de13`: distinguish committed effects, settle the pending request once, and replace a discarded/stale DS surface through its public lifecycle rather than touching its edit-session internals. Show the refresh-required state, release navigation after the documented `iq-close` event, and restore selection on a successful read. A rejected local preview is not described as a rollback of stored data.

`tests/browser-recovery.mjs` now verifies one stored receipt, preserved changed date, release of navigation, successful refresh and enabled editing without a stale DS conflict. The test waits for the actual close event, not an arbitrary delay. `browser-temporal.mjs` repeats normal acceptance/cancellation.

## PL-DS-01 — additive source candidate integrated

`packages/work-list` contains strict TypeScript exports for a height index, native-table windowing and controlled row dragging. It has no product domain/network dependency and does not modify the pinned DS. `TableWindow` keeps focused rows by identity; `bindRowDrag` emits an intent, never writes or reparents caller records.

Consumer acceptance: `browser-list-interactions.mjs` and `browser-large-list.mjs`. Mouse/keyboard/menu routes share the application command; sort rules are explicit; 10,000 paginated rows use a bounded DOM. Independent source compilation and tarball install are checked; promotion into the extracted primary DS is a separate owner decision.

## PLN-CLICK-02 — resolved

A drag click-suppression window could swallow a later deliberate filter click. Suppression now expires after the originating input turn; automatic-sort interaction is tested immediately after a completed reorder.

## Remaining platform boundary

No production backend, SDK binding, PostgreSQL, ACL, multi-client event stream, migration or external effect is accepted by a browser fixture. Physical touch/screen-reader testing and real-device FPS remain unverified. The complete report must be regenerated after the final source commit; historical FAIL snapshots are retained in earlier deliveries and Git history.
