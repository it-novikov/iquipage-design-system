# UX and design-system alignment (September 2026)

Private DS **0.6.0-vnext.7**. It covers the component audit of the whole Sprintique UI and the changes the owner approved.

## Owner decisions

| Question | Decision |
|---|---|
| Button focus | Ring shown for keyboard focus only (`:focus-visible`), not after a mouse click. |
| Saving a task | Existing tasks save each field automatically. A new task is still created with an explicit button. |
| Assignee | Only a current human project member can be the assignee. |
| Board admission | The rule stays the same. The board explains tasks that are waiting for a planned release. |

## Design system (vnext.3 → vnext.7)

- **vnext.3:** the R3 work list is a public entry. Tag tones have light and dark tokens. The type scale is tokenised. Dense surfaces get public variants. The keyboard focus ring is visible. The map canvas no longer collapses when the object library is open.
- **vnext.4:** on coarse pointers, buttons, section links, selects and checkboxes are 44px (`touch.css`, loaded last). Escape closes the map object library.
- **vnext.5:** `ui.menu` takes `{section}` labels, which keyboard navigation skips. Long menus scroll. Compact selects are 44px on touch screens.
- **vnext.7:** `iq-tag-picker` for catalog tags: coloured chips with remove buttons, search over project tags, creation through `iq-create`, and enter/leave motion that respects reduced motion. Whiteboard hosts get `selection-bar="none"` and `library-open`. Ghost and icon buttons, tags, segments, menu and list rows draw keyboard focus inside their own bounds, so the ring never overlaps a neighbour or gets clipped.
- **vnext.6:** public command dialog `iq-dialog kind="command"`, no longer tied to the demo `#command-dialog` id. Adds command groups, an empty state and the active row (`aria-selected`).

## Product

- **Assignee:** `app.tasks.owner_id` points to `auth.principals` (migration 016). Old free-text names that match exactly one member are mapped to that member. Names that don't match stay as `legacyOwner`, shown as "… · не участник", until someone reassigns the task. The API returns `422 TASK_OWNER` when an edit, a creation or a bulk planning change tries to assign a non-member.
- **Task drawer:** fields autosave, with the save status in the footer, "Повторить" (retry), and "Загрузить актуальную версию" to reload in place after a conflict.
- **Header:** "Workspace / Project" as two separate DS menus (switch workspace; switch, find or create a project), aligned with page content. No logo and no project avatar. Sections are a DS segmented control centred in the bar; on phones it moves to a second row.
- **Board:**
  - The title is the running release or sprint. A line above it gives the kind, the dates and the days left. It falls back to "Доска задач" when nothing is running.
  - Sorting is a ghost button with an icon, the same as Filters. Columns have a tighter header.
  - Task drawer tags use `iq-tag-picker`.
  - The waiting-release banner was removed at the owner's request.
  - Hierarchy lives on the cards, with no indentation and no hidden cards. A child names its parent by title, not by a second task number. A parent shows subtasks as done/total with a DS progress bar and expands into a compact list with each subtask's column.
  - Filters apply live, show how many tasks match, and stay visible as removable chips. Tags keep their colours.
  - Each card is one Tab stop, plus its drag grip and menu.
  - Target columns are listed directly in the card menu.
- **Planning:**
  - Quick edits and moves carry the projection revision.
  - Tasks can be reordered by hand: the `reorder` intent maps to the `rank` command. Reordering only works among siblings, and ranks are renumbered when they tie.
  - Labels are clearer, and on phones the whole page scrolls instead of an inner box.
- **Settings:** one DS section navigation over pages you can link to (`#settings/general|tags|templates|members|agents|operations`). Release format is a radio choice. Time zones are searchable comboboxes. Tag colours are DS tag swatches.
- **Maps:** clicking an object opens the properties panel on the right, with no selection bar above the canvas. The object library stays open on the left and can be collapsed. The "+ Заметка" button is gone. The menu is a grouped `iq-menu` dropdown. Template categories use the DS segmented control. History rows span the full width. The canvas runs edge to edge.
- **Feedback:** successes and failures show as DS `notify` toasts. ⌘K is a DS command dialog: focus stays in the field, arrow keys move the active row (`aria-activedescendant`). It doubles as a command palette with destinations, settings pages, new task, project switcher, theme and profile. Every section shows a DS skeleton while it loads.
- **Search:** case folding uses `pg_c_utf8`, so a Cyrillic query matches regardless of case.
- **Local stand:** `npm run dev:local` signs in with admin / admin and seeds mock workspaces. See the README; it is refused in production and on any non-loopback origin.
- **Style contract:** `npm run check:styles` fails on px font sizes, raw radii and colours, DS-internal selectors, and inline styles.

## Known gaps

- On the board, the drag handle inside a card is smaller than 44px on touch screens. The whole card surface is still a tap target.
- In a hidden or background browser tab, DS dialogs finish closing only once their close animation runs, because Web Animations pause while the tab is hidden. Visible tabs are not affected.
