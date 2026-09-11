# UX v3.4 — preview source update

This update contains the owner-reviewed board/task/canvas/navigation refinements and the additive DS candidate `0.6.0-board.7`. It is prepared for the existing `feature/board-production` PR, not a production integration or official vendor release.

The shared compact Markdown editor and controlled `footerActions` API are documented in `MARKDOWN-COMPACT.md`. Task descriptions, discussion composition and replies use compact density. The decision action persists the existing discussion flag, retains the draft on failure, and protects lost-response retries. Published discussion states reuse DS badges. The pinned `design-system/` stays unchanged.

Other accumulated preview changes include inline tags and overflow, cover crop and six generated illustrations, readable task routes, compact task layout, navigation/search composition, canvas inspector/session overlays and safe preview editing. Current cover sources are in `assets/covers-v3.3`; the generated module is committed for deterministic offline builds.

## Current local verification

- 173 unit/HTTP tests pass.
- Targeted Chromium suites pass: `browser-editor-actions-v34`, `browser-thread-actions-v34`, `browser-editor-preview`, `browser-thread-pages` (server/browser), `browser-board-interactions`, `browser-ux-v3`, `browser-focus-navigation-v33`, `browser-ds-v3`.
- Delivered offline preview passes create-task, decision-discussion publication and reload with no external HTTP requests.
- DS and discussion layouts checked at 320/390/768/1440 in light/dark themes; manual Chrome inspection completed.
- Build, diff whitespace check and pinned DS integrity (297 files) pass.

These are targeted current results, not a claim that the full legacy `npm run verify` or remote CI passed for v3.4. The legacy B2 browser script still contains pre-v3 selectors such as the removed description-edit button and standalone checklist controls; its migration remains outstanding. No CI checks were removed or weakened. The new targeted suites can be run individually after `node scripts/build.mjs`.

## Remaining boundaries

Compact upload is separate from the approved Markdown-editor request. Standalone TypeScript compilation, Safari/Firefox, physical input and actual browser zoom were not run. The owner's focus-neutral-button request remains an explicit accessibility exception, not WCAG acceptance. Production API/auth/storage, deployment and official DS promotion require separate integration work. Historical delivery archives are not regenerated or represented as containing this update.
