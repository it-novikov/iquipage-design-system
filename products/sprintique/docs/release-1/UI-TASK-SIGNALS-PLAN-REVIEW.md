# Independent composition review: task signals and full-width pages

Decision: **GO for the proposed composition and implementation scope; final source/visual acceptance pending.** Base main73f9109, branch fix/task-signals-full-width. This is a review of the stated design intent and current public contracts, not approval of an unfinished implementation or production visual result. Reviewer changed only this report.

The compact shared row under the title is appropriate: priority describes urgency; a lock plus explicit «Заблокирована» describes a separate constraint. Danger ink without a solid filled blocker badge lowers the competing visual weight while preserving the blocker label. Existing priority semantics and task identity must remain intact; blocking must not silently become critical priority, and normal/low should retain their intended quiet presentation. Epic identity remains separate where relevant.

Removing outer page gutters is the user's explicit scope. Apply zero padding/max:none at the page boundary, not recursively to components. Wiki/legal reading measure and useful form widths remain bounded; panel/card/header internal padding remains. Full available page width is compatible with readable bounded text inside the page. Settings require a documented public part/hook; overriding private generated markup is not acceptable.

## Acceptance coverage before final approval

| Criterion | Required evidence |
| --- | --- |
| A1 compact signals | Real board/card/list/planning/workbench tasks with normal/low/high/critical, blocked and unblocked, one and multiple blockers; signals share a wrapping row without separate oversized grid items or blank residual height. Priority and blocker remain distinguishable in both themes. |
| A1 reason and semantics | Actual escaped blocker names/count, meaningful title/ARIA, no synthetic reason when source lacks details. Card/task opening continues to expose blocker details to touch users; native hover title alone is insufficient. Do not turn noninteractive text into a keyboard stop. |
| A2 full width | Board, planning, workbench, maps header/canvas, wiki, finance, agents, settings, legal and auth explicitly inventoried. Confirm outer boundary padding0/no limiting page max, while inner controls/readable content retain their padding/measure. Shared mobile overrides must not reintroduce outer gutters. |
| A2 geometry | Actual1280 and390: no document-wide unintended overflow, clipped primary actions or inaccessible edge controls; intentional board/map/table scroll remains local. Long titles/unbroken text and both signals wrap without pushing avatar/menu/status away. Settings navigation and form widths remain usable. |
| A3 interaction/accessibility | Narrow/coarse actionable targets44, keyboard focus/menus/dialogs unchanged, contrast of danger/priority ink measured against both backgrounds; icon and word carry meaning beyond color. Empty/loading/error/reader states use the same outer boundary. |
| A4 public delivery | Versioned DS51 documented/types/tests, exact archive/adoption and unchanged budgets; source freeze, independent source/actual visual review, full CI, compatible fallback and post-deployment proof. |

The inventory above is an acceptance matrix, not a claim that every route has already passed. Auth and legal still need explicit author scope decisions about the outer shell versus their intentionally bounded inner form/copy. A naked global `padding:0` or `max-width:none` on descendant components would exceed the approved boundary and weaken the design.

No confirmed release-blocking design finding in the stated proposal. Final approval requires actual composition and frozen implementation evidence. Source/API/rights/backend changes are outside this repair scope.
