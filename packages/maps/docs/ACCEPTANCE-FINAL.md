# Final acceptance: reusable Maps and local reference runtime

Approved scope: finish the standalone/reusable module, transactional events and delivery; open a PR to main, without merging.
The original design-system baseline and main remain unchanged.

Required checks before declaring the delivery ready:
- Existing R3 model, runtime and browser scenarios.
- Original OUTBOX-01 through OUTBOX-08 assertions, without weakening them.
- Immutable committed inputs for the source map and other target maps.
- Archived execution cannot be enabled by untrusted HTTP events or hooks.
- Bounded retries, dead-letter records and explicit version-checked recovery.
- Queue/history project isolation and stale-operation rejection.
- HTTP event -> run -> human approval -> one persisted task.
- Browser rule configuration and delivery journal.
- Rebuild/test after clean extraction; offline HTML check.
- One consolidated PR to main, containing all prerequisites.

Not claimed by this acceptance: Sprintique production deployment, live LLM,
shared real-time editing, distributed database, independent accessibility audit.
