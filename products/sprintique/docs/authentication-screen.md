# Sign-in screen

The sign-in screen is the IQUIPAGE `iq-auth-screen` with the product's form in its `form` slot, built from DS fields
and buttons (`web/sign-in.js`, styles in `web/shell.css`). It offers only what `GET /api/v1/auth/methods` reports:

1. **E-mail** — the address, then the six-digit code from the letter. Six digits typed or pasted sign in without an
   extra press; a wrong code says how many attempts are left; a new code can be requested after 30 seconds; "Другая
   почта" returns to the address.
2. **Google** and **Apple** — below a divider, as secondary DS buttons with the providers' own marks (Google's
   four-colour G, Apple's logo in the text colour), "Продолжить с Google/Apple".
3. **Local stand only** — "Локальный стенд: войти как admin" when dev login is on.

A provider that sends the browser back with an error lands on `/?sign-in-error=<code>`; the screen shows the message
once in the DS error region and removes the parameter from the address. A pending project invitation (`#invite/…`) is
kept across every way in.

With nothing configured the screen says so and points the administrator to [operations](operations.md#sign-in).

Sprintique shows no external identity provider's form: every way in starts on this screen.

## Verification

Checked on the local stand (`npm run dev:local`) in the browser: the address step, a wrong code (the attempts left),
the right code from `output/local-mail` opening a session, the provider error message, and the phone layout (375 px).
The Google and Apple buttons were checked visually with their markup on the page; their flows are covered by
`tests/sign-in.test.ts` against synthetic providers, not by a browser run against Google or Apple.
