# IQUIPAGE 0.6 changes (0.6.0-vnext.1 → vnext.21)

The 0.6 line is the source-owned library in `libraries/iquipage`. Each release is built, tested and packed here, and the Sprintique product adopts the exact tarball (`products/sprintique/vendor`). Releases are private; nothing is published to a registry.

Release flow: change the source, raise the version in `package.json`, `package-lock.json`, `src/entries/core.js`, `types/core.d.ts`, `tokens/semantic.json` and `PROVENANCE.json`, add a `tests/vnextN.test.cjs` contract, run `npm test` and `npm run build`, then `npm pack --pack-destination ../../products/sprintique/vendor`. The product updates its README checksum, `package.json`, the lockfile `resolved`/`integrity`, `tests/library-contract.ts` and its docs, then runs `npm ci`. A tarball that a merged commit consumes is never rewritten; the next change gets the next version.

| Version | What changed |
|---|---|
| vnext.1 | First public entries for the vNext product: core, advanced, whiteboard and work-list builds with types. |
| vnext.2 | Security fixes from the R4 audit (five library fixes). |
| vnext.3 | Work list as a public entry; tag tones with light and dark tokens; tokenised type scale; dense variants; visible focus ring; the map canvas no longer collapses with the library open. |
| vnext.4 | 44px targets on coarse pointers (`touch.css`, loaded last); Escape closes the map object library. |
| vnext.5 | `ui.menu` section labels skipped by the keyboard; long menus scroll; compact selects are 44px on touch screens. |
| vnext.6 | Public command dialog `iq-dialog kind="command"` with groups, empty state and active row. |
| vnext.7 | `iq-tag-picker`; whiteboard `selection-bar="none"` and `library-open`; focus rings drawn inside their own bounds. |
| vnext.8 | `iq-roadmap[fill]`; visible work-list header; `.iq-loading` (invisible for 180 ms) and `.iq-reveal`; calendar entries as task cards; `iq-markdown-editor[preview]`. |
| vnext.9 | `iq-auth-dialog`, `iq-auth-screen` and the IQUIPAGE Keycloak login theme. |
| vnext.10 | Whiteboard `dock="side"` with host actions under "+", host side panels; `iq-file-picker`; "+ Новый тег" in the tag picker. |
| vnext.11 | Fixed-height task light field; side rail at the top; `iq-roadmap[flow]`; editor `empty-text`. |
| vnext.12 | `formatDate`, `formatDateTime`, `formatDateRange` (04.10.2000 14:00); structured `iq-tooltip heading`; editor footer actions as checkboxes; `.iq-properties`; `.iq-badge.soft`; rail tooltips to the right; no middot separators. |
| vnext.13 | Closed structured tooltips never show; focus opens tooltips only for the keyboard; `iq-whiteboard dock-tools`; switchers underline on hover. |
| vnext.14 | Settings workspace from PR #8 (`iq-settings-layout`, `iq-visual-choice`, `settingsNavigation`, accent, density and motion preferences), merged with vnext.9–13. |
| vnext.15 | Settings redesign: full-width layout, navigation on the DS side navigation, page heading, groups, row panels, facts, field rows, save bar, compact empty state, one-time secret, choice list and grid. |
| vnext.16 | Task drawer blocks: editor `toolbarActions`, empty-state action and Escape back to preview; select and combobox show the chosen avatar and tone; `.iq-property-strip`, `.iq-inline-title`, `.iq-color-field`; any RGB tag colour through `tagToneAttributes()`. |
| vnext.17 | `iq-relation-map`; `.iq-board-chip` and `.iq-board-sync` for embedded boards; side rail at the top of every embedded board; the "Визуальная доска" showcase configured like Sprintique Maps. |
| vnext.18 | `ui.avatarGroup` and `ui.avatarTone`; `.iq-section` heads; relation map lanes named by role, centre "Эта задача" with a blocked flag; tag picker "+" inside the field and two-step Backspace; `.iq-color-swatch` radios with a custom RGB swatch. |
| vnext.19 | `.iq-discussion` and the chat composer (`variant="chat"`, `idle="line"`, chip actions, alternate submit); `ui.personAvatar`, `help` icon; inline document editor; `.iq-properties[data-columns]`, `iq-select appearance="pill"`, `searchable`, option `meta`/`separator`; `iq-tag-picker appearance="inline"`; `iq-dialog.show({instant})`; `iq-image-crop appearance="bare"` with `letterbox`; side-dock zoom under the rail. |
| vnext.20 | Drawers slide in opaque with a fading backdrop (and out on close); property grid columns from 272px; `.iq-discussion-new-count`, `.iq-thread-actions-group`; filled notched arrowheads on whiteboard connectors; photos in avatars (`image`); `iq-image-crop mask="circle"` and file choice from an empty bare stage; `iq-file-picker variant="button"` with `drop-target`. |
| vnext.21 | `--iq-success-bg` and `--iq-warning-bg` are tints (soft badges, emblems and toast icons readable in both themes); `.iq-pro-state.is-error` on `--iq-warning-fill`; the Keycloak login theme removed. |

The README describes each public API in detail; `PROVENANCE.json` records where every approved extension came from; `tests/vnext*.test.cjs` hold the contracts.
