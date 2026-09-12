# Planning completion — 2026-09-12

Owner confirmed `it-novikov/iquipage-design-system`, same branch `feature/vnext-planning-ui`, one PR #3. Approved R2 stays authoritative; no legacy Sprintique support.

## This implementation boundary
Complete consumer workflows for close/carry-forward, cancellation/history, formats/settings, schedule/milestone/dependency views, explicit bulk selection, controlled drag and windowing, and strict host integration. Production backend remains assigned to the parallel backend agent. At start of this run origin/main is f3dd146 and no backend/contracts branch is visible. No assumed HTTP paths, no production database or identity fallback.

## DS ownership
Pinned design-system/ and maps/ source remain unchanged. Proposed additive source-owned `packages/work-list` controller implements the previously documented DS-GAP PL-DS-01 using published IQUIPAGE primitives/tokens. It imports no Task/Release models, grants, API or product routes. Standalone entry, declarations, isolated acceptance and promotion note are required; it does not replace the library extraction owned by the parallel track. `iq-roadmap` and `iq-plan` remain the only timeline/calendar renderer.

## Required acceptance before consumer review
- Incomplete work disposition, explicit acceptance, open parent with accepted child pinned, duplicate/reordered response, new destination created atomically in fixture and preserved contract for backend.
- Date-only, separate deadline, flexible/timeboxed defaults, cancel, history, no hidden auto-ripple or publish/deploy.
- Tree default expansion, none/assigned/inherit, bulk snapshots, hidden selection, DnD/menu parity, manual ordering, focus and shared scrolling.
- Cursor and window lifecycle, abort, stale response, lost ACK with journal/recovery, clean consumer boundaries.
- Browser light/dark/responsive, current v3.4 task/board/maps, complete source archive and clean unpack recheck.

Statuses distinguish UNIT_PASS, UI_FIXTURE_PASS and INTEGRATED_PASS. New backend/PG, independent DS extraction, production ACL and optional importer cannot be reported complete from a fixture. No merge/deploy is authorized by this scope.
