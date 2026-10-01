# DS-GAP T1–T4 — contract for IQUIPAGE 0.6.0-vnext.28

Additive and backward compatible: the existing `iq-tree` element, `.tree-row` and its current look stay as they are.
New classes are opt-in modifiers. Tokens only (no raw colours, radii or px font sizes; the library's style gate).

## T1 — tree rows with aligned right columns

A container (any element) sets `class="tree-columns"` and the column track list in `--tree-columns` (default
`88px 116px 60px 64px`) and the gap in `--tree-column-gap` (default 16px). Inside it:

```
<div class="tree-row has-columns" role="treeitem" aria-level=".." style="--tree-level:N">
  <span class="tree-row-main">                 <!-- flex: disclosure, icon slot, label; carries the indent -->
    <span class="tree-disclosure">chevron|empty</span>
    <span class="tree-node-icon">glyph or .tree-checkbox</span>
    <span class="tree-node-label">…<span class="tree-node-crumb">Эпик / </span>…<span class="tree-node-aside">ещё 1 в …</span></span>
  </span>
  <span class="tree-cell">…</span> <span class="tree-cell is-end">…</span> …
</div>
```

`.tree-row.has-columns` is a grid `minmax(0,1fr) var(--tree-columns)`; the indent (`21px × --tree-level`, plus 16px
base inline padding, 8px end padding) applies to `.tree-row-main` only, so cells align across levels. Row: min-height
40px, radius 8px (the existing small radius token), 1px transparent top and bottom border with
`background-clip: padding-box` so adjacent filled rows keep a 2px gap (also for `.is-selected`). Cells: meta size,
`--iq-muted`, one line with ellipsis, tabular numbers; `.is-end` right-aligned; `.is-strong` ink;
`.is-warning` `--iq-warning`; `.is-faint` `--iq-faint`; `.is-editable` gets a dotted underline in `--iq-control` on row
hover and `cursor:pointer` (use on a `<button class="tree-cell-button">` inside the cell, a reset button that inherits
font and colour). `.tree-node-crumb` and `.tree-node-aside` are `--iq-faint`, weight 400; aside has 10px start margin.
`.tree-row.is-branch .tree-node-label` weight 500. Priority tone on the label: `.tree-row[data-tone=critical]
.tree-node-label` uses `--iq-task-critical-text`, `[data-tone=high]` `--iq-task-high-text`, both weight 500.
Selected row (`.is-selected`): `--iq-accent-soft` fill, accent text; focus-visible stays the DS focus fill.

## T2 — status glyph in board tones

`statusGlyph(status, {label?, size=15}) -> string` exported from `@iquipage/web/core` (and the root entry), typed in
`types/core.d.ts`. Returns `<span class="iq-status-glyph" data-shape=".." data-tone=".." role="img" aria-label="..">svg</span>`.
`status` is one of the board columns or an explicit `{shape, tone}`:

| status | shape | tone | default label |
|---|---|---|---|
| ready | ring | neutral (`--iq-control`) | Готово к работе |
| in_progress | half | info | В работе |
| review | half | warning | Ревью |
| ready_for_testing | ring-dot | planned | Готово к тестированию |
| testing | half | warning | Тестирование |
| ready_for_release | check | success | Готово к релизу |

Shapes: ring = circle r 5.75 stroke 1.5; half = ring + right half filled; ring-dot = ring + dot r 2.4; check = filled
circle r 6.5 with a check in `--iq-surface` stroke 1.8 (15×15 viewBox). Colour via `currentColor` from the tone
token. Also export `STATUS_GLYPHS` (the table above, frozen) and a `.iq-status-word` class (meta size, muted) for the
grey word shown only for review, ready_for_testing («к тестированию») and testing.

## T3 — hold-to-drag in the tree

`bindTreeDrag(options) -> {destroy(), cancel()}` exported from `@iquipage/web/core`, typed. No drag handle; the DS
never moves or saves data, it reports intent.

```
options = {
  root: HTMLElement,                         // contains containers and rows
  rowSelector = '[data-tree-drag]',          // draggable rows; value = the row's id
  containerSelector = '[data-tree-dropzone]',// drop containers; value = container id; rows inside are candidates
  holdMs = 200, slop = 6,                    // drag starts after holding 200 ms or moving 6 px with the button down
  canDrag?: (row) => boolean,
  ignore = 'input,textarea,select,[contenteditable],[data-tree-nodrag]', // presses here never start a drag
  items?: (row) => string[]                  // ids carried (selection, or epic + children); default [row id]
  preview?: (row, ids) => {html?: string, badge?: string} // ghost content; default: a clone of the row
  canDrop?: ({ids, containerId, afterId}) => boolean,
  onDrop: ({ids, sourceContainerId, containerId, afterId}) => void|Promise<void>,
  onState?: (active:boolean) => void,
  label?: (ids) => string                    // for the live region
}
```

During a drag: the source rows get `data-tree-dragging` (styled at 35% opacity), `document.documentElement` gets
`data-tree-drag-active` (cursor grabbing), the ghost `.iq-tree-drag-ghost` (raised, shadow-3, radius 10, slight
rotate -0.6deg, pointer-events none, follows the pointer) shows the preview with `.iq-tree-drag-badge` (primary
pill, meta size, top-right) when `badge` is given. The target container gets `data-tree-drop-target` (inner 1.5px
`--iq-accent` outline via inset box-shadow); an insertion line `.iq-tree-drop-line` (2px accent with an 8px dot at the
start) sits between rows at the computed position; `afterId` is the root row the block lands after (null = first).
Rows that are descendants of a dragged row are skipped as positions. An empty container (`[data-tree-dropzone]`
without rows) shows the outline only. Escape cancels; pointer up outside any container cancels. After a drag the
following click is suppressed; a short click (released before 200 ms and within 6 px) is a normal click. Auto-scroll
the nearest scroll parent near its edges. Reduced motion: no ghost transition. A polite live region announces start,
target and result. Keyboard moving is the host's job (it has the data); export `treeDropLine(container, afterRow)`
helper only if useful.

Undo hook: `onDrop` may return `{undo: () => Promise<void>, message?: string}`; the DS then shows `notify({tone:
'success', message: message || 'Перенесено', action:{label:'Отменить', run: undo, undo:true}})`.

## T4 — «Готово» divider and muted rows

`<div class="tree-divider" role="separator" aria-label="Готово, 3"><span>Готово · 3 · 18 ч</span></div>` : 36px high,
6px top margin, padding-inline-start 16px, label caption size, weight 500, `--iq-faint`, followed by a 1px
`--iq-line` rule filling the rest (`::after`).
`.tree-row.is-muted`: label `--iq-muted`, cells `--iq-faint`, no priority tone (`[data-tone]` ignored), the status
glyph keeps its shape; its tone stays success for ready_for_release (owner: «a success check glyph»).
