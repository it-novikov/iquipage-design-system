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

## Settings (0.6.0-vnext.14)

`registerCore()` now registers `iq-settings-layout` and `iq-visual-choice`.
See [the interactive example](examples/settings.html) after building the library.

- `iq-settings-layout` provides persistent `navigation`, `heading`, and default content slots. It uses two columns on desktop and navigation above content below 760px. It does not own routing, API requests or form persistence.
- `settingsNavigation(groups, activeId)` renders escaped, grouped links with `aria-current`. Groups have a label and items with `id`, `label`, and optional `icon`. The host owns the `#settings/:id` routes and permission filtering.
- `iq-visual-choice` takes an `options` property of `{value, label, description?, preview?}`. Supported previews: `light`, `dark`, `system`, `comfortable`, `compact`. Set its `label` attribute for the accessible group name. Native radios support Tab and arrow keys. The `value` attribute/property and `disabled` attribute are reactive; changing `value` preserves the focused input. A user choice emits bubbling `iq-change` with `{value}`.
- Shared styles include `iq-settings-heading`, `iq-settings-section`, `iq-settings-fields`, `iq-settings-status`, `iq-accent-options`, and `iq-accent-option`. Existing `iq-setting-row` and `ui.toggle()` complete the composition.

Optional root attributes `data-accent="blue|violet|green"`, `data-density="comfortable|compact"`, and `data-motion="system|reduced"` apply token-backed preferences. Density changes library table cells and task cards; status tones stay semantic. Use `data-theme="light|dark"` for the resolved theme. The host should resolve the system preference, persist settings, and report storage failures. System reduced-motion is always respected. Do not persist user preferences inside these components.
