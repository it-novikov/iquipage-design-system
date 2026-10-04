# Workspace composition — vnext.31

Additive CSS API, imported through `@iquipage/web/styles.css`; no JS component or hidden DOM.

- `.iq-workspace-page`, `.iq-workspace-heading`, `.iq-workspace-eyebrow`, `.iq-workspace-tools`: page hierarchy.
- `.iq-workspace`: rail and content. `.iq-workspace-nav` is a labelled native `nav`; links/buttons use `aria-current="true"` only for the selected destination. `.iq-workspace-nav-label`, `-note`, `-count`, `-group`, `-separator` compose its contents. `data-navigation="hidden"` makes a single column.
- `.iq-workspace-body`, `.iq-workspace-toolbar`, `.iq-workspace-search` (label wrapping a labelled search input), `.iq-workspace-caption`, `.iq-workspace-empty`.
- `.iq-workspace-split`, `.iq-workspace-primary`, `.iq-workspace-aside`: primary work + supporting context. Below 1250px context follows work; below 900px rail becomes wrapping labelled navigation. Host must keep a sensible DOM reading order and focus revealed content.
- Public hooks `--iq-workspace-nav-width` (192px), `--iq-workspace-aside-width` (300px).
- `.iq-plan-panel.tree-columns[data-layout=workspace]` is a labelled section with `data-active="true"` for the current stage. `.iq-plan-header`, `-meta`, `-state`, `-title`, `-goal`, `-actions`, `-summary`, `-progress` (native progress), `-columns`, `-key`, `-add`, `-collapse`, `-placeholder` compose it. Columns match public `--tree-columns` and `--tree-column-gap`. The last column is an always-visible labelled menu button. Under 700px properties reflow below the full title; `.tree-cell[data-label]` exposes its label.
- `.iq-plan-collapse` is a native button with `aria-expanded` and `aria-controls`; the host changes `[hidden]` on the body. Hidden bodies cannot receive focus. Search may disable collapse while showing context ancestors.

States: hover uses the theme hover role; active navigation uses accent-soft/accent; focus retains the public focus ring. Loading/errors/empty/readonly remain host content, not fake demo data. All styles use semantic tokens, support light/dark/contrast and reduced motion. Never put independent scroll traps inside a narrow rail.

Tree selection uses labelled button checkboxes and roving treeitem focus; Space selects, Enter opens, menu provides keyboard alternatives to drag. A filtered plan must retain ancestor context; it must not silently reorder hidden neighbours. Summary/progress always describes the full underlying stage, not only search matches.

Compatibility: additive; old `.tree-columns` unchanged without the layout attribute. Roll back the consuming product and its exact tarball together. No backend migration.


## vnext.34 summaries and comparisons

`iq-summary-panel` groups a labelled summary; `iq-metric-grid` is a native dl with four columns, two below 900px. `iq-comparison-table` is a native table whose td[data-label] properties reflow below 700px. Use scope=col headers, a caption, and data-numeric for formatted amounts. Hosts own calculations, currency isolation and actions. `iq-feature-list` is a native ul of icon + strong/small content.

`iq-auth-screen[layout=welcome]` opts into an editorial welcome layout with a framed entry region and retained 360px form width on desktop. It preserves slots, live attribute updates and all provider controls. Below 760px the entry comes before product context. Default auth/consent layout is unchanged.
