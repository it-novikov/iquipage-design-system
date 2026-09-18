# vNext completion R3

Owner 2026-09-12: finish everything possible, engineering stack decisions delegated; Planning is partially implemented in PR #3. This authorizes local implementation/integration, not push, public deployment, paid resources, old-data migration or arbitrary agent code execution.

Baseline f69f1d2; read-only Planning source d87c65767ef471c81bf84c10b9b19e225a956064 from PR #3. Do not change the other writer's branch. Preserve one product subtree and one public DS package. Prior backend and DS tests remain historical until the final build is rerun.

## Order and acceptance registered before implementation

1. R3-01: import the exact consumer source (no demo fixture/runtime), record provenance, bridge its current intent/projection protocol to canonical backend schemas. List/groups/hierarchy/filter/sort/cursor and independent task document; read-only, denied, stale and late-response behavior.
2. R3-02: complete Planning consumer operations: release creation/settings/close/carry-forward/history, exact selection snapshots, scheduling/milestones/dependencies and safe task-editor parent/release confirmation. One atomic server plan, no loop of PATCH calls; retained receipt identity across reload.
3. R3-03: restore application navigation and required catalogs: project/workspace selection and settings, templates, tag colors, links, scoped platform search; real persistence and permissions.
4. R3-04: versioned map documents and sessions through unchanged supplied graph/whiteboard UI. CAS, task references, conflict/reload/drafts and no reference repository in production.
5. R3-05: private media pipeline and attachments/covers/avatars: staged -> validated -> ready/quarantined -> linked, canonical MIME/size/image decoding, same DS upload/file/crop UI, no public storage URLs. Orphan cleanup and retry across SQL/object storage boundaries.
6. R3-06: project/workspace membership and invitations, identity settings and durable replay policy. Access changes invalidate caches/streams/running effects; last-owner protection, no email-based identity merging.
7. R3-07: durable jobs/outbox delivery and agent-run/proposal lifecycle, leases/retries/cancel/recovery, bounded context and explicit approvals. No LLM/provider spend or unrestricted command runner.
8. R3-08: portable local infrastructure and operational hardening: OIDC provider, S3-compatible storage, quotas/rate limits, schemas/OpenAPI, logs/metrics/readiness, containers, CI scripts and backup/restore drill on isolated data.
9. R3-09: regression on real PostgreSQL/object storage, concurrency/idempotency/failure/authorization tests and full integrated browser flows in light/dark/narrow/keyboard/reduced-motion. Do not turn missing target tests into PASS.

## Engineering decisions

Keep TypeScript strict / Node 24 / Fastify / PostgreSQL modular monolith. Add a separately runnable worker sharing use cases, and an object-storage port with an S3 implementation. OIDC stays standards-based and swappable; Keycloak is the selected self-hosted local/pilot reference, not a production dev bypass. Local services must be isolated and loopback-only; existing Docker/Colima projects must not be restarted or altered. External hosting remains portable container deployment; buying/provisioning a cloud service is not needed to finish local code.

Exact dependency versions and infrastructure evidence are recorded when resolved. Resource/SLA numbers are engineering defaults for validation, not invented user commitments. Changes of product semantics or missing DS capabilities are surfaced explicitly; independent work continues.

## Delivered local implementation

R3-01–08 are implemented locally: PR3 consumer and exact public view protocol; shared task editor confirmation; versioned Planning/maps/templates; scoped search/settings/membership/workspace profiles; private images/files/avatars; bounded agent lifecycle and exact approval/receipt; leased restricted cleanup worker; operational limits, metrics, real reference services, containers, CI scripts and restore drill. The historical platform and DS snapshot remain untouched. No push, deployment, publication, old-data import, paid provider or arbitrary agent execution.

