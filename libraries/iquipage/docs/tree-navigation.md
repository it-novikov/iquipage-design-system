# Tree navigation, vnext.46

`iq-tree` keeps its existing branch/leaf selector and `checkable` mode. The optional boolean `navigation` attribute makes every node a navigable document, including parents. `checkable` takes precedence if both are present. Items retain the existing `TreeNode[]` schema and stable IDs; current selection remains `value: string[]` with one ID.

```html
<iq-tree navigation heading="" hide-search aria-label="Страницы проекта"></iq-tree>
```

`heading` defaults to «Страницы»; an empty value omits the heading. `hide-search` omits the built-in title filter when the application provides full-content search. `search-label` defaults to «Найти страницу» and names the built-in search input; `aria-label` names the tree. All labels are plain text. These attributes affect navigation mode only. It does not render a repeated selected-page status or a leaf-count header. Parent counts retain their existing descendant-leaf meaning.

A click on a row or Enter/Space opens that node. A separate labelled native button expands or collapses a parent. ArrowRight expands and then moves to the first child; ArrowLeft collapses or moves to its parent. Up/Down/Home/End move the roving focus. The current row and its expansion button are keyboard reachable. Expansion never selects a different document.

Before selecting, the tree emits bubbling, cancelable `iq-navigate` with `{id, previousId}`. `preventDefault()` leaves `value` unchanged, does not emit `iq-change`, and does not take focus back from a dialog opened by the consumer. For an asynchronous dirty-draft decision, cancel synchronously, resolve the decision, then assign `tree.value = [id]` and load the page. An accepted intent updates value and emits the existing `iq-change` event. It is navigation intent, not a persistence command or permission check.

`expandedIds: string[]` reads/sets the expanded IDs. A user expansion emits bubbling `iq-expand` with `{expandedIds}`. Programmatic `value`, `items` and `expandedIds` updates are silent. Consumers may store and reapply expansion across routing. A refreshed item snapshot preserves valid selection/expansion and restores focus inside the tree; it never steals focus from an external editor. Removed focused rows fall back to the first visible row. Use stable IDs, not array indexes.

Existing limits remain 1000 nodes and depth12. A caller must reject incomplete server catalogs rather than silently presenting truncated navigation as complete. Authorization, archived pages, dirty drafts, full-content search and deep links belong to the application.

## ADR — 2026-10-11

The approved wiki needs parent pages that open independently of child expansion and an explicit point to preserve unsaved drafts. An additive navigation mode keeps existing selector consumers unchanged and avoids a product-side tree replacement. A cancelable synchronous intent supports both immediate and asynchronous guards without teaching the library about storage or dialogs. Expansion and selection remain independent public state. The alternative of changing the default parent Enter behavior would break existing selectors and was rejected.

Tests cover canceled/accepted parent navigation, guard focus, expansion without navigation, silent state updates, refreshed items, external focus, escaping/optional chrome and legacy/checkable behavior. Browser acceptance of the final wiki composition remains a separate gate.
