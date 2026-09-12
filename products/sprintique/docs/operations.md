# Operations and release boundary

This runbook separates reproducible local checks from an external release. Never connect these migrations to the old platform database. Do not publish generated QA secrets or reuse them outside the local environment.

## Runtime configuration

API requires `DATABASE_URL`, `PUBLIC_ORIGIN`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Optional `HOST` defaults to `127.0.0.1`, `PORT` to `4311`. `PUBLIC_ORIGIN` is an origin without a trailing slash. HTTPS is required outside loopback; the issuer always requires HTTPS.

Migration process uses a separate `MIGRATION_DATABASE_URL`, `DATABASE_RUNTIME_ROLE` and `DATABASE_WORKER_ROLE`. Runtime and worker roles must be LOGIN NOSUPERUSER NOBYPASSRLS, not migration owners. `npm run migrate` applies the ordered immutable ledger. Main API startup checks exact migration names/checksums/count, permissions and S3 readiness. Never edit an applied SQL migration: add another file.

Register `${PUBLIC_ORIGIN}/auth/callback` as the provider redirect URI. Use confidential authorization-code flow + PKCE S256. State, nonce, issuer, audience and signed ID token are verified. Identities are keyed by provider subject, never merged by email. Browser cookies are HttpOnly, Secure, SameSite=Lax, host scoped. Human mutations require same-origin Origin and CSRF. Forwarded headers are not trusted; review proxy/trust configuration before an ingress is introduced.

Worker: `WORKER_DATABASE_URL` plus the same S3 settings, then `npm run worker`. It uses only narrow security-definer queue/asset functions with fixed search paths and lease fencing; no direct tenant-table access. Jobs retry boundedly and become failed after ten attempts. A live project administrator can inspect safe job metadata and retry failed asset cleanup from settings. Cleanup respects task/map-history references. No external webhook/email dispatcher is configured.

## Containers

The product Dockerfile builds only this subtree and its vendored DS. The final image runs as UID 1000, production dependencies only; `/ready` is the healthcheck. The default command is the API; override it with `node build/backend/worker.js` for the worker. Run migration as a separate pre-start job with migration credentials, never in the API container.

Recommended runtime constraints already exercised locally: read-only root filesystem, writable bounded `/tmp` tmpfs with noexec/nosuid, all capabilities dropped, no-new-privileges, memory/CPU limits. The local API probe uses 512 MiB/1 CPU and loopback publishing. These are test defaults, not a sizing promise. `.dockerignore` excludes output/infra, browser state, test results and backups.

`scripts/check-container.mjs` checks the owned local `sprintique-vnext:qa-r3` image against real PostgreSQL/S3, validates UID/readiness/authenticated session and anonymous rejection, then removes only its probe container. Its `PUBLIC_ORIGIN` remains the application origin; it is not a second public deployment. OIDC login from inside this probe is not tested because the local issuer hostname points to the host, not that container.

## Local reference services

`local-storage.mjs` and `local-identity.mjs` default to context `colima-sprintique-vnext-qa`; override explicitly with `SPRINTIQUE_DOCKER_CONTEXT`. Create/start the intended Docker VM separately. Scripts do not select/restart a default VM. Containers carry `sprintique.owner=vnext-qa`; volume adoption is limited to already-owned consumers. Name collisions with unrelated resources stop execution.

| Service | Host binding | Persistence |
| --- | --- | --- |
| API + worker | localhost:4312 | SQL/S3; no browser-only canonical state |
| PostgreSQL | 127.0.0.1:54329 | owned PG volume; separate app and identity databases |
| Garage S3 | 127.0.0.1:4900 | private bucket/owned data volume; no public/admin endpoint |
| Keycloak | 127.0.0.1:9443 HTTPS | dedicated PostgreSQL identity database |

`output/infra/` is mode 0700; configuration, keys and browser state are mode 0600. The QA realm has a generated local-only account, no SMTP and no bootstrap admin endpoint. A short-lived local CA is supplied to Node with `NODE_EXTRA_CA_CERTS`; neither OS trust nor TLS validation is disabled. The scripts use `start --import-realm`, not Keycloak development mode.

