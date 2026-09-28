# @iquipage/web

Independent, source-owned Web Components library. Build with Node 24: `npm run build`; package with `npm pack`. No Sprintique imports, domain models, credentials or product build steps are permitted here.

Consumers import `@iquipage/web/core`, `/advanced`, `/whiteboard` and `/styles.css`. The core entry does not eagerly register advanced components. Tokens and types are part of the package. Source version 0.6.0-vnext.0 includes the approved compact editor, decision action, cover crop and board UX extensions. The historical 0.5.7 snapshot remains untouched elsewhere in the repository.

`products/sprintique` consumes a packed release, not this source directory. Updating the library requires rebuilding and explicitly replacing that release and lockfile. Publishing to an external registry is a separate owner-approved operation. Package remains private until distribution/licensing is settled.

## Authentication screen

`iq-auth-screen` is a provider-neutral, responsive authentication composition in
`@iquipage/web/core` (0.6.0-vnext.5). It uses the catalog's existing semantic colors,
type scale, mark and buttons. See [integration and design contract](docs/authentication.md)
and [interactive example](examples/authentication.html) after `npm run build`.

For actual credential entry use `iq-auth-dialog` (0.6.0-vnext.10). The interactive authentication
example demonstrates the form, not just a provider redirect. The Keycloak login theme that
shipped from vnext.9 to vnext.20 was removed in vnext.21: no product uses an external
identity provider's form any more.

## Readable soft success and warning (0.6.0-vnext.21)

`--iq-success-bg` and `--iq-warning-bg` are now pale tints like `--iq-danger-bg` and `--iq-info-bg`
(they were the saturated fills, so `.iq-badge.soft.success/.warning`, alert emblems and toast
icons lost their text, worst in the dark theme). The saturated colours stay available as
`--iq-success-fill` and `--iq-warning-fill`; `.iq-pro-state.is-error` uses the fill. Text on the
tints keeps at least 4.5:1 in both themes. The Keycloak theme is gone from the package.

## Drawer motion, unread counts and arrowheads (0.6.0-vnext.20)

- `iq-dialog kind="drawer"` slides in opaque from the right while its backdrop fades in, and slides out while the backdrop fades out; the closing motion is dropped once the dialog is closed, so the next open starts clean. Other dialogs keep their short fade, now with the backdrop fading too.
- `.iq-properties[data-columns=auto]` keeps two columns down to 272px per column (a 664px drawer).
- `.iq-discussion-new-count` ("Новые: N", accent) sits next to the open-question count; `.iq-thread-actions-group` holds the left-hand actions of a question card.
- Avatars take a photo: `ui.personAvatar({id, name, image})`, `ui.avatarGroup([...{image}])` and select options with `avatar.image` draw the photo over the initials (the fallback while it loads). Only same-origin paths, `blob:` and `https:` URLs are used.
- `iq-image-crop appearance="bare" mask="circle"` shows a round opening for personal photos; an empty bare stage opens the file chooser, and the chooser reads "Выбрать изображение" until an image is loaded.
- `iq-file-picker variant="button"` is a quiet ghost action (for a section head); `drop-target="<selector>"` lets the closest matching region take dropped files and marks it `data-file-drop` while files are over it.
- Whiteboard connectors end in a filled 12×10.8 arrowhead with a notched back (the template preview geometry, in canvas units).

## Discussions, property grid, cropping and editors (0.6.0-vnext.19)

