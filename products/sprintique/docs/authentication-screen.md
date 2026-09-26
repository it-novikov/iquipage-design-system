# Credential entry

Unauthenticated Sprintique preserves a pending invitation and redirects directly to
`/auth/login`. OIDC sends the browser to the real identity-provider credential form.
The old contextual landing page is no longer a required step.

`@iquipage/web` 0.6.0-vnext.10 supplies both the reusable `iq-auth-dialog` (username,
password, reveal, validation, error/pending) and the `iquipage` native Keycloak theme.
Sprintique does not receive or forward passwords. The OIDC code+PKCE/session flow is unchanged.

## Configure the provider

`local-identity.mjs` installs the theme and selects it when creating a **new** isolated
local identity stack. Existing containers/realms are deliberately not recreated or
silently changed. For an existing provider, copy the installed package's
`keycloak/iquipage` folder to `/opt/keycloak/themes/iquipage`, select Login theme
`iquipage` in Realm settings → Themes, and use the normal provider rollout procedure.
The package resource resolves via `@iquipage/web/keycloak/theme.properties`.

If the theme has not been installed, the existing provider form still works with its
current appearance. Deploying the product alone does not update the provider theme.
Do not enable registration, password recovery, or remember-me solely for appearance;
these controls follow the realm's actual capabilities. Local Sprintique retains its
existing disabled registration/recovery policies.

## Verification

A separate loopback-only Keycloak 26.7.3 with synthetic accounts verified native login,
invalid-password errors, successful authorization code and PKCE token exchange. Browser
checks covered both themes, mobile, password visibility and locale controls. This is
local evidence, not production deployment or a full end-to-end Sprintique session test.

## Language and local stand

- The sign-in page has one interface language. The theme sets `locales=ru` and hides Keycloak's locale switcher even if a realm enables internationalization. The local realm is created with internationalization off.
- On the local stand (`npm run dev:local`), Sprintique shows the same `iq-auth-dialog` for the test account. When only an organisation provider is configured, the app goes straight to it. Its short hand-off card appears only if the redirect is slow.
