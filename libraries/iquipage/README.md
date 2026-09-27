# @iquipage/web

Independent, source-owned Web Components library. Build with Node 24: `npm run build`; package with `npm pack`. No Sprintique imports, domain models, credentials or product build steps are permitted here.

Consumers import `@iquipage/web/core`, `/advanced`, `/whiteboard` and `/styles.css`. The core entry does not eagerly register advanced components. Tokens and types are part of the package. Source version 0.6.0-vnext.0 includes the approved compact editor, decision action, cover crop and board UX extensions. The historical 0.5.7 snapshot remains untouched elsewhere in the repository.

`products/sprintique` consumes a packed release, not this source directory. Updating the library requires rebuilding and explicitly replacing that release and lockfile. Publishing to an external registry is a separate owner-approved operation. Package remains private until distribution/licensing is settled.

## Authentication screen

`iq-auth-screen` is a provider-neutral, responsive authentication composition in
`@iquipage/web/core` (0.6.0-vnext.5). It uses the catalog's existing semantic colors,
type scale, mark and buttons. See [integration and design contract](docs/authentication.md)
and [interactive example](examples/authentication.html) after `npm run build`.

For actual credential entry use `iq-auth-dialog` (0.6.0-vnext.10). The same release includes
the native `keycloak/iquipage` theme so OIDC products can present the form at the identity
provider without collecting passwords in the application. The interactive authentication
example now demonstrates the form, not just a provider redirect.

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
