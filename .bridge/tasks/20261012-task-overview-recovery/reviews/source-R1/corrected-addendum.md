# Task overview recovery — corrected-source addendum to R1

**Verdict: APPROVED_FOR_NATIVE within the targeted Task recovery scope. Both original P2 verification findings are resolved in the corrected source and local build record. Native, visual, human and backend acceptance remain NOT_RUN.**

Reviewer: `/root/task_estimate_review`, independent GPT-6 Astra source reviewer. Completed 2026-10-12 UTC. This is an addressed follow-up, not a replacement for the original review or a repeat of full CI.

## Immutable relationship

| Item | Identity |
| --- | --- |
| Original R1 report | `research/continuation/task-overview-recovery-source-review.md` |
| Original R1 SHA-256 | `871900f4a4989678bb2ff3c9781011eaf9d52b1d2b0d2bc79db9be7350e5e1b3` |
| Original verdict / source | CHANGES_REQUESTED; `3655be30bf717b1906a0086ad57e0a5d53b36610` |
| Corrected commit | `459a3a2cd9bb6b227bc41fbe65896ed42a735102` |
| Corrected whole tree | `34e25d8c399876a350b194d167d8abdaf0838ca4` |
| Corrected commit parent | `3655be30bf717b1906a0086ad57e0a5d53b36610` |
| Recovery base remains | `220af664ef561d3f5ff1b873122281ef352e8f25` |
| Corrected local-build SHA-256 | `641abb2622470407958e03c75b96307967cd936c782cf4bfcf3db130e2fbad88` |
| Corrected source-manifest SHA-256 | `c8103b769a1e993c22ffe2c9fa0a95265ba46171b3772f038fdfd7fb41da35bb` |

The worktree was clean at the end of this review and its actual HEAD/tree matched the corrected subject. I inspected the entire nine-file correction diff, the new local record and preserved originals. I compared hashes against frozen Git and the existing compiled outputs. I did not edit source, run a build/test/browser, or perform Git or remote mutations.

## R1-P2-01 — Resolved: actual product inputs are fingerprinted

The runner now normalizes `product` with `resolve(fileURLToPath(...))`. The previously doubled trailing separator no longer prevents physical product module IDs from entering the inventory. Four assertions require input fingerprints for the actual Task dialog, Task Work renderer, work model and fixture consumer. They check the emitted inventory, supplementing the existing assertion that production modules were compiled. Source: corrected `products/sprintique/tests/task-overview-state-browser.mjs:15,238–246`.

The corrected build record has **197 input entries: 61 product/fixture, 41 DS and 95 Zod**, plus 12 compiled outputs. This is a verified inventory count, not a count of checks or user-visible improvements. I independently established:

- All 61 product/fixture input hashes equal the corresponding files at corrected Git commit `459a3a2…`.
- The 136 dependency entries are byte-for-byte equal as a map to the original dependency-only inventory.
- All 13 separately recorded source hashes and all 12 recovery source-manifest entries match corrected Git.
- Both the input-graph and compiled-set digests recalculate to the recorded values.
- All 12 recorded compiled-output hashes match the actual existing files in `products/sprintique/output/task-overview-state/build-only/compiled/`.

The corrected input-graph SHA-256 is `dd891534feece9cb4b9593f0bd3d80ae1850b762c767d1ef1ca7b685f713ed7b`; compiled-set SHA-256 is `9d95cdfc14661861cb548d755d1b16c14729c2debab6b1a12c2ce767e77dc3f0`.

The local record is explicit about timing: it was produced at `2026-10-12T12:10:20.981Z` on Node `v24.19.0`, with HEAD `3655be30…` and three declared working source changes. Its hashed source matches the subsequently committed corrected head. It remains **BUILT_NOT_RENDERED**, with no browser cases and all acceptance fields NOT_RUN. This is not described as a clean native run of `459a3a2…`. Root reports one build-only rerun; I inspected that record and its outputs without rerunning it. Source: corrected recovery `local-build.json` and `source-manifest.json`.

## R1-P2-02 — Resolved: the existing literal assertions now discriminate

The only data change replaces the short result with `История «<em>готово</em> &amp; проверено» сохранена после обновления.` The existing exact-text and result-element-count assertions are unchanged. If that string were interpolated without escaping, valid `em` markup would create a child element and change the literal text; entity decoding would also change the expected literal `&amp;` sequence. The restored renderer's existing escaping preserves the intended text. Source: corrected fixture `data.mjs:4`, runner `semanticCase`, and the unchanged `task-work-view.js` result interpolation; [WHATWG HTML tag-open state](https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state).

This resolves the source defect in the witness. It does not assert that a native case has already passed. There is still one short review scenario, with no extra security gate or test matrix. The long-review strings are unchanged, so this correction does not change the material used for the two informational composition captures.

## Recovery boundary and prior evidence preserved

The correction changes runner/data documentation and build/history records. The runtime remains byte-identical to the original reviewed candidate. In particular, `task-work-view.js` remains SHA-256 `71f3eadee77c1cbd3636f552c85d06129494eeaff7ea922d612b560033ac12f8`, and the complete PR87 Task dialog remains SHA-256 `a5a35c0300044bb6c9cb6b802ac1ca9e508b01e2466afb6cac9f147671f5be55`. The restored model, CSS and model test are unchanged. The original source review's reasoning about selected-step status, reviewer result/navigation, no-answer meaning and genuine-completion fallback therefore still applies within that source scope.

The workflow is unchanged: the same seven cases, with five semantic checks and two informational captures, are enabled by the two appended `!cancelled()` steps. No branch-specific enablement or new gate was introduced. The fixture consumer and unchanged tabs adapter continue to mount the actual product through synthetic reads.

Plan v2 remains SHA-256 `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d`; plan v1 remains `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8`. These are refinements to the existing provenance and literal-rendering witnesses, not revised acceptance thresholds.

I compared both preserved files directly with the original Git blobs. `before-provenance-fix/local-build.json` is byte-identical to the original record, SHA-256 `bf45eeadbcb578f635226d82c9d294dfc9d9a76cf445ebee43229b1d6f3edb4b`. `before-provenance-fix/source-manifest.json` is byte-identical to the original manifest, SHA-256 `ba31487820c5a9eeabbd2a08e5d853f5db8d5da9cba8eed13a28318891ab18f3`. The earlier `predecessor/` material remains separate. The prior 14 model tests and other local checks are retained historical verification of unchanged runtime; this addendum does not claim a new execution of them.

## Disposition

No remaining source blocker was found for sending this corrected, bounded recovery through the planned native workflow. The next evidence must identify the actual native checkout/tree and package, execute the five semantic cases, retain the two long-review captures and support independent inspection of those results. Source approval cannot substitute for those observations.

This approval does not cover Compact adoption or first-screen fit, human usability, backend permissions or persistence, Estimate/PR83 integration, unrelated Task flows, other browser engines or assistive technology. It adds no new implementation or approval requirement beyond completing the already planned native evaluation.
