# Repository and extraction contract

Owner approval: 2026-09-12. Keep the same repository; product can later move as a whole.

`libraries/iquipage` is the active source-owned UI package. `products/sprintique` is the autonomous product. The only runtime dependency crossing this boundary is a versioned public `@iquipage/web` package. No backend or auth dependencies belong in the library; no product imports from library source internals. Tokens and public declarations ship in the package.

`design-system/` is an immutable provenance snapshot. `packages/maps` is the historical approved frontend/reference implementation and still has its historical build; it is not the backend for vNext. Do not continue fixing the old source when implementing a vNext feature. Changes backported to the original product require a separate decision. `scripts/materialize-vnext.mjs` records the one-time extraction only; it refuses existing destinations and is not a build dependency.

Each product owns its install/lock, contracts, migrations, testing and operations. No root workspace install is necessary. `scripts/verify-extraction.mjs` proves this by copying only the product, running a clean install, strict build, boundary guard and real PostgreSQL suite in a temporary directory. It does not publish packages or touch existing databases.

## Change protocol

1. DS source/type changes: increment package version, build/test/pack library.
2. Product adopts the exact tarball, updates its dependency and lockfile, then runs public-type tests and browser checks.
3. Check detached build. Keep a local package private until licensing/distribution is explicitly approved.
4. Domain/API changes: static contracts → application command → persistence adapter; actor context comes only from authenticated credentials. Frontend and MCP adapters must share the same authorization/use cases, not each implement their own policy.

No monorepo orchestration layer, service mesh, shared root dependency hoist or global SQL record endpoint is introduced. These add coupling without helping the current small/medium-team product.
