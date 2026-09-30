# Operations and release boundary

This runbook separates reproducible local checks from an external release. Never connect these migrations to the old platform database. Do not publish generated QA secrets or reuse them outside the local environment.

## Runtime configuration

One artifact, `sprintique-server.jar` (JDK 25), runs three commands: `api` (default), `worker` and `migrate`. Every setting is an environment variable with the `SPRINTIQUE_` prefix, all named in `server/src/main/resources/application.yaml`.

API requires `SPRINTIQUE_DATABASE_URL`, `SPRINTIQUE_PUBLIC_ORIGIN`, SMTP for sign-in codes (`SPRINTIQUE_SMTP_HOST`, `SPRINTIQUE_MAIL_FROM`, see [Sign-in](#sign-in)), `SPRINTIQUE_STORAGE_ENDPOINT`, `SPRINTIQUE_STORAGE_REGION`, `SPRINTIQUE_STORAGE_BUCKET`, `SPRINTIQUE_STORAGE_ACCESS_KEY_ID`, `SPRINTIQUE_STORAGE_SECRET_ACCESS_KEY`, and `SPRINTIQUE_ENVIRONMENT=production` in production. Optional: `SPRINTIQUE_HOST` (default `127.0.0.1`), `SPRINTIQUE_PORT` (`4311`), `SPRINTIQUE_WEB_ROOT` (the built interface), Google and Apple sign-in, `SPRINTIQUE_STORAGE_PREFIX` (object keys under a prefix). `SPRINTIQUE_PUBLIC_ORIGIN` is an origin without a trailing slash. HTTPS is required outside loopback; sign-in providers always require HTTPS. The server refuses to start, before it listens, on unsafe configuration or an owner/superuser/BYPASSRLS database role.

`SPRINTIQUE_TRUST_PROXY` must be set when the API runs behind the TLS reverse proxy: a hop count (usually `1`) or the exact comma-separated proxy addresses. Per-address request and login limits then apply to the real client; without it every user shares the proxy address and one client can exhaust the login window for everyone. Leave it unset only when clients connect directly. Responses from an HTTPS origin carry HSTS, `Cross-Origin-Opener-Policy: same-origin` and a restrictive `Permissions-Policy`.

The `migrate` command uses a separate `SPRINTIQUE_MIGRATION_DATABASE_URL`, `SPRINTIQUE_DATABASE_RUNTIME_ROLE` and `SPRINTIQUE_DATABASE_WORKER_ROLE`. Runtime and worker roles must be LOGIN NOSUPERUSER NOBYPASSRLS, not migration owners. It applies the ordered immutable Flyway ledger (`db/migration` inside the artifact). The API and readiness check that the applied history equals the artifact's exactly: a changed, missing or unknown migration fails, and the log names it. Never edit an applied SQL migration: add another file.

A database created by the previous TypeScript migrator (`public.schema_migrations`, no `flyway_schema_history`) is adopted on the first `migrate`: its rows must be an exact prefix of the known ledger (`db/previous-ledger.json`, same names and SHA-256), Flyway then records that version as its baseline and applies only the later files. A ledger that differs anywhere refuses to migrate and names the first differing file; nothing is changed. The old table stays for audit. Take a backup before adopting a database that holds real data.

## Features behind switches

`SPRINTIQUE_FEATURES` names the features a process serves: a comma-separated list, `all` or `none`. Left empty it means `all` outside production and `none` when `SPRINTIQUE_ENVIRONMENT=production`, so a feature reaches production only when it is named there. An unknown name stops the process at start. A disabled feature's routes answer `404` as if they did not exist; `/api/v1/session` lists the enabled ones for the interface. Rollback is switching a feature off: the schema stays, project routes stay canonical.

| Feature | What it serves |
|---|---|
| `workbench_read_internal` | `GET /api/v1/workbench`, `/workbench/list`, `/projects/:p/tasks/:t/personal` and the `/workbench` pages |
| `workbench_personal_state` | «Участвую» and its order, seen and snooze commands (private, own revisions and receipts) |
| `workbench_requests` | Directed requests to an exact recipient ("Нужно действие") |
| `workbench_waiting` | "Жду": participating tasks the person assigned to someone else, with a private check-back date |
| `workbench_plan_horizon` | `GET /api/v1/workbench/plan` (Сегодня / 7 дней) and the time-zone preference |
| `workbench_mvp` | The "Рабочий стол" item in the global navigation for everyone |

Production default: all off. A pilot names them explicitly, for example `SPRINTIQUE_FEATURES=workbench_read_internal,workbench_personal_state,workbench_requests,workbench_waiting,workbench_plan_horizon` (internal) plus `workbench_mvp` for the cohort. `SPRINTIQUE_WORKBENCH_CURSOR_SECRET` (32+ characters) signs the Workbench page cursors; without it each API process uses a random key, so cursors do not survive a restart and several API processes need one shared value. Workbench logs and metrics carry routes and status classes only, never titles, project names or cursors.

## Sign-in

People sign in three ways; the sign-in screen offers only the configured ones (`GET /api/v1/auth/methods`).

- **A code by e-mail** — the base method, required in production. `POST /auth/email/start` sends a six-digit code; `POST /auth/email/verify` checks it. The code lives ten minutes, allows five attempts and works only in the browser that asked (an HttpOnly challenge cookie; the database holds only hashes); a new code from the same client replaces that client's previous one once its letter has left. A browser that once signed in to an address by a code keeps a device cookie (`__Host-sprintique-device`, 180 days; the database holds its hash; one token covers every address the browser signed in to; signing out deletes it). Limits for an address: from one client — the remembered browser, otherwise the network address — one code per 30 seconds and five per hour, and a new code replaces only that client's previous one; per day — twenty from all unknown clients together and twenty from each remembered browser; plus the per-client sign-in budget. Guessing is thus held to a hundred attempts a day per address (each also sends that person a letter), or per stolen device cookie. Strangers who fill the shared daily limit neither cancel nor block the codes of a browser the person used before. A person on a new browser can still be held back for a day by such requests, or by others behind the same network address for an hour; they can sign in with Google or Apple meanwhile. Answers never reveal whether a person with the address exists: the first valid code creates them, named after the part before `@` until they change their name.
- **Google** — OpenID Connect with PKCE, `prompt=select_account`.
- **Apple** — Sign in with Apple: the callback is a form POST from Apple's site, the client secret is a five-minute ES256 token signed with the team key, the name arrives only on the first sign-in.

One person, several ways in (`auth.identities`). A known way in leads to its person. A new one joins the person who already holds its **verified** address; otherwise a new person is created. Addresses count as verified when they come from a code by e-mail, from Apple, or from Google when Google vouches for them (Gmail addresses, or `hd` for Google Workspace); Google's other addresses never join an account. People who signed in through the previous OIDC provider kept their accounts: migration 021 made each issuer and subject an identity. A code by e-mail finds such a person only if the provider had vouched for their address (`auth.principals.email` is set). The previous sign-in asked for `openid profile` only, so for most of them it is empty, and their first code would create a new, empty account. Before they sign in, an administrator sets the address they will use (lower case) on the migration role:

```sql
UPDATE auth.principals SET email = 'person@example.com' WHERE id = '<principal id>' AND kind = 'human' AND email IS NULL;
```

Check first that no other person holds that address: with two holders, a code joins neither. A failed provider sign-in returns to the sign-in screen with `?sign-in-error=<code>`. The browser is never told which check failed; the server log records it (`Sign-in with <provider> rejected: …` — the exception class and a short message, never tokens, codes or secrets).

Settings:

| What | Variables |
| --- | --- |
| SMTP | `SPRINTIQUE_SMTP_HOST`, `SPRINTIQUE_SMTP_PORT` (587), `SPRINTIQUE_SMTP_USERNAME`, `SPRINTIQUE_SMTP_PASSWORD`, `SPRINTIQUE_SMTP_SECURITY` (`starttls` required upgrade, `tls` implicit TLS on 465, `none` only to a loopback relay), `SPRINTIQUE_MAIL_FROM` (`Sprintique <no-reply@example.com>`, also the envelope sender) |
| Google | `SPRINTIQUE_GOOGLE_CLIENT_ID`, `SPRINTIQUE_GOOGLE_CLIENT_SECRET` |
| Apple | `SPRINTIQUE_APPLE_CLIENT_ID` (the Services ID), `SPRINTIQUE_APPLE_TEAM_ID`, `SPRINTIQUE_APPLE_KEY_ID`, `SPRINTIQUE_APPLE_PRIVATE_KEY_FILE` (the downloaded `AuthKey_<key id>.p8`, mounted as a secret file) |
| Tests and local stands only | `SPRINTIQUE_GOOGLE_ISSUER`, `SPRINTIQUE_APPLE_ISSUER`, `SPRINTIQUE_PROVIDER_TRUST_FILE` (PEM certificates trusted for the providers only), `SPRINTIQUE_MAIL_DROP` (letters as files; local artifact only, refused in production and off loopback) |

Registering the providers:

- **Google** (Google Cloud console → APIs & Services → Credentials): an OAuth client of type *Web application*; authorized redirect URI `${PUBLIC_ORIGIN}/auth/callback/google`; consent screen scopes `openid`, `email`, `profile`.
- **Apple** (Apple Developer → Certificates, Identifiers & Profiles): an App ID with *Sign in with Apple*; a Services ID bound to it, with the domain of `PUBLIC_ORIGIN` and the return URL `${PUBLIC_ORIGIN}/auth/callback/apple`; a key with *Sign in with Apple* (download the `.p8` once — Apple does not show it again). Apple accepts only HTTPS origins, so it cannot be tried on a loopback stand. To relay mail to private relay addresses (`privaterelay.appleid.com`), register the sending domain in *Sign in with Apple for Email Communication* and publish SPF/DKIM for it.
- **SMTP**: a transactional mail service or your own relay, with SPF, DKIM and DMARC for the domain of `SPRINTIQUE_MAIL_FROM`; otherwise codes land in spam.

Browser cookies are HttpOnly, Secure, host scoped and SameSite=Lax; only Apple's pending-sign-in cookie is SameSite=None, because Apple posts the callback from its own site. Human mutations require same-origin Origin and CSRF; both e-mail steps require the same origin too. Forwarded headers are not trusted; review proxy/trust configuration before an ingress is introduced.

Worker: the `worker` command with `SPRINTIQUE_WORKER_DATABASE_URL` plus the same storage settings. It uses only narrow security-definer queue/asset functions with fixed search paths and lease fencing; no direct tenant-table access. Jobs retry boundedly and become failed after ten attempts. A live project administrator can inspect safe job metadata and retry failed asset cleanup from settings. Cleanup respects task/map-history references. Mail is sent only for sign-in codes; no webhook or notification dispatcher is configured.

## Containers

`npm run build:image` builds the web interface and then the image with Jib (`server/build/jib-image.tar`, image `sprintique-server:<version>`): the production artifact only, the interface in `/app/web`, a JRE 25 base pinned by digest, UID 10001, `SPRINTIQUE_ENVIRONMENT=production` unless the deployment overrides it. The image is built for the architecture of the machine that builds it (CI: amd64); `./gradlew jibBuildTar -Pimage.architecture=amd64|arm64` chooses another. Probe `/ready` for traffic admission (the image carries no HEALTHCHECK). The default command is the API; pass `worker` for the worker. Run `migrate` as a separate pre-start job with migration credentials, never in the API container.

Recommended runtime constraints already exercised locally: read-only root filesystem, writable bounded `/tmp` tmpfs with noexec/nosuid, all capabilities dropped, no-new-privileges, memory/CPU limits. The local API probe uses 512 MiB/1 CPU and loopback publishing. These are test defaults, not a sizing promise. `.dockerignore` excludes output/infra, browser state, test results and backups.

The single-host production layout (PostgreSQL container, API and worker on the host network behind nginx, loopback Postfix with DKIM, S3 under a prefix, daily dumps) is in [deploy/vps](../deploy/vps/README.md).

`scripts/check-container.mjs` loads the Jib image tarball into the owned Docker context and checks it against real PostgreSQL/S3, validates UID/readiness/authenticated session and anonymous rejection, then removes only its probe container. Its `PUBLIC_ORIGIN` remains the application origin; it is not a second public deployment. Sign-in from inside this probe is not exercised: the probe reuses the session that `check-local-sign-in.mjs` opened on the stand.

## Local reference services

`local-storage.mjs` and `local-services.mjs` use context `colima-sprintique-vnext-qa`. Create/start the intended Docker VM separately. Scripts do not select/restart a default VM. Containers carry `sprintique.owner=vnext-qa`; volume adoption is limited to already-owned consumers. Name collisions with unrelated resources stop execution.

| Service | Host binding | Persistence |
| --- | --- | --- |
| API + worker | localhost:4312 | SQL/S3; no browser-only canonical state |
| PostgreSQL | 127.0.0.1:54329 | owned PG volume |
| Mailpit (SMTP relay) | 127.0.0.1:54325 SMTP, 127.0.0.1:54326 letters API | none: keeps letters in memory, delivers nothing |
| Garage S3 | 127.0.0.1:4900 | private bucket/owned data volume; no public/admin endpoint |

`npm run local:services` creates and starts PostgreSQL and Mailpit and writes `output/infra/stand.json`. `output/infra/` is mode 0700; configuration, keys and browser state are mode 0600. The stand signs in by e-mail through the SMTP relay, the way production does; it cannot show Google or Apple, which require their real services and an HTTPS origin.

`npm run local:start` builds the production artifact, applies migrations with the migration role, then starts the API and the restricted worker. SIGINT/SIGTERM stops those children. `node scripts/local-app.mjs --migrate-only` performs only that explicit local migration. It reads generated private config without printing secrets.

## Checks and evidence

- `npm run local:check-sign-in` (`scripts/check-local-sign-in.mjs`): a code by e-mail through the stand's SMTP relay, a refused wrong code, a session, a code spent once, CSRF and a persisted QA task. It creates/updates synthetic `stand-qa` data and writes a **private** browser storage-state file (`output/infra/browser-state.json`) that the checks below reuse.
- `scripts/check-local-agent.mjs`: a scoped temporary grant/run/proposal against synthetic data. The human approves the exact proposal in UI; `--complete` commits its receipt, completes the run and revokes the grant. No shell/LLM provider is invoked. Do not interrupt between token issuance and revocation without inspecting/revoking the owned test grant.
- `scripts/check-container.mjs`: non-root/read-only container probe described above.
- Root `scripts/verify-vnext.mjs`: source fingerprint, library tests/package boundary, product strict build/tests and detached product clean install/build/tests. Use `SPRINTIQUE_TEST_DOCKER=1` and the explicit Docker context for portable PG mode, plus absolute `TEST_S3_CONFIG` for real S3 coverage.
- `.github/workflows/vnext.yml`: fresh CI storage, full gate and container build. Only verification/OpenAPI artifacts are uploaded, never infra configuration. Remote execution is not verified until an authorized push triggers CI.

Evidence timestamps matter: a backup or browser check proves its recorded state, not subsequent changes. Files named `*-verification.json` hold non-secret summaries; other `output/infra` files may contain credentials. Do not recursively copy that directory into a deliverable.

## Backup/restore drill

`node --import tsx scripts/backup-drill.mjs` is intentionally **local-only** and targets the fixed owned QA resources. Stop the local API and worker first. The script refuses active runtime database sessions/online API; keep other writers stopped throughout. It does not overwrite the source database.

The drill creates a private custom-format dump of the application database (people and their ways in included), copies referenced object variants with checksums, and fingerprints canonical tables. It restores into a new isolated PostgreSQL container and S3 prefix, compares table fingerprints, starts the server on the restored copy (runtime role, `SPRINTIQUE_STORAGE_PREFIX` pointing at the restored objects), authenticates a restored session and downloads restored private files; anonymous reads must fail. The restore container holds real private data on a published loopback port, so every TCP login uses a fresh per-run secret and SCRAM; it is never started with trust authentication. Container teardown runs even when a client or object cleanup step fails. It rechecks the source fingerprints at the end. Temporary restored objects/container/anonymous volume are removed; the private checkpoint remains in `output/infra/backups/<id>/`.

Limits: 128 MiB per dump, 50,000 rows per fingerprinted table and 200 assets. This is a small local consistency drill, not a general production backup tool. Checkpoints are mode 0600/0700 but **not encrypted**. The restored ways in are counted; a new sign-in against the restored copy is not exercised. No production RPO/RTO, off-site replication or retention SLA is asserted. Restart with `npm run local:start` after the drill.

## Observability and limits

`/health` is liveness. `/ready` verifies exact schema/runtime-role/S3 readiness; use it for traffic admission. Optional `SPRINTIQUE_METRICS_TOKEN` (32–256 characters) enables `/internal/metrics`, requiring its own Bearer token; otherwise the route is absent. Keep it private. Aggregate schema `runtime-metrics/1` is process-local and resets on restart. Labels are bounded route templates/method/status class, never user paths, query strings, principal IDs or tokens. Long-lived streams are counted when closed, not as active-connection telemetry. Request logs omit bodies, cookies, headers, SQL and provider responses.

Default process limits: 1,000 requests/minute/IP; sign-in 20/minute/IP (starting a provider sign-in, both e-mail steps, dev login); 64 active requests and 8 upload requests; 100 SSE streams overall and 3 per credential. S3 I/O has a 15-second deadline. The image decoder allows two concurrent operations. These are explicit conservative defaults; distributed deployment needs shared admission control. Load regression tests exercise 2,000 tasks and concurrent reads/CAS writes; their thresholds are not an SLA.

## Before external release

Require an authorized target and real DNS/TLS, SMTP with SPF/DKIM/DMARC and, if offered, Google and Apple client configuration; fresh database and private storage; least-privilege network access; encrypted backups with a complete restore rehearsal; a tested gateway/replica policy; dependency/container security review and independent application security/accessibility testing. Define monitoring/alert routing and capacity targets. Configure notification providers only when selected; do not report SSE as external delivery. MCP OAuth transport, external agent providers, arbitrary code execution and distributed tracing are future extensions, not hidden local substitutes.
