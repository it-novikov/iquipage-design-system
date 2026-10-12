# PF04 candidate A — local preparation checkpoint

Source base: `220af664ef561d3f5ff1b873122281ef352e8f25`. Author: GPT-6 Astra (AI agent). This checkpoint contains a private DS55 trial. Sprintique remains DS54, and no product adoption, release readiness or human acceptance is claimed. The author made no commits or reference changes; root owns integration/publication.

## What changed

The wide property list wraps its existing label/value carriers according to available inline width and text size. Label/selected/static captions can wrap, including long words, while heights follow the text. Actual carrier margins and box sizing are consistent; popups and hidden inputs are excluded. Static avatar/name parts stay together. The native tag search stays a single-line input and can regain its natural height on focus. Other property modes, ordinary controls and runtime JS are unchanged. The status dot retains its existing centered relationship to the pill caption.

These are candidate choices: no-grow labels can cost extra lines, the widened label budget can make a long value wrap at 615px/root32, and one common row rhythm can look different from the earlier fixed 36px list. The existing full-width stacked B remains a real alternative. Native frames must decide whether the tradeoff improves reading.

## Package identity

| Item | SHA256 | State |
| --- | --- | --- |
| Consumed control `iquipage-web-0.6.0-vnext.54.tgz` | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` | Product vendor and pins unchanged |
| Private trial `iquipage-web-0.6.0-vnext.55.tgz` | `71318ed08cd22878c3d6ab5649c229d6da103f2bef77d9bc4bb1f7b70cad5ade` | `experiments/property-list-reflow/packages/`; NOT adopted |

The original unpublished draft `766c4456…` was retained separately in scratch before the final private draft was packed. It was never consumed or tested natively. Once published/native-tested, the frozen archive must not be overwritten with different bytes.

## Checks actually run

| Check | Result and evidence |
| --- | --- |
| DS deterministic build and private pack | PASS, version55 in manifest, tokens, public entry/declaration and provenance |
| Final standard `npm test --prefix libraries/iquipage` | 478/478 PASS; `local/ds-node-final.log` |
| Existing size gate | PASS; CSS gzip101572 ≤101612, core185230 ≤185291, icons55675 ≤57218; no baseline change |
| Existing product boundary/style checks | PASS; product-contained imports, public DS entries and product tokens |
| Same revised control54 fixture build | `BUILT_NOT_RENDERED`; `local/control-build.json` |
| Same revised private55 fixture build | `BUILT_NOT_RENDERED`; `local/candidate-build.json` |
| JavaScript syntax, diff whitespace and bridge card | PASS |
| Native geometry/keyboard, independent visual review, actual Task | NOT_RUN |

The first draft full Node run found the CSS budget overage and one unrelated absolute timing failure in `security057`; those are recorded in `local/summary.json`. Only comments in the current property-list block were shortened to fit the existing budget. No budget/security assertion was relaxed. The isolated timing test and final complete standard run passed; that does not establish product performance.

Both builds fingerprint 36 compiled inputs, including four fixture inputs and 32 packed public module/CSS inputs, and verify all176 archive files. The same corrected fixture requires the owner avatar to exist and measures the true outer carrier. Historical baseline plans remain unchanged. `packages/source-proof.json` ties the private archive to build inputs; the comparison plan pins both independently named archives.

## Native handoff

The appended `property-list-trial` job in `.github/workflows/tabs-geometry.yml` builds the library and both consumers, captures control and candidate independently, runs the paired verifier and uploads all raw evidence. Existing Tabs/full gates are preserved. Root will integrate the current main/workflow changes before publication.

Native commands are documented in `experiments/property-list-reflow/README.md`. The five existing profiles remain. Wide-normal and wide-text200 add keyboard select/date open/cancel, exact selection-intent counts, unchanged control identity, native input Home/End and actual Tab access to tag search. An open popup is measured before/after changing only the host width; no window resize is dispatched. Evidence distinguishes a new detachment from an existing one, while both remain explicitly pending review. No observer or popup repair is hidden in the fixture.

Acceptance stays open for painted text, normal density and paired rhythm, the no-grow label cost, pill/dot balance, actual popup association, Task/product-owned pill, independent reviews and release platforms. The range oracle and keyboard runner cannot close these by themselves. Known readonly empty-tag semantics remain a separate scope.
