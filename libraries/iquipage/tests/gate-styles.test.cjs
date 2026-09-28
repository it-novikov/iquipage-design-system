'use strict';
/** Raw-value ratchet for src/styles (SYS-03/04/05/07): no metric may exceed its count in scripts/gates/styles-baseline.json. */
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const gate = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts/gates/styles.mjs')).href);

test('the scanner sees every stylesheet and every metric', async () => {
  const { scan, listFiles, METRICS, summarize } = await gate();
  const files = listFiles();
  assert.ok(files.includes('foundation.css') && files.length >= 11, files.join(','));
  const found = scan(files), summary = summarize(found);
  assert.deepEqual(Object.keys(summary), Object.keys(METRICS));
  assert.ok(summary['font-size-px'].total > 0 && summary['font-size-px'].files['foundation.css'] > 0, 'foundation.css has px font sizes; the scanner is broken if it finds none');
  for (const h of found['font-size-below-12px']) assert.match(h.declaration, /font(-size)?\s*:/, h.declaration);
});

test('no raw-value growth against scripts/gates/styles-baseline.json', async () => {
  const { scan, readBaseline, check, formatGrowth, summarize, METRICS } = await gate();
  const baseline = readBaseline();
  assert.ok(baseline && baseline.metrics, 'baseline missing: run `npm run gates:update`');
  const found = scan();
  const grown = check(found, baseline);
  if (grown.length) console.log(`\nStyle gate: raw values grew\n${formatGrowth(grown)}\n`);
  assert.equal(grown.length, 0, `raw values grew: ${grown.map(g => `${g.metric} ${g.total} > ${g.baseline}`).join('; ')}`);
  const current = summarize(found);
  const shrunk = Object.keys(METRICS).filter(m => baseline.metrics[m] && current[m].total < baseline.metrics[m].total);
  if (shrunk.length) console.log(`note: ${shrunk.map(m => `${m} ${current[m].total} < ${baseline.metrics[m].total}`).join(', ')} — run \`npm run gates:update\` to lower the baseline`);
});

test('the gate catches one extra raw value', async () => {
  const { scan, readBaseline, check } = await gate();
  const found = scan(), baseline = readBaseline();
  const extra = { file: 'foundation.css', line: 1, col: 1, declaration: 'z-index:9999', selector: '.tampered' };
  const grown = check({ ...found, 'z-index-raw': [...found['z-index-raw'], extra] }, baseline);
  assert.deepEqual(grown.map(g => g.metric), ['z-index-raw']);
  assert.ok(grown[0].grownFiles.includes('foundation.css') && grown[0].hits.includes(extra));
});