- Discussions: `.iq-discussion` holds `.iq-discussion-questions` (open questions as framed `.iq-thread[data-kind=question][data-state=open]` cards with `.iq-thread-flag` and one resolve action), `.iq-discussion-timeline` (comment threads and resolved questions, which collapse into one `.iq-thread-line`), and `.iq-composer`. Messages are `.iq-message` with an avatar, `.iq-message-author`, `.iq-message-time` and the text; replies are `.iq-message[data-size=reply]` in `.iq-thread-replies` (one level). Space separates items: no dividers and no row fills. `ui.personAvatar(person, {size})` draws one decorative disc with the person's stable tone. The `help` icon marks questions.
- Chat composer: `iq-markdown-editor variant="chat"` puts a short toolbar (bold, italic, link, lists, quote, code) in the footer; `idle="line"` rests as one 36px field until focus or typing; `cancel-label` adds "Отмена" (`iq-cancel`, cancelable; the default clears the draft); `expand()`, `collapse()`, `reset()` and `expanded`. `footerActions[].appearance: 'chip'` with `icon` renders a compact pressed toggle whose hint shows under the footer. Ctrl/⌘+Alt+Enter submits with `detail.alternate`. Escape with a draft steps out of the field first.
- Inline document editor: `density="compact"` with `preview-on-blur` reads as the text itself (no chrome in preview, an inset hover surface); the host gets `data-previewing`. Task descriptions and map object text use it.
- `.iq-properties[data-columns="2|auto"]`: label and value rows in two columns (auto collapses to one below 272px per column); 96px labels, ghost value triggers that bleed 8px to the left, icons in values. `iq-select appearance="pill"` is the one filled value, with an 8px dot in the option tone (`info`, `warning`, `success`, `danger`). `iq-select searchable` (with `search-placeholder`) keeps the closed control a value and puts the search inside the open list; options take `meta` (right-aligned, also after the chosen label) and `separator`.
- `iq-tag-picker appearance="inline"`: tags as a quiet line; 24px chips whose × appears on hover or focus, a borderless input and the "+" right after it; the label stays for assistive technology.
- `iq-dialog.show({instant:true})` opens without entrance motion, for a surface that replaces another in the same frame.
- `iq-image-crop appearance="bare"` for use inside a dialog: the whole image stays visible under a scrim around a fixed frame; drag, wheel, pinch, arrows, +/−/0; one toolbar row. `letterbox` allows "Вписать" (the frame contains the image, the empty part shows a blurred copy of it) next to "Заполнить"; `fit('fill'|'contain'|'auto')`, `normalizedValue`, `mode`, `chooser` ("Другое изображение"). `heading`/`description` replace `title`/`subtitle`: never set the HTML `title` attribute on the element.
- With `dock="side"` the zoom group sits directly under the tool rail; "Всё" leaves it (Shift+1 still fits the board).

## People, sections, relations and tags (0.6.0-vnext.18)

- Avatars: `.iq-avatar.xs|sm|lg` (20, 24, 44px; 28px by default in groups), `.iq-avatars.xs|sm|lg` with a quarter-size overlap. `ui.avatarTone(key)` gives one person one tone everywhere (a stable hash of the id or name). `ui.avatarGroup(people, {size, max:3, label})` renders at most three discs (two and "+N" when there are more), one `iq-tooltip` with every name, and one accessible label.
- `.iq-section` / `.iq-section-head` / `.iq-section-count` / `.iq-section-actions`: a zone of a long surface with a divider and a heading row (icon, 16px title, count, one action).
- Compact editors cap content headings (h1 16px, h2 and h3 14px), so they never outgrow the surface's section headings.
- `.iq-property-strip` chips are 32px without a chevron; `.iq-properties` uses one 136px label column (88px on phones) with 12px labels.
- `iq-relation-map`: each group is a lane named by the role of its nodes towards the centre ("Блокируют эту задачу", "Ждут эту задачу", "Связанные", "Родительская задача", "Подзадачи N из M"); open blockers draw amber edges and mark the centre "Заблокирована"; nodes are 76px with two-line titles; nodes may carry `done`; `labels` overrides the texts.
- `iq-tag-picker creatable` shows a trailing "+" inside the field (it asks the host to create a tag through `iq-create`) instead of a "+ Новый тег" chip; Backspace in an empty field first marks the last tag, a second Backspace removes it.
- `.iq-color-field`: `.iq-color-legend` with a live preview, `.iq-color-swatch` circles filled with each tone's text colour (radios, arrow keys), `.iq-color-swatch-custom` last, `.iq-color-custom` for the native picker and hex.

## Relation map and embedded boards (0.6.0-vnext.17)

- `iq-relation-map` (registered by `registerCore()`) draws one object's relations in the visual language of the workflow graph, without an editor: the current object in the centre, its parent above, children below (up to six, then "Ещё N"), what it depends on to the left with arrows into it, what it blocks and what it relates to on the right (related links dashed). Set `value = {center, parent, dependsOn, blocks, related, children, childrenDone}`; nodes are `{id, title, key?, status?, tone?, icon?, linkId?}`. A node click emits `iq-open {id}`; unless `readonly`, a removable link emits `iq-remove {id, linkId}`. Hosts narrower than 560px get a grouped list with the same cards.
- `.iq-board-chip` (with `.iq-board-chip-title`) is the title chip of an embedded board: top right, it steps away while a board panel is open. `.iq-board-sync[data-state=saved|saving|syncing|dirty]` is its save-state button (turning icon while saving, warning when unsaved); pair it with `iq-tooltip` for the explanation.
- Every embedded board with `dock="side"` keeps its rail at the top left, whatever its `editor-mode`.
- The "Визуальная доска" showcase now shows the board as Sprintique Maps uses it: `surface-mode="embedded"`, `dock="side"`, `dock-tools="select"`, `selection-bar="none"`, search, templates and the board menu as `hostActions`, and the title chip with the sync state.

