# PF04 — private DS56 property-list trial

This is a **private candidate**, not Sprintique adoption. The product manifest, lock and vendor archive remain DS54. The historical `baseline-plan.v1.json`, `baseline-plan.json` and first `comparison-plan.v1.json` are retained byte-for-byte. The DS55 archive and `packages/source-proof.v55.json` remain immutable. `comparison-plan.json` revision2 selects private DS56 on main4275 with the same corrected fixture, profiles and criteria as revision1. The earlier raw native baseline is not rewritten.

## Question and bounded change

Can a wide property list retain familiar label/value reading and editable/static grouping while exposing complete captions at normal and enlarged text? Candidate A uses the existing outer carriers, a no-grow label budget and a flexible value budget. No viewport breakpoint, container observer, runtime change or consumer option is introduced. The list's fixed heights and ellipsis are replaced with natural text height and wrapping. Inputs keep their native single-line buffer.

A remains a trial. In particular, the existing “Поиск участника” label can occupy more lines than a full-width stacked label, and a larger label budget at 615px/root32 can make the owner value wrap. A full-width stacked B remains a competing composition if those costs impair reading. Do not call A or its numeric budgets accepted from Node or geometry alone.

## Exact packages and construction

`comparison-plan.json` pins two independent archive hashes. Both variants import only the `./core` and `./styles.css` public exports from an extracted archive. The Vite dependency is the product's pinned version; no product UI, copied component DOM or local property/control overrides enter the fixture. The private archive lives under `packages/`; `source-proof.json` records its build inputs and archive hash. A published/native-tested archive is immutable and cannot be replaced by different bytes with the same filename.

The revised fixture corrects the public owner avatar payload to `{text:'АА',tone:'blue'}` and requires the actual avatar in both the property and ordinary reference owner. It measures `.iq-select-wrap` as the outer carrier, alongside the inner surface, margins, box sizing and flex basis. Synthetic values and the five previously selected host/font profiles are unchanged. The control is rerun on this same fixture; it is not compared with the earlier missing-avatar measurement as if those were identical inputs.

## Run

From the repository root, after `npm ci --ignore-scripts --prefix products/sprintique`:

```sh
node libraries/iquipage/scripts/build.mjs
node experiments/property-list-reflow/compare.mjs --variant=control --build-only
node experiments/property-list-reflow/compare.mjs --variant=candidate --build-only
```

Native capture requires the existing temporary Playwright 1.62.1 package through `PLAYWRIGHT_MODULE` and its Chromium install through `PLAYWRIGHT_BROWSERS_PATH`. The workflow appends a scoped job to `tabs-geometry.yml`; existing Tabs, Estimate and full product gates stay intact. This frozen trial runs only on a pull request whose head branch is `fix/property-list-readable-layout`, or an explicit workflow dispatch on that branch. Later unrelated product/library changes do not run this experiment; subsequent adoption needs its own applicable consumer verification.

```sh
node experiments/property-list-reflow/compare.mjs --variant=control
node experiments/property-list-reflow/compare.mjs --variant=candidate
node experiments/property-list-reflow/verify-comparison.mjs
```

`PROPERTY_REFLOW_EVIDENCE_DIR` optionally selects a per-variant output directory. The verifier takes the parent directory containing `control/results.json` and `candidate/results.json`. Native capture requires committed input sources and records the actual revision/tree, archive bytes, compiled public module inputs, fixture hashes, browser version, raw profile geometry and PNG hashes. Locally only `--build-only` is permitted in the present environment; the known `/proc` Chromium blocker is not retried.

## Acceptance and honest limits

The candidate range oracle checks complete property-list labels and display captions against clipping ancestors and the host, with no document horizontal escape. Native input buffers and decorative avatar initials are separately recorded. The verifier compares the ordinary reference shapes relative to their rows; a change in document y due to a taller list is expected. Neither range boxes nor an all-green runner prove painted-ink or human acceptance.

In the existing wide-normal and wide-text200 profiles, native keyboard actions open and cancel owner/date, change and restore an owner with exactly one intent per choice, preserve trigger/input identity and check combobox caret navigation and reachable tag search. While the popup is open, only the host width changes from 615px to 270px. Window size and resize-event count must remain unchanged. Old/new popup geometry and natural scroll events are retained. A popup losing adjacency is explicitly reported for independent review; this CSS-only trial does not silently add an observer or force a fake window resize.

Independent PNG review must assess normal density, the relationship between adjacent pairs, full captions and long words, avatar/name association, the pill/dot, first-line reading and the no-grow label cost. If A makes the important facts harder to compare, revise the composition or test B. The scope is the public DS recipe. Actual Task, product-owned `.tdr-pill`, readonly empty tag captions, human observation and release browser/screen-reader checks remain separate, open work.
