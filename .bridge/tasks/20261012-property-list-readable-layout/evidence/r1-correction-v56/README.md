# PF04 — source R1 correction, private DS56

This is the author's bounded correction after independent R1, not an independent approval or a native result. Original R1: `property-list-candidate-a-source-review.md`, SHA256 `0a07165199fc25e56665bdd937289ff45eb1d55549c913a6bd35c1c305805dc9`. Root preserves that report and arranges the separate addendum.

The original candidate is local commit `7f419045ee09aad58d1a9a36d08163df08e658af`, tree `0ae776…`, based on main220af. Root prepared a merge of accepted main `4275dde301b5068b3d6b1801ecb54c70a2d7e708` without a commit and resolved its workflow conflict. These local builds record the original HEAD plus the actual uncommitted working-source delta; they are not represented as builds of a future merge SHA. This author did not change refs, commits, the merge index, product code or the root workflow guard.

## Corrections

| R1 finding | Applied change | Current state |
| --- | --- | --- |
| F1 / PF04-CAR1-01: inconsistent package README | README now introduces the current private trial and links the detailed control-contracts. The old36px/120px/8px bleed/26px pill/ellipsis description is explicitly historical through vnext.54. | Actual DS56 tar README and contract bytes verified; independent addendum pending. |
| F2 / PF04-CAR1-02: permanent applicability of a frozen experiment | Root's job guard is retained exactly: matching `fix/property-list-readable-layout` PR head, or explicit dispatch on that branch. Experiment README and plan revision2 document this boundary. Existing Browser/Estimate/full gates remain. | Guard preservation and documented applicability verified; independent addendum pending. |

## Immutable identity and preserved behavior

| Artifact | Identity |
| --- | --- |
| Original DS55 archive, unchanged | `71318ed08cd22878c3d6ab5649c229d6da103f2bef77d9bc4bb1f7b70cad5ade` |
| New private DS56 archive | `a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f` |
| Saved `comparison-plan.v1.json` | `d99bd7d47df7a4df998db45036cc245f0651d67d03bd948f8cd5f1faaa4d588f` |
| Saved `packages/source-proof.v55.json` | `28f04a5a2cdcf93fa7fbd07f9e1d3df9c8dcbe399bc826b87842da23c7ee05bb` |

Plan revision2 changes only trial/version/base/hash/applicability metadata. The five profiles, criteria, synthetic fixture, measurements, interactions and oracles are unchanged. The original baseline plans and local55 raw results remain byte-for-byte intact.

**Both source CSS and the actual `dist/iquipage.css` bytes inside55/56 are identical.** All packed `dist/modules/*` bytes are identical; the public core entry changes only its literal version. The package adds the already accepted `docs/INTEGRATION.md` and `docs/anchored-editors.md`, with their exact current-main content. They are included in the new source proof. These integration recipes do not claim a new DS runtime API.

DS56 contains178 files versus176 in55; the two added files are the accepted recipes. `package-docs-proof.json` lists the metadata/document changes and confirms100 protected file identities, unchanged root guard and an empty product diff against main4275. Sprintique still consumes the unchanged control54 archive.

## Verification actually performed

- Deterministic build/prepack completed for the separately named DS56 archive. Manifest, tokens, version declaration, core entry, provenance and packaged documentation agree.
- Ten scoped version/size tests passed; see `scoped-version-size.log`. The existing CSS/core/icon budgets remain unchanged and pass.
- Fresh exact public control54 and candidate56 consumer builds passed as `BUILT_NOT_RENDERED`; see `control-build-v56.json` and `candidate-build-v56.json`.
- Protected CSS/runtime/fixture/oracle/history hashes and actual archive docs were checked. Product diff against accepted main4275 is empty.
- The earlier complete478-test log belongs to55. The full suite was not rerun for this docs/package correction and is not relabelled as56 evidence.

Native geometry, keyboard, popup association, independent visual review, selection of A/default and product adoption remain open. This correction does not resolve any of those by changing criteria or using the previous build results as a native pass.
