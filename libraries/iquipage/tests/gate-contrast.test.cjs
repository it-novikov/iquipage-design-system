'use strict';
/** Contrast ratchet (COL-14): no token pair may fail WCAG 2 unless it already fails in the baseline, and no baseline pair may get worse. */
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const gate = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts/gates/contrast.mjs')).href);

test('contrast matrix covers both themes and the three accents', async () => {
  const { computeMatrix, PAIRS } = await gate();
  const rows = computeMatrix();
  assert.ok(PAIRS.length >= 100, `matrix has ${PAIRS.length} pairs`);
  for (const theme of ['light', 'dark']) for (const accent of ['default', 'violet', 'green']) {
    assert.ok(rows.some(r => r.theme === theme && r.accent === accent && r.label.startsWith('link: accent')), `${theme}/${accent} link pair`);
  }
  for (const r of rows) assert.ok(Number.isFinite(r.ratio) && r.ratio >= 1 && r.ratio <= 21, `${r.key}: ${r.ratio}`);
  const ink = rows.find(r => r.key === 'light/default/ink / canvas');
  assert.ok(ink.ratio > 15, 'ink on canvas must be near maximal contrast');
});

test('no contrast regression against scripts/gates/contrast-baseline.json', async () => {
  const { computeMatrix, readBaseline, check, formatTable } = await gate();
  const baseline = readBaseline();
  assert.ok(baseline && baseline.entries, 'baseline missing: run `npm run gates:update`');
  const rows = computeMatrix();
  const { newFailures, regressions, stale } = check(rows, baseline);
  if (stale.length) console.log(`note: ${stale.length} baseline pair(s) now pass or are gone; run \`npm run gates:update\` to shrink the baseline:\n  ${stale.join('\n  ')}`);
  const bad = [...newFailures, ...regressions];
  if (bad.length) {
    console.log(`\nContrast gate: ${newFailures.length} new failure(s), ${regressions.length} regression(s)\n${formatTable(bad)}\n`);
  }
  assert.equal(newFailures.length, 0, `new contrast failures: ${newFailures.map(r => `${r.key} = ${r.ratio} (< ${r.threshold})`).join('; ')}`);
  assert.equal(regressions.length, 0, `contrast regressions: ${regressions.map(r => `${r.key} = ${r.ratio} (was ${r.baselineRatio})`).join('; ')}`);
});

test('the gate catches a new failure and a worsened baseline pair', async () => {
  const { computeMatrix, readBaseline, check } = await gate();
  const rows = computeMatrix(), baseline = readBaseline();
  const passing = rows.find(r => r.pass), failing = rows.find(r => !r.pass && baseline.entries[r.key]);
  const tampered = rows.map(r => r === passing ? { ...r, ratio: 1.2, pass: false } : r === failing ? { ...r, ratio: r.ratio - 0.5 } : r);
  const result = check(tampered, baseline);
  assert.deepEqual(result.newFailures.map(r => r.key), [passing.key]);
  assert.deepEqual(result.regressions.map(r => r.key), [failing.key]);
});
