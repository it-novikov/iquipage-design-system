# NT05: precise notification-order verification

## Problem and selected scope

PR76 full vNext [38212609809 / job 114690036607](https://github.com/it-novikov/iquipage-design-system/actions/runs/38212609809/job/114690036607) failed at `notifications.test.ts:150`: the first page's ISO timestamp strings were compared lexicographically. The run had 566 passing tests and this single failure. Its artifact `11730566938` was read and its ZIP bytes matched SHA256 `01f4e920548357ba713cd6d82e4c41d37d7684259078d14c0ba9fa27309d4ba9`. The failed adjacent values were not printed, so that observation alone does not prove a runtime sorting defect.

Unchanged baseline `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` uses SQL `ORDER BY n.created_at DESC,n.id DESC`, a `(created_at,id)` cursor, and `Instant.toString()` serialization in `Notifications.kt`. Read-all compares the supplied instant through PostgreSQL `timestamptz`. This patch changes **NT05 test data/assertions only**, with bridge evidence. It does not change that implementation, the serializer, permissions, manifests, vendor or CI.

## Deterministic model

A fresh synthetic recipient prevents NT02's existing notification for global `dan` from changing NT05's total or cutoff. Global `dan` and other scenarios remain unchanged. An administrative fixture insert sets the IDs and timestamps in the real ephemeral database; the test reads and marks notifications through the normal HTTP API. Notification creation/recipient rules remain covered by NT01–NT04, rather than being reimplemented by this ordering fixture.

All rows use `2000-01-01T00:00:00` UTC. IDs share a fresh random UUID prefix; the final 12 hex digits encode the ordinal. This preserves uniqueness while making the tie order explicit.

| ID ordinal | Timestamp fraction | Expected significance |
| --- | --- | --- |
| 1 | `.600002Z` | Newest initial row, despite the smallest ID. |
| 2 | `.600001Z` | One microsecond older; must precede ID 3. |
| 3 | `.600Z` | Another microsecond older; exercises variable fractional representation. |
| 4–25 | `.500001Z` | Equal microsecond timestamps, descending IDs; the group crosses the page boundary and catches cursor precision loss. |
| 26, inserted after the page was read | `.600003Z` | One microsecond after the read-all cutoff; remains the only unread row. |

Expected first-page ordinals are `1,2,3,25,24,…,9` (20 items), and second-page ordinals are `8,7,6,5,4` (5 items, no next cursor). Both complete ID arrays are compared with these independently specified expectations. A timestamp-only cursor drops the second page; an incorrect ID tie or an ID-only sort changes the arrays. Truncating the boundary `.500001Z` to milliseconds also drops all five remaining equal-time rows. Millisecond rounding followed by ID ordering reverses the distinct top rows. The no-overlap assertion, bad cursor, unread/read-by-id/read-all, cross-user no-op and database-role denial assertions remain.

Read-by-id targets ordinal 3 (`first.items[2]`) and confirms it is read. Ordinal 1, exactly at cutoff `.600002Z`, is explicitly confirmed unread before read-all; ordinal 2 remains the cross-user target. Therefore an erroneous strict `< before` leaves ordinals 1 and 26 unread, while the required inclusive `<= before` leaves only ordinal 26. Count and exact unread-ID assertions distinguish these cases.

## Counterexample evidence and acceptance boundary

On the current serializer, the real first-page values are expected to expose `.600002Z`, `.600001Z`, `.600Z`; the original string predicate would be false even though the known ID order is correct. The test emits one diagnostic line containing **the observed predicate result and actual first three serialized values**. This is evidence, not an assertion that every future valid timestamp representation must retain the old problem. The permanent gate is correct ID order, cursor behavior and read semantics.

**Actual serializer/SQL counterexample: NOT RUN locally.** A1 closes only after real CI records `legacyStringOrder:false` with the correctly ordered page, or equivalent actual failing-pair evidence. The user's accepted method does not require a deliberately failing full CI run. No general date parser/comparator, `Date.parse` precision reduction, mock database, sorted test output or skipped assertion is introduced.

## Local checks on the candidate

Environment: Node `v24.19.0`, npm `11.9.0`.

| Command/check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-fund` | PASS; lockfile unchanged. |
| `npm run check:boundaries` | PASS: product imports/contracts and token/style checks. |
| `node --check products/sprintique/tests/notifications.test.ts` | PASS: syntax only. |
| `git diff --check` | PASS. |
| `bridge check 20261012-notification-time-order` | PASS. |
| `npm run build` | BLOCKED before typecheck completed: installed TypeScript-Go panics on `readlink /proc/self/exe: no such file or directory`. Vite build was not reached. No compiler/runtime/lock substitution was made. |
| Kotlin/PostgreSQL API, detached extraction, portable image | NOT RUN locally; JDK25/PG18 unavailable in this environment. |
| Independent review | R1 changes-requested on the original tree; R2 independently approves scoped code/test review of `9943d62a` (published alias `fedf04cb`, same tree), closes F1/F2. Actual CI remains pending. |

## R1 corrections

[Canonical R1 index](reviews/R1.md) links the complete independent report preserved verbatim. F1 identified the millisecond-aligned cursor-boundary gap; its fixture is now `.500001Z`. F2 identified that read-by-id had already consumed the inclusive cutoff row; it now reads ordinal 3 and explicitly leaves ordinal 1 unread. No production behavior changed. Independent [R2](reviews/R2.md) confirmed both corrections in frozen `9943d62a6036f5052a13dbedb0713204d9407e59`; this is scoped code/test approval, not runtime PASS. Canonical R1 resolutions now link that confirmation. The historical original R1 findings/verdict remain unchanged, and real CI remains pending.

Post-R1 Node syntax, boundaries/styles, diff whitespace and bridge checks passed. A small integer predicate analysis of the corrected source's fixture also distinguishes both negative controls: exact cursor `(500001µs,9)` returns IDs `8..4`, while its millisecond truncation returns none; inclusive read-all leaves `[26]`, while strict read-all leaves `[1,26]`. This is a mathematical model, not PostgreSQL/API evidence. The known native `/proc` build blocker was not retried.

## R2 evidence and publication checkpoint

The [complete independent R2](reviews/evidence/independent-R2.md) is preserved verbatim (11,130 bytes), SHA256 `248d0841397f4818610a006017331c962aa81ec7ec4c2c8727ec30d5581ff23c`; [the canonical R2 index](reviews/R2.md) records scope, exact identities and the F1/F2 closure. Authored `9943d62a6036f5052a13dbedb0713204d9407e59` and published PR78 head `fedf04cb8e4c443b2e4567fb473a1f600868f2bc` have identical tree `4cea6e5c7bbbcf24b9284fa2516dcf8dca3ba709`. R1 bytes still match their original SHA256 `d39ac91a0e968607e3c95305ca1c6dcfb5389596846fa5cdc8b41b0392c62543`.

This final pre-CI documentation checkpoint changes bridge files only. Code review is complete; PR78 is waiting for actual CI. Root reported the initial run [38218385123](https://github.com/it-novikov/iquipage-design-system/actions/runs/38218385123) had started on `fedf04cb`; its completed logs/certificate were not inspected in this checkpoint. Publication of this documentation commit may supersede that run, so the next handoff must verify the actual published head and matching run. Do not publish further documentation-only checkpoints until useful CI results arrive. A1–A3 and full readiness remain open.

Only bridge format and diff checks are required for this documentation delta; no runtime/test source changed and the known local native build blocker was not retried.

## Reproduction and next gate

The default existing vNext workflow runs NT05 against real ephemeral services and again in detached extraction. Root publishes this last pre-CI documentation checkpoint; then inspect the matching completed certificate, raw `product-tests.log` / `detached-product.log` and the NT05 diagnostic. Independent scoped code review has passed; full readiness remains open until the applicable real CI checks pass.

For an environment with actual local JDK25/PostgreSQL18, the existing non-Docker runner can scope the Node file with `node scripts/test.mjs --only=notifications.test.ts` from the product. Docker mode currently does not honor `--only`; use its full existing gate rather than claiming a scoped Docker result. No workflow changes or reruns are part of this patch.

The raw prior CI artifact and working notes are in the task workspace's `research/continuation/ci-evidence/` and `research/continuation/nt05/`; they are not production data. The prior PR75 full PASS does not certify this new test candidate.
