# UX and design-system alignment (September 2026)

Private DS **0.6.0-vnext.5**. It covers the component audit of the whole Sprintique UI and the changes the owner approved.

## Owner decisions

| Question | Decision |
|---|---|
| Button focus | Ring shown for keyboard focus only (`:focus-visible`), not after a mouse click. |
| Saving a task | Existing tasks save each field automatically. A new task is still created with an explicit button. |
| Assignee | Only a current human project member can be the assignee. |
| Board admission | The rule stays the same. The board explains tasks that are waiting for a planned release. |

## What changed

- **DS (vnext.3 → vnext.4):** the R3 work list is a public entry. Tag tones have light and dark tokens. The type scale is tokenised. Dense surfaces get public variants. The keyboard focus ring is visible. The map canvas no longer collapses when the object library is open. On coarse pointers, buttons, section links, selects and checkboxes are 44px. Escape closes the object library.
- **Assignee:** `app.tasks.owner_id` points to `auth.principals` (migration 016). Old free-text names that match exactly one member are mapped to that member. Names that don't match stay as `legacyOwner`, shown as "… · не участник", until someone reassigns the task. The API returns `422 TASK_OWNER` when an edit, a creation or a bulk planning change tries to assign a non-member. An owner who is unchanged is not checked again, so a person who left the project does not block other edits.
- **Task drawer:** fields autosave. A change saves 300 ms after a pick, or 900 ms after typing stops. The footer shows the save status and offers "Повторить" (retry). On a revision conflict, "Загрузить актуальную версию" reopens the task in place. Closing the drawer first saves anything still pending.
- **Board:** a banner counts tasks in planned (not started) releases and links to Planning.
- **Planning:** owner quick-edit and drag moves send the projection revision, which the contract now accepts. A stale revision gets `409 PROJECTION_STALE`. Labels changed: "Исполнитель", "Выбрать все задачи / найденные". Dates no longer wrap. On phones the whole page scrolls instead of an inner list box.
- **Search:** case folding uses `pg_c_utf8`, so a Cyrillic query matches regardless of case, whatever the database collation.
- **Shell:** every section shows a DS skeleton while it loads.
- **Style contract:** `npm run check:styles` fails on px font sizes, raw radii and colours, DS-internal selectors, and inline styles.

## Known gaps

- R3 manual row reorder stays hidden. The server does not advertise a `reorder` capability, and the product has no reorder command yet.
- The compact select in the Planning toolbar is 36px on touch screens. On the board, the drag handle and title button inside a card are smaller than 44px, but the whole card surface is a tap target.
- Still open from the critique: map menu → `iq-menu` toolbar, live board filter chips, a command palette, settings side navigation, toasts for success messages.
