# Authentication screen

Import `@iquipage/web/styles.css` and call `registerCore()` from `@iquipage/web/core`.

```html
<iq-auth-screen
  product="Your product"
  heading="Welcome back"
  description="Continue to your team's workspace."
  context-title="Ideas become shared results."
  context-description="Your product's short, factual description."
  action-label="Continue"
  action-href="/auth/login"
  hint="Your organization's sign-in page will open.">
</iq-auth-screen>
```

All attributes are plain text. Navigation accepts root-relative paths or credential-free
HTTPS URLs only. Without a valid destination the action is a button. Handle the bubbling,
cancelable `iq-auth-action` event for custom flows; preventDefault cancels navigation.
The library never reads credentials, creates sessions, or imports a provider SDK.

## Composition and state

- `product`, `heading`, `description`, `context-title`, `context-description`: copy.
- `action-label`, `action-href`: built-in action. `hint`: next-step explanation.
- `pending` (boolean attribute), `pending-label`: disable the built-in action and announce progress.
- `error`: escaped alert text. Remove it when a retry begins.
- Named slots: `brand`, `tools`, `context`, `form`, `footer`.

Place slot roots as direct children **before connecting** the element. Keep the roots
stable; their internal content can change freely. A `form` slot replaces the built-in
action. The host owns native form submission, validation, disabled fields, and routing.
Attribute changes preserve the consumer's subtree, listeners, focus and draft values.
Nested consumer slots stay inside their own components. Arbitrary late insertion/removal
of slot roots is outside the contract.

## Visual contract

The screen extends the existing IQUIPAGE catalog, not a new visual identity. Canvas and
surface tokens establish the two regions without shadows, decorative graphics or
additional accent colors. Shared primary buttons carry the only principal action.
Existing display/body/caption roles establish hierarchy; spacing follows the shared scale.
On wide screens the context and entry are side by side. At 760px and below the entry
comes first visually, with context below it. All essential controls remain in the header
and entry; the supporting context must not contain interactive actions that depend on
visual reading order. `data-theme="dark"` uses the standard theme tokens.

`examples/authentication.html` demonstrates idle, pending, error and retry states.
`tests/fixtures/auth-screen.html` exercises focus, form lifecycle, nested slots and navigation.
The example uses synthetic states, not real identity-provider calls.

Sprintique uses OIDC: its adapter supplies product copy, theme control and invitation
preservation. The password/provider page is owned by the configured identity provider.

## Credential dialog (0.6.0-vnext.6)

Use `iq-auth-dialog` when credentials must be entered, rather than `iq-auth-screen`
(which is only an optional context/redirect composition). Wrap it in `iq-auth-stage`
for the centered layout. It is a persistent entry form, not a focus-trapping modal.

```html
<main class="iq-auth-stage">
  <iq-auth-dialog product="Sprintique" heading="Вход в Sprintique"
    action="/session" remember-me></iq-auth-dialog>
</main>
```

The host must provide its own authorized credential endpoint; `/session` is an example,
not an endpoint implemented by this library. Without `action` the form emits a cancelable
`iq-auth-submit` event and performs no request. Its detail contains transient username,
password and rememberMe values: never log, persist, put into URLs or analytics. Use
`pending`/`error` for asynchronous states and `clearPassword()` after handling credentials.
Native validation, autocomplete, password visibility and error associations are included.
`recovery-href` and `registration-href` opt into real host routes; omit unavailable features.
Configuration attributes are initial; error and pending are reactive without remounting.

## Keycloak theme

The package includes `keycloak/iquipage`, a native Keycloak 26.7.3 login theme extending
`keycloak`. It maps the unchanged upstream templates to shared IQUIPAGE form classes
and packages the exact same CSS. Copy this folder to `/opt/keycloak/themes/iquipage`
and select `iquipage` as the realm Login theme. Forms still POST to Keycloak's generated
loginAction; field errors, recovery, optional registration, remember-me, locale selection,
MFA and broker links remain owned by the upstream templates. No password grant or
credential proxy is introduced. Recovery and registration follow realm policy.

The source of the adapter contract is Keycloak 26.7.3's native theme properties and
base login template: https://github.com/keycloak/keycloak/tree/26.7.3/themes/src/main/resources/theme.
A real isolated provider smoke verified wrong/valid passwords and code+PKCE exchange;
MFA, broker and recovery flows were inherited, not individually acceptance-tested.
