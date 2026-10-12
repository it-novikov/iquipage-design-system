# Independent source review R1

The originals are retained byte-for-byte; local authored commit IDs in them are mapped below to publicly preserved commits with equal whole trees. This wrapper does not replace their findings.

| Stage | Authored commit | Public commit | Whole tree | Verdict |
| --- | --- | --- | --- | --- |
| Initial | 3655be30bf717b1906a0086ad57e0a5d53b36610 | [223b1b5f](https://github.com/it-novikov/iquipage-design-system/commit/223b1b5f8340e0d2812f460116f1b9e67e4b7162) | 6ba46a934c423b466b0dc534b3686b133e522748 | CHANGES_REQUESTED: two P2 in verification |
| Corrected | 459a3a2cd9bb6b227bc41fbe65896ed42a735102 | [5fe776c7](https://github.com/it-novikov/iquipage-design-system/commit/5fe776c7eb497c59dd33bf65d99c1569bfff79db) | 34e25d8c399876a350b194d167d8abdaf0838ca4 | APPROVED_FOR_NATIVE in scope |

[Initial review](initial.md), SHA256 `871900f4a4989678bb2ff3c9781011eaf9d52b1d2b0d2bc79db9be7350e5e1b3`; [corrected addendum](corrected-addendum.md), SHA256 `5a2e06fb62a5765d439ea7a2024afba8e3313f632f408f147cb01e6e3a8fc37e`.

The product-root prefix now includes all61 actual product/fixture inputs (197 total with dependencies). The short literal sample now distinguishes escaping of ASCII markup and an entity. Runtime was approved within its scope in both stages. The source/plan and long-review strings stay unchanged across these two fixes. Prior local build/input claims are preserved in [before-provenance-fix](../../before-provenance-fix/); they do not become a complete inventory retroactively.

The publication mapping is checked through Git tree hashes; this review-record commit adds only Bridge documentation. Native, visual, human and backend acceptance remain NOT_RUN pending the actual CI. Five semantic scenarios and two informational captures are not a production or complete UX acceptance claim.
