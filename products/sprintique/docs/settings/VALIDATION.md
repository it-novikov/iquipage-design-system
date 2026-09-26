# Settings validation

Final package: `@iquipage/web@0.6.0-vnext.10`, consumed through a versioned tarball and lockfile.

- Node 24: clean `npm ci --ignore-scripts`, typecheck/build and `check:boundaries` pass.
- IQUIPAGE: 235 tests pass.
- Sprintique: 163 tests pass with isolated PostgreSQL 18 and the existing private QA S3 service. The first run without S3 configuration failed 11 storage integration tests; the complete configured rerun passed, with no skips.
- Eight preference/navigation tests cover restoration, device theme changes, invalid/corrupt/blocked storage, role filtering, migration of the existing shell theme and preservation of subsection URLs. Public component declarations are compiled against the packed package.
- Browser: light/dark, 390px mobile width without document overflow, native radio arrow navigation and focus, persistent theme/accent/density/motion after reload, settings search and planning dialog.
- Real temporary API: profile name, project name and workspace timezone saved and read back. Reader account has disabled administrative fields and no operations entry. Unsaved-form cancel retains input and restores its route; discard allows navigation.
- Planning table density: "Свободная" is the approved default look and adds no overrides; "Компактная" tightens work-list cells to 4px block padding (8px row padding on phones), table cells to 8px and board cards to 12px. Adjusted during integration (DS 0.6.0-vnext.14).

## Local preview

Run `npm run build`, then `npm run preview:settings` from the product with Node 24 and PostgreSQL 18 binaries available. Open `http://localhost:4383/__preview/admin` (or `/__preview/reader`). The runner creates its own temporary database and binds only to loopback; stopping it deletes that database. The synthetic login route exists only in the test fixture and is not included in the production server build. The preview has no object storage configured, so media upload is not demonstrated there; the real S3 integration suite covers storage separately.

Appearance preferences are browser-local, not account-synchronized. No production deployment is part of this change.
