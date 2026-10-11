# Documents (vnext.48)

Additive, reviewed public contracts for documents with navigation. Existing defaults are unchanged.

## Navigation

`iq-tree navigation appearance="plain" density="compact" hide-counts` removes the outer card, decorative icons and descendant counts. Native independent disclosure remains. Items, selection, cancelable `iq-navigate`, controlled `expandedIds`, keyboard arrows and focus preservation are unchanged. Compact rows are at least 36px; coarse pointers or viewports up to 720px use 44px rows and disclosure buttons. Visual indentation stops growing after six levels; semantic `aria-level` and full accessible labels retain the actual hierarchy. A host supplies at most 1000 nodes and controls which branches are expanded. Long labels wrap without changing their accessible name.

## Public layout

Use `.iq-document-layout` around `.iq-document-rail` and a main region. Put `.iq-document-bar` before `.iq-document-content`. The rail is 248px; the remaining column can shrink to zero, and document content is centered with a maximum width of 76ch. Host content must respect this width, including long titles. At 720px the rail hides; the host must offer navigation through an existing `iq-dialog`/drawer with a labelled trigger, focus trapping and return. This composition does not manage application routes, permissions, network, focus or drafts.

`.iq-document-title` styles a heading or labelled textarea consistently. For a textarea the host keeps `rows="1"`, updates its height from scrollHeight after input/layout changes, and never replaces the focused field. H1 remains the document identity in reading, history and conflict views. Edit mode gives its title field an accessible name.

## Editor

`iq-markdown-editor variant="document" label="Текст страницы"` has an unobtrusive full toolbar and preview toggle. The informational Markdown/counter footer and duplicated visible label are hidden. Accessible naming remains on the textarea and preview. Caller toolbar actions, footer actions, their hints, cancel and submit controls remain available; their disabled/readonly, validation, undo and keyboard behavior are unchanged. An otherwise empty footer hides. The variant changes CSS only, so toggling the attribute or resizing does not replace the textarea, its selection, composition session or undo history. The default/full/chat/minimal variants are unchanged.

## Viewer outline

`viewer.headings` returns a fresh array of `{id, level, text}` records, where level is 1–6 and text is rendered plain text. It is derived from the existing safe Markdown render, without a second parse. Logical IDs are deterministic for the same rendered source, unique by heading ordinal (`heading-1` etc.), and local to the viewer. Each viewer assigns a separate DOM namespace; a current, historical and conflicting document can coexist without duplicate DOM IDs. IDs can change when headings are added or removed; use the latest snapshot.

`viewer.focusHeading(id, {scroll: true})` returns true after focusing its own current heading; optional scrolling uses immediate block-start placement. Invalid, stale or disconnected targets return false without focus or scrolling. It never changes location.hash. `iq-outline-change` bubbles with `{headings}` after the outline changes. The event and value updates never request focus. Snapshot mutations do not alter internal state.

Hosts should keep outline presentation bounded for large documents (for example, a filterable disclosure showing an initial 50 entries with an explicit continuation). The full snapshot contains every heading; do not imply that a truncated visible list is the whole document. A short document need not show an outline.

The vnext.48 patch corrects the plain-tree count/label selectors to match its rendered DOM; all other vnext.47 behavior is preserved.
