# Sprintique product boundary

This directory is an autonomous product; it may be extracted into another repository. Read README.md for current implemented vs pending scope. Do not assume a UI capability implies backend support.

- Node 24, strict TypeScript backend/contracts/client. Run `npm ci --ignore-scripts`, `npm run check:boundaries`, `npm run build`, `npm test` (PostgreSQL 18 binaries; PG_BIN configurable).
- Only public versioned `@iquipage/web` imports. No relative imports outside this product, no backend imports from ui/web/DS. Do not rewrite approved UI or use the old reference backend as production identity/persistence.
- Actor and initiator come from validated credentials. All resource access checks project policy, agent grant and current initiator rights. Keep data, audit and outbox atomic. Preserve revision CAS and idempotency on retryable commands.
- Migrations apply to a fresh vNext database only. Do not edit applied migrations or point tests at user data. Runtime must be non-owner/NOBYPASSRLS. No silent memory, reference-user or insecure-auth fallback.
- Mark unavailable capabilities explicitly. Agent proposal, execution, approval and application of results must be separate states. Never add a raw-SQL/generic execute MCP tool or forward OAuth tokens to unrelated services.
- Preserve user changes. Push, package publication and deployment require explicit authorization. Test tokens and fixture storage state must not enter Git, logs or user-facing deliverables.
