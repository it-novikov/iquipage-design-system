# UX and design-system alignment (September 2026)

Private DS **0.6.0-vnext.14**. It covers the component audit of the whole Sprintique UI and the changes the owner approved.

## Owner decisions

| Question | Decision |
|---|---|
| Button focus | Ring shown for keyboard focus only (`:focus-visible`), not after a mouse click. |
| Saving a task | Existing tasks save each field automatically. A new task is still created with an explicit button. |
| Assignee | Only a current human project member can be the assignee. |
| Board admission | The rule stays the same. The board explains tasks that are waiting for a planned release. |

## Design system (vnext.3 → vnext.14)

- **vnext.3:** the R3 work list is a public entry. Tag tones have light and dark tokens. The type scale is tokenised. Dense surfaces get public variants. The keyboard focus ring is visible. The map canvas no longer collapses when the object library is open.
- **vnext.4:** on coarse pointers, buttons, section links, selects and checkboxes are 44px (`touch.css`, loaded last). Escape closes the map object library.
- **vnext.5:** `ui.menu` takes `{section}` labels, which keyboard navigation skips. Long menus scroll. Compact selects are 44px on touch screens.
- **vnext.14:** the settings workspace from PR #8 (`iq-settings-layout`, `iq-visual-choice`, `settingsNavigation`, theme, accent, density and motion preferences), merged with vnext.9–13. Its styles load after the component styles and use the DS type scale, the page title matches other section headings, and navigation icons come from the DS set.
- **vnext.13:**
  - A closed structured tooltip is never displayed, and focus opens tooltips only for keyboard navigation.
  - `iq-whiteboard dock-tools` lets the host choose the canvas tools in the dock.
  - Switchers underline their label on hover instead of filling the background, like the navigation.
- **vnext.12:**
  - `formatDate`, `formatDateTime` and `formatDateRange` in core: dates read as 04.10.2000, and 04.10.2000 14:00 with time. The date field and the Gantt use them.
  - `iq-tooltip heading` gives a structured tooltip: a title and one line per row.
  - Editor footer actions are DS checkboxes with an optional `hint`, not pill toggles.
  - `.iq-properties` is a compact property list: label on the left, quiet value on the right.
  - `.iq-badge.soft` gives tinted statuses for dense lists.
  - On the side rail, tooltips appear to the right of the button.
  - No middot separators in DS text.
- **vnext.11:** the task card light field has a fixed height, so expanding subtasks no longer stretches it. The side rail starts at the top edge, level with the object library. `iq-roadmap[flow]` grows to its content and leaves vertical scrolling to the page. `iq-markdown-editor` takes `empty-text` for an empty preview.
- **vnext.10:** whiteboard `dock="side"`: a vertical rail on the left, where host commands (`hostActions`) sit under "+". `openHostPanel`/`closeHostPanel` show a host side panel with the same slide motion as the object library, and only one of the two is open at a time. `iq-file-picker` is one picker (compact row or DS dropzone) that hands files to the host, which uploads them. The tag picker gets a "+ Новый тег" bubble that asks the host to create a tag.
- **vnext.9:** `iq-auth-dialog` (built from DS fields, `iq-check` and `iq-alert`, with configurable labels) and `iq-auth-screen`, plus the IQUIPAGE Keycloak login theme. The theme has one language, no locale switcher, and a DS icon button for switching theme.
- **vnext.8:** `iq-roadmap[fill]`: the Gantt grid is the only scroller. Work lists show a visible column header. `.iq-loading` holds skeletons and stays invisible for the first 180 ms, and `.iq-reveal` fades content in, so fast loads never flash. Calendar entries render as DS task cards with key, priority signal, entry kind and owner, never the raw id. `iq-markdown-editor[preview]` opens straight in preview.
- **vnext.7:** `iq-tag-picker` for catalog tags: coloured chips with remove buttons, search over project tags, creation through `iq-create`, and enter/leave motion that respects reduced motion. Whiteboard hosts get `selection-bar="none"` and `library-open`. Ghost and icon buttons, tags, segments, menu and list rows draw keyboard focus inside their own bounds, so the ring never overlaps a neighbour or gets clipped.
- **vnext.6:** public command dialog `iq-dialog kind="command"`, no longer tied to the demo `#command-dialog` id. Adds command groups, an empty state and the active row (`aria-selected`).

## Product