R3-09 is **targeted verified**, not exhaustive full-platform acceptance. Final automatic gate `2026-09-12T11-15-56.934Z`: 209 library + 107 product tests, strict build/boundaries and detached clean install/build/107 tests PASS without skips. Product cases include 88 backend/API and 19 exact upstream controller/operation tests. Source fingerprint `5750cb964e7424fa61ec1f92bf3c508d1253010ee58cfc3119c996f3b92b64b0`. Consumer provenance and actual protocol are documented in the product subtree.

Container `sha256:98296dfcd70b54e40e6a077bdea809b849dc0e9958e92a2d85c3921798aa9dc3` passed UID 1000, read-only root, cap-drop, readiness against real PostgreSQL/S3, real session and anonymous rejection. OIDC login inside that probe is NOT_RUN; separate host/provider login verifies real TLS, PKCE, signed token and callback replay rejection.

The 2,000-task/8-reader load regression passes with bounded pages and conflict winner checks. The 10-second engineering regression threshold is not an SLA. Source tables in the local restore checkpoint matched across 37 tables / 71 rows, both database dumps and 3 private variants; original data unchanged. The restored temporary database and object prefix were removed. Backup remains private, unencrypted and older than later browser test data; production recovery promises are not inferred.

## Browser acceptance record

Local real API/SQL/S3 on `http://localhost:4312`, authenticated by the actual local Keycloak login. Synthetic project `oidc-qa`, tasks QA-1/QA-2 and test maps/releases only. Separate final browser session prevents interference with the existing interactive tab.

Verified: release create/preview/commit; task create in release/confirmation/draft; select/prepare; start/admit to board; same QA-2 document/Markdown in task drawer and after full reload; DS cover crop, private upload, DS file row and persisted cover; discussion marked as requiring resolution persists; compact description selection survives moving the pointer outside and click outside returns preview; release close with explicit backlog remainder and retained history; milestone date through DS calendar, timeline and dates views. Real committed requests with intentionally aborted responses recovered in-place and after reload, with one release per intent.

Earlier in this R3 turn: project avatar upload/crop/save/reload with real 512×512 image, map text/width inspector save/reload, human approval of the scoped agent proposal followed by the exact command commit and grant revocation. Screenshots and non-secret verification summaries are kept under the product's ignored output directory; never copy raw session/infra files to public artifacts.

Final additional browser checks: image added to the map, replaced through the inspector and saved at width 360; canonical map revision 5 contains a private asset reference and no inline image. History revision 4 loads the previous private image at width 320 in a read-only DS whiteboard, without replacing current state. Wheel pan changes viewport `(252,83.5)` to `(182,-6.5)` and Ctrl+wheel changes zoom `1` to `1.616`; these gestures do not mutate the document. Dark/light desktop and 390×844 task/Planning checked; reduced-motion preference enabled. Drawer and document widths remain 390. Narrow host navigation was repaired to use the DS section dropdown and profile menu; settings/theme/logout stay reachable. Final host API was restarted on the verified build and `/ready` returned ready.

Full independent browser/keyboard/screen-reader coverage, all combinations of roles/themes/input methods, production load/security and provider failover are not claimed. Canonical reader/foreign/revoked/stale/expired cases are covered in API tests; that does not automatically mark each UI path PASS. See GAPS.md for explicit release limits.

## Corrections retained in evidence

005's initial FK fixture mismatch was fixed before its first successful application; 006 removes obsolete planned-start/deadline coupling without rewriting applied SQL. Test discovery now includes all modules. Project/member/agent/asset permissions are checked after locks, and history images are retained. The map inspector awaits its active save before reading revision/scene. Uncertain Planning recovery stays enabled while closing is blocked. Early test/harness failures remain failures; later successful reruns have their own timestamps.

Six original generated cover illustrations are separate byte-identical WebP assets. Main JS entry 205.39 KB, core 297.97 KB, lazy maps 317.07 KB; no chunk exceeds the 500 KB advisory. Full performance/accessibility acceptance is separate from bundle-size improvements.
