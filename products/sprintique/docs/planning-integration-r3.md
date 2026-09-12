# Planning consumer integration R3

Consumer source: PR #3, commit `d87c65767ef471c81bf84c10b9b19e225a956064`. The upstream branch is untouched. No demo repository or reference business rules enter production. The 19 upstream controller/operation tests retain their cases with import paths adjusted; canonical rules have separate PostgreSQL tests.

## Boundary

`ui/planning/src` renders the supplied DS. `web/planning-adapter.js` bridges its projection/intent protocol to `contracts/planning-view.ts` and the typed client. `backend/application/planning-view.ts` creates projections and translates intents into the same canonical commands as other clients. Consumer-calculated eligibility, counts or effects are never authoritative.

`web/planning-host.js` supplies the same task editor on Planning and the board. Tasks created in Planning remain drafts; preparation and release admission are independent. Parent/release changes use nested preview/commit confirmation, not direct task writes or a PATCH loop. Cancelling confirmation retains the form draft. Markdown, covers, tags and files remain one task document.

## Mutation and recovery

1. Submit an intent or immutable selection token.
2. Server authorizes, snapshots revisions, computes effects/blockers and stores a prepared plan.
3. Client persists the plan/command identity before sending commit.
4. Commit rechecks live authority/versions and atomically writes data, audit/outbox and receipt.
5. Lost response offers receipt recovery; the journal survives reload and never creates a new command identity.

Closing and receipt retry are separate capabilities. An unresolved receipt blocks dismissing the operation, **not** `Проверить результат`. R3 fixes this distinction in imported dialogs: only loading/submitting/checking disables action controls.

Selections/projections are revision-fenced; stale snapshots fail instead of silently selecting different tasks. Group/row/history/options/effects lists paginate. Rendered capabilities do not replace server authorization. Revocation destroys the mounted consumer and protected dialogs.

## Temporal and release semantics

Format, planned range and deadline are separate. Preparation, workflow status, acceptance result and board admission are separate. Release inheritance follows the server hierarchy. Temporal batches support FS/SS/FF/SF constraints with lag; cycles/conflicting revisions are rejected. Close/cancel requires an explicit remainder destination and creates immutable history, not a mutable copy of current tasks.

See [planning-r2.md](planning-r2.md) for canonical commands/responses. R3 adds the consumer protocol, not another domain engine. Product acceptance and deployment remain separate from targeted integration checks.