## Task drawer building blocks (0.6.0-vnext.16)

- `iq-markdown-editor.toolbarActions = [{id,label,icon?}]` adds up to three host actions at the end of the toolbar. They exist only while editing; a click emits `iq-editor-action` with `{id}`. `empty-action-label` and `empty-action` add a quiet button to the empty preview that emits the same event. With `preview-on-blur`, Escape leaves editing without closing the surrounding dialog.
- `iq-select` and `iq-combobox` options may carry `avatar: {text, tone}` and `tone`; the closed control shows the chosen option's avatar (or icon) and sets `data-tone` on the trigger, and `data-empty` on the element.
- `.iq-property-strip` turns selects, comboboxes and date fields into value-first chips without visible labels (labels remain for assistive technology). Priority tones `high` and `critical`, and `iq-date-field[data-tone=danger|warning]`, use the task signal colours.
- `.iq-inline-title` is a heading that is its own input: no frame at rest, a frame on hover and focus.
- `.iq-color-field` composes palette swatches, a native colour input and a hex field.
- `tagToneAttributes(tone)` returns the attributes for a tag colour: a palette tone name, or any `#RRGGBB`. Custom colours get `data-tone="custom"`; the fill and text are derived from the hue for light and dark themes (readable on any colour), and the colour is registered in a shared stylesheet, so pages need no inline styles. `iq-tag-picker` accepts hex tones.

## Settings (0.6.0-vnext.15)

`registerCore()` registers `iq-settings-layout` and `iq-visual-choice`.
See [the interactive example](examples/settings.html) after building the library.

- `iq-settings-layout` fills the width of its container: the navigation column (264px, `--iq-settings-nav-width`) sits flush left and stays in view while the content scrolls; the content is one left-aligned column up to `--iq-settings-measure` (1120px). Slots: `navigation`, `heading` and default content. At 760px and below the host sets `view="index"` (only the navigation) or `view="section"` (only the content). It does not own routing, API requests or form persistence. Set `--iq-app-header-height` when a product header sits above it.
- `settingsNavigation(groups, activeId)` returns the grouped links drawn with the DS side navigation (`.product-nav-link`, neutral current item, quiet group labels with `role=group`). Items have `id`, `label`, optional `icon`, and optional `count` with `countLabel` for things that need a decision. Put the `.iq-settings-title` and a `.product-nav-search.iq-settings-search` field above it; the host owns search, the `#settings/:id` routes and permission filtering.
- `.iq-page-heading` is the shared page heading: `.iq-page-heading-copy` (h1 in a 48px row and `.iq-page-heading-lead`) and `.iq-page-heading-tools` for the section's primary action. `.iq-page-heading-back` appears on phones.
- Compositions: `.iq-settings-stack` (40px rhythm), `.iq-settings-group` (h2, description, actions, count), `.iq-settings-panel` with `.iq-settings-row` (media, copy with title and meta, aside for a value, badge or select, actions with at most one visible button and an `iq-menu`; `a`/`button` rows are a single action with a chevron; `data-state="muted"`), `.iq-settings-field-row` (label left, control right), `dl.iq-settings-facts` (read-only values), `.iq-settings-lock` (read-only notice), `.iq-settings-savebar` (sticky, hidden until the form changes), `.iq-empty.compact`, `.iq-secret` (a value shown once, with copy), `.iq-choice-list` (radios with descriptions), `.iq-choice-grid` (a permissions matrix) and `.iq-settings-skeleton`.
- People who cannot change a setting see facts and a lock notice, never a disabled form.
- `iq-visual-choice` takes an `options` property of `{value, label, description?, preview?}`. Supported previews: `light`, `dark`, `system`, `comfortable`, `compact`. Set its `label` attribute for the accessible group name. Native radios support Tab and arrow keys. The `value` attribute/property and `disabled` attribute are reactive. A user choice emits bubbling `iq-change` with `{value}`. The selected card gets an accent ring on the same surface.

Optional root attributes `data-accent="blue|violet|green"`, `data-density="comfortable|compact"`, and `data-motion="system|reduced"` apply token-backed preferences. Density changes library table cells and task cards; status tones stay semantic. Use `data-theme="light|dark"` for the resolved theme. The host should resolve the system preference, persist settings, and report storage failures. System reduced-motion is always respected. Do not persist user preferences inside these components.