`npm run local:start` first applies migrations with the migration role, then starts the compiled API and restricted worker. SIGINT/SIGTERM stops those children. `node scripts/local-app.mjs --migrate-only` performs only that explicit local migration. It reads generated private config without printing secrets.

## Checks and evidence

- `scripts/check-local-oidc.mjs`: TLS-verified real provider login, PKCE, signed token, one-use callback rejection, session/CSRF and persisted QA task. It creates/updates synthetic `oidc-qa` data and writes a **private** browser storage-state file. Run with the local CA in `NODE_EXTRA_CA_CERTS`.
- `scripts/check-local-agent.mjs`: a scoped temporary grant/run/proposal against synthetic data. The human approves the exact proposal in UI; `--complete` commits its receipt, completes the run and revokes the grant. No shell/LLM provider is invoked. Do not interrupt between token issuance and revocation without inspecting/revoking the owned test grant.
- `scripts/check-container.mjs`: non-root/read-only container probe described above.
- Root `scripts/verify-vnext.mjs`: source fingerprint, library tests/package boundary, product strict build/tests and detached product clean install/build/tests. Use `SPRINTIQUE_TEST_DOCKER=1` and the explicit Docker context for portable PG mode, plus absolute `TEST_S3_CONFIG` for real S3 coverage.
- `.github/workflows/vnext.yml`: fresh CI storage, full gate and container build. Only verification/OpenAPI artifacts are uploaded, never infra configuration. Remote execution is not verified until an authorized push triggers CI.

Evidence timestamps matter: a backup or browser check proves its recorded state, not subsequent changes. Files named `*-verification.json` hold non-secret summaries; other `output/infra` files may contain credentials. Do not recursively copy that directory into a deliverable.

## Backup/restore drill

`node scripts/backup-drill.mjs` is intentionally **local-only** and targets the fixed owned QA resources. Stop the local API and worker first. The script refuses active runtime database sessions/online API; keep other writers stopped throughout. It does not overwrite the source database.

The drill creates private custom-format dumps of application and identity databases, copies referenced object variants with checksums, and fingerprints canonical tables. It restores into a new isolated PostgreSQL container and S3 prefix, compares table fingerprints, authenticates a restored session and downloads restored private files; anonymous reads must fail. It rechecks the source fingerprints at the end. Temporary restored objects/container/anonymous volume are removed; the private checkpoint remains in `output/infra/backups/<id>/`.

Limits: 128 MiB per dump, 50,000 rows per fingerprinted table and 200 assets. This is a small local consistency drill, not a general production backup tool. Checkpoints are mode 0600/0700 but **not encrypted**. Identity database restoration is checked; full provider login after restoring identity is not exercised. No production RPO/RTO, off-site replication or retention SLA is asserted. Restart with `npm run local:start` after the drill.

## Observability and limits

`/health` is liveness. `/ready` verifies exact schema/runtime-role/S3 readiness; use it for traffic admission. Optional `METRICS_TOKEN` (32–256 characters) enables `/internal/metrics`, requiring its own Bearer token; otherwise the route is absent. Keep it private. Aggregate schema `runtime-metrics/1` is process-local and resets on restart. Labels are bounded route templates/method/status class, never user paths, query strings, principal IDs or tokens. Long-lived streams are counted when closed, not as active-connection telemetry. Request logs omit bodies, cookies, headers, SQL and provider responses.

Default process limits: 1,000 requests/minute/IP; login 20/minute/IP; 64 active requests and 8 upload requests; 100 SSE streams overall and 3 per credential. S3 I/O has a 15-second deadline. The image decoder allows two concurrent operations. These are explicit conservative defaults; distributed deployment needs shared admission control. Load regression tests exercise 2,000 tasks and concurrent reads/CAS writes; their thresholds are not an SLA.

## Before external release

Require an authorized target and real DNS/TLS/issuer/client/secret configuration; fresh database and private storage; least-privilege network access; encrypted backups with a complete identity restore rehearsal; a tested gateway/replica policy; dependency/container security review and independent application security/accessibility testing. Define monitoring/alert routing and capacity targets. Configure notification providers only when selected; do not report SSE as external delivery. MCP OAuth transport, external agent providers, arbitrary code execution and distributed tracing are future extensions, not hidden local substitutes.
