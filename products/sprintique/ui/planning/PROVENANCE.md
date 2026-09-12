# Planning consumer source

Imported read-only from `it-novikov/iquipage-design-system` PR #3, branch `feature/vnext-planning-ui`, immutable commit `d87c65767ef471c81bf84c10b9b19e225a956064`.

This directory contains the consumer `src/` and public declarations only, not the PR's demo repository, reference persistence, fixtures or mock server. It consumes the same pinned `@iquipage/web` package as the task board and maps. Canonical data and authority belong to `backend/`, `contracts/`, `client/` and host adapters in `web/`.

The upstream controller and operation unit tests are retained in the product `tests/planning-{controller,operation}.test.mjs`, with import paths adjusted only. Demo business-rule tests are not imported: canonical domain behavior is exercised against PostgreSQL instead.

Local integration changes after import: force cleanup for host revocation; native DS focus behavior; public declarations aligned with the actual view protocol; release/history server pagination; uncertain-command dialogs keep receipt recovery enabled while dismissal remains blocked. These are product consumer changes, not upstream DS modifications. The original PR branch is untouched. Local QA is recorded in `docs/vnext/COMPLETION-R3.md` at repository root and the consumer boundary in `docs/planning-integration-r3.md` inside the product.
