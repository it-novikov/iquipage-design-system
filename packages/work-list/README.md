# @iquipage/work-list — source-owned UI candidate

Additive, private workspace package for the approved Planning gap PL-DS-01. It does not change the pinned IQUIPAGE archive and is not an npm publication or replacement for the parallel library-extraction track.

## Public surface

`WindowIndex` indexes variable row heights and produces bounded windows plus identity-pinned rows. `TableWindow<T>` enhances the documented native table composition, taking identity, markup and decoration callbacks. `bindRowDrag` translates pointer/keyboard gestures into a controlled drop intent.

The package imports no Task/Release model, repository, API, actor, grant or route. TypeScript uses strict, exact optional properties and unchecked-index checks. Renderer HTML is trusted application code: escape user content before returning it. A renderer must return one `tr`.

## Integration

Import public exports from `@iquipage/work-list` and load `@iquipage/work-list/styles.css` after the single host IQUIPAGE CSS. Run `npm ci --ignore-scripts` and `npm run build` in this package before building the consumer. Do not register another set of custom elements.

Pointer dragging starts only from `[data-work-drag]`; touch scrolling elsewhere remains native. The source and target are supplied by the consumer. Escape, pointer cancellation, blur and disposal remove the ghost and marker. No record is moved by this package. The consumer must check capabilities and show required confirmation.

Enter/Space starts keyboard movement; arrows/Home/End choose a target; Enter requests it; Escape cancels. Table keyboard navigation retains the current control across window boundaries. Selection and hierarchy remain consumer responsibilities.

A shared scroll container is required. Heights are measured, not fixed; an offscreen focused row is retained. All observers/listeners are disposed by `destroy`. Motion uses the host DS tokens and respects reduced motion.

## Verification boundary

`npm test` runs the actual Planning consumer interaction and large-list suites. These cover controlled mouse/keyboard transfer, cancellation, non-drag ordering, automatic-sort rejection and 10,000 rows with bounded DOM and retained focus. `npm run build` independently checks and emits the public library. This is consumer-based runtime acceptance, not a claim of a separately approved DS catalogue or physical screen-reader/device testing.

The final Planning verifier rebuilds this package and fingerprints its sources. The parallel DS owner should promote this additive source through the library release process rather than editing the pinned archive.
