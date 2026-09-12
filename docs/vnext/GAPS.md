# Explicit R3 release limits

The local product implementation and targeted integration checks are recorded in COMPLETION-R3.md. Earlier missing-map/media/membership/Planning-source blockers are resolved; they must not be carried forward as unimplemented R3 features.

## Not claimed as delivered

- Production deployment, old-platform migration/import, public DS publication, external pilot and remotely executed GitHub CI. These require a separate authorized release; none happened locally.
- MCP OAuth/transport, paid external agent providers, arbitrary shell/code execution and executable canvas workflows. The implemented agent API supports bounded runs, context, exact Planning proposals/approvals/receipts and cancellation. Disabled canvas capabilities do not pretend to run agents.
- External email/webhook/notification delivery. Transactional outbox + authorized SSE/pull and a restricted asset cleanup worker are implemented. SSE is not an external notification receipt.
- Complete response-schema/generated-SDK coverage beyond the explicit Planning contracts. OpenAPI inventories all actual API routes and bounded code-owned request schemas; non-Planning response gaps are marked in the document.
- Distributed tracing, shared cross-replica quotas or task-level ACL. Current limits/metrics are process-local; authorization is project-level, and Planning uses a conservative project revision fence.
- Antivirus scanning, production off-site encrypted backups, agreed RPO/RTO, complete identity-provider restore/login rehearsal or production-scale capacity acceptance. Local private files are validated/re-encoded; the isolated two-database/private-object restore drill passed but is explicitly bounded and unencrypted.
- Exhaustive browser/role/input/theme matrix, independent security audit and WCAG conformance. Targeted Chromium flows and real API denial/concurrency tests passed. The owner's approved focus styling is preserved, not misrepresented as accessibility certification.

## Runtime and operational constraints

See the product README and docs/operations.md for exact limits. No success response hides a partial Planning graph. Storage/DB failures fail closed, and unknown collections never fall back to mock browser persistence. Identity bootstrap and one-time secret issuance are not automatically retried; CAS profile/member updates surface stale revisions.

Local reference stack is selected and running on owned loopback resources: PostgreSQL/Garage/Keycloak, immutable image pins. A browser needs explicit trust for the local provider CA; no system trust or TLS validation was changed. Real TLS-verified provider login was tested separately. External DNS/TLS/provider secrets and hosting access remain deployment configuration, not a reason to invent a production identity.

No mandatory new DS capability was introduced in this backend/integration step. Six illustrations are separate assets, and the largest JS chunk is 317.07 KB; runtime performance targets still require a real deployment profile.
