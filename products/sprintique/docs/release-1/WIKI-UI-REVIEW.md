# SPR-17 standalone UI: implementation and acceptance

Historical author report for the first composition. The user rejected that UI; it has been replaced by the revision 2 redesign. Current implementation evidence is in WIKI-REDESIGN-AUTHOR-REVIEW.md, with independent final reviews in WIKI-FINAL-EXPERIENCE-REVIEW.md and WIKI-FINAL-TECHNICAL-REVIEW.md. This report does not certify the current UI.

The wiki now uses the shared project navigation and page header, public iq-tree navigation from exact DS .46, Markdown editor/viewer, standard fields, menus, dialogs and settings rows. Application CSS owns only the sidebar/document geometry and responsive visibility. Canonical routes are #wiki, #wiki/archive, #wiki/new and #wiki/page/<id>[/edit|/history[/revision]]; reserved words remain legal page IDs. No second shell or private DS override was added.

The sidebar retains expanded branches and query, opens parent pages independently of expansion, and searches active title/body through the typed API. Query requests are canceled and late responses ignored. Archive uses the bounded complete catalog and local title filtering, showing50 rows at a time. The document has one edit action, contextual history/move/archive commands, explicit save/cancel and quiet metadata. On narrow screens catalog and document occupy the same column; a back action returns to the retained catalog query.

Editor input is never replaced by catalog/realtime updates. Navigation guard offers save, stay or explicit discard; beforeunload covers dirty and pending states. CAS retains the draft, reads the current page and requires explicit review before saving with that revision. A later conflict requires a new review. PUT and restore use repository-stable command keys; successful acknowledgments are followed by GET, so a partial receipt is not rendered as a page. Read-only projects expose no writing controls. Rights remain enforced server-side.

History lists50 versions per cursor and exposes full content before restore. Restore copies title/body into a new revision; parent is preserved server-side. Move excludes the page and descendants; archive-parent validation remains server-owned. Archive restore has an explicit parent choice. Backlinks are read-only and open the actual task. Task drawer wiki attachment integration is deliberately deferred until SPR-16/078 is merged; this does not change external material records.

Loading uses public skeleton atoms composed as catalog/document shapes. Initial errors end loading with a retry. Later background refresh retains the visible page until a response arrives, does not take focus from search/editor, and keeps existing backlinks on errors. Routes, search, history and backlinks have separate abort/generation guards. Close aborts reads and writes, unsubscribes, clears timers and removes listeners.

## Automated evidence

Node24:8 new model/command/state tests cover reserved routes, tree/archive/parent candidates, CAS review and renewed conflict, stable create ID/payload, bounded input and aborted/superseded response guards. With navigation-speed and page-surfaces,27/27 PASS. Product typecheck/build and boundary/style checks PASS on the pre-browser implementation. Logs: /tmp/wiki-ui-targeted.log, /tmp/wiki-ui-build.log, /tmp/wiki-ui-boundaries.log. Repository refreshAll expectation awaits root's matching wikiPages/wikiTaskLinks update; this was reported rather than hidden.

## Browser acceptance plan — not yet executed

Use only root's079 disposable fixture. Create parent/child → edit → save → reload; open parent by title and expand separately by keyboard; move then confirm catalog/parent after reload. Draft → another page/section/project/browser Back → stay/save/discard. Two-tab CAS keeps own title/body, review-current then explicit save; reader controls absent, revoked write retains copyable text. Search title/body and pagination, clearing search restores expansion. History preview then restore new revision; parent unchanged. Archive leaf/restore including archived-parent choice; active-child parent archive blocked. Backlink opens task. Light/dark at desktop and390px, actual DOM theme/width plus viewed screenshots, no overflow. Long Markdown, initial/error/retry, delayed responses after route change and close. Record actual evidence and any omitted fixtures separately; unit/build is not runtime acceptance.

No production writes, Git commit/push or deployment were performed by the UI author. DS .46 independent Linux budget PASS is recorded separately in WIKI-DS-REVIEW.md.