- **Assignee:** `app.tasks.owner_id` points to `auth.principals` (migration 016). Old free-text names that match exactly one member are mapped to that member. Names that don't match stay as `legacyOwner`, shown as "… · не участник", until someone reassigns the task. The API returns `422 TASK_OWNER` when an edit, a creation or a bulk planning change tries to assign a non-member.
- **Task drawer:** fields autosave, with the save status in the footer, "Повторить" (retry), and "Загрузить актуальную версию" to reload in place after a conflict.
- **Page heading:** the board and planning share one heading (`.sq-page-heading`): the title on the left, the section's tools on the right, the same height and padding. Switching sections never moves content.
- **Header:** "Workspace / Project" as two separate DS menus (switch workspace; switch, find or create a project), aligned with page content. No logo and no project avatar. Text never joins facts with middots; it uses words, commas or separate labelled facts. Sections are the DS work navigation (text tabs, the current one underlined on the header's bottom edge, as on the DS site), centred in the bar; on phones they move to a second row. Project and workspace actions are handled once, by the navigation.
- **Board:**
  - The title is the running release or sprint, or "Доска задач" when nothing is running. Kind, dates and days left are shown only in planning.
  - Expanding subtasks toggles the list in place, without re-rendering the board, so card light never flickers.
  - Sorting is a ghost button with an icon, the same as Filters. Columns have a tighter header.
  - Task drawer tags use `iq-tag-picker`. New tags are created from its "+ Новый тег" bubble through the tag dialog; settings no longer create tags. A new task opens with focus on its title. The tags row spans the full drawer width, like files. After a second design council, the drawer follows the DS reference task drawer. It is one 780px column: the title, then the properties in a 2×N grid with labels on top (Статус, Исполнитель, Приоритет, Срок, Релиз, Тип, and Родительская задача across the full width), a dividing line, then the description at its natural height, tags, files, links and discussion. In fullscreen the properties move into a sticky side column. A cover, when set, is a banner above everything; otherwise "Обложка" sits in the drawer header. "Требует решения" in the comment composer is a DS checkbox with a hint. An existing task opens its description as a preview; an empty one reads "Нажмите, чтобы добавить описание".
  - Every file field (task files and cover, image replacement, map import, quick capture) uses DS `iq-file-picker`. The description opens at its final height, with no shrinking animation.
  - Horizontal scroll is remembered only while switching sections. A reload starts at the first column.
  - The waiting-release banner was removed at the owner's request.
  - Hierarchy lives on the cards, with no indentation and no hidden cards. A child names its parent by title, not by a second task number. A parent shows subtasks as done/total with a DS progress bar and expands into a compact list with each subtask's column.
  - Filters apply live, show how many tasks match, and stay visible as removable chips. Tags keep their colours.
  - Each card is one Tab stop, plus its drag grip and menu.
  - Target columns are listed directly in the card menu.
- **Planning:**
  - Quick edits and moves carry the projection revision.
  - Tasks can be reordered by hand: the `reorder` intent maps to the `rank` command. Reordering only works among siblings, and ranks are renumbered when they tie.
  - Labels are clearer, and on phones the whole page scrolls instead of an inner box.
  - Rebuilt after a design council (UI designer and art director, UX researcher, DS lead). One switch chooses the view: "Список", "Гант" or "Календарь". A second switch chooses "Текущие" or "Архив" (formerly "История"). The toolbar has search, readiness ("Все", "Черновики", "Готовы к работе"), sorting as a ghost button ("Вручную", "По приоритету", "По сроку") and "Фильтры" with a count.
  - A release header gives the name, a filled status ("Идёт", "Запланирован", "Завершён", "Отменён") and the kind on the first line. The second line gives labelled facts: dates, task count, progress "Готово N из M" and timing ("Осталось 9 дней", "Старт через 10 дней", "Просрочен на 3 дня"). There is one action per state: "Начать спринт", "Открыть доску" or "Завершить спринт", and "Добавить задачу" is written out.
  - Rows have no drag dots: a task is dragged by its number. Statuses are soft badges, and a draft is a separate "Черновик" badge. The column header appears once.
  - Releases and backlog are separate cards. Each has a DS column header whose checkbox selects that group (checked, mixed or empty). After a manual pick, the bulk bar offers "Выбрать все по условиям".
  - Rows have no type icon. Subtasks hang on a tree line under the parent's arrow, and parents show how many subtasks they have.
  - No refresh buttons. Live events keep the data current, events that arrive during a dialog are applied when it closes, and returning to the tab re-reads the plan.
  - The Gantt has one scroller, the planning page. The roadmap keeps its full height, so release groups are never cut off in a nested box; the grid scrolls only sideways.
  - Calendar cards look like board cards.
- **Settings:** a settings workspace (PR #8). A persistent, searchable navigation groups the sections ("Для меня", "Проект", "Пространство"), and every section has a link (`#settings/<id>`). Names are edited in place with explicit saving and protection against losing changes. Theme, accent, density and reduced motion apply at once and are kept in the browser. Release format is a radio choice. Time zones are searchable comboboxes. Tag colours are DS tag swatches.
- **Maps:** clicking an object opens the properties panel on the right (432px, without position and size fields: those are set on the canvas), with no selection bar above the canvas. The dock is a rail on the left. Under "+" (object library) it holds search, templates and the map menu. The library and the menu slide out from the rail and back into it. The rail is aligned to the top, level with the library; the object library starts closed; rail tooltips open to the right. The dock keeps only "Выбрать": connections are made from object ports, and the board is moved by scrolling. The toolbar row is gone: the map title floats as a chip in the top right corner. The properties panel covers it, and it fades out while a board panel such as search is open. The save state is a sync button. Its structured tooltip gives the state, the map kind, that saving is automatic and when it was last checked. A click saves, loads the newest revision and confirms with a toast. The "+ Заметка" button is gone. Template previews are miniature boards (titled areas, lined notes, arrowed links) that lift and draw on hover. The menu is a grouped `iq-menu` dropdown. Template categories use the DS segmented control. History rows span the full width. The canvas runs edge to edge.
- **Feedback:** successes and failures show as DS `notify` toasts. ⌘K is a DS command dialog: focus stays in the field, arrow keys move the active row (`aria-activedescendant`). It doubles as a command palette with destinations, settings pages, new task, project switcher, theme and profile. Every section shows a DS skeleton while it loads.
- **Search:** case folding uses `pg_c_utf8`, so a Cyrillic query matches regardless of case.
- **Local stand:** `npm run dev:local` signs in with admin / admin and seeds mock workspaces. See the README; it is refused in production and on any non-loopback origin.
- **Style contract:** `npm run check:styles` fails on px font sizes, raw radii and colours, DS-internal selectors, and inline styles.

## Known gaps

- On the board, the drag handle inside a card is smaller than 44px on touch screens. The whole card surface is still a tap target.
- In a hidden or background browser tab, DS dialogs finish closing only once their close animation runs, because Web Animations pause while the tab is hidden. Visible tabs are not affected.
