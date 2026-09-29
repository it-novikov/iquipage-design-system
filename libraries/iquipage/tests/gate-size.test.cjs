'use strict';
/** Bundle-size ratchet (ENG-01/03): gzip of the core closure, the CSS and icons may not grow more than 2% over scripts/gates/size-baseline.json. Needs `npm run build`. */
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const gate = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts/gates/size.mjs')).href);

test('core closure is the entry plus the modules it imports transitively', async () => {
  const { coreClosure } = await gate();
  const files = coreClosure();
  assert.equal(files[0], 'dist/core.js');
  assert.ok(files.includes('dist/modules/components.js') && files.includes('dist/modules/icons.js'), files.join(','));
  for (const f of ['roadmap', 'graph', 'image-crop', 'whiteboard', 'whiteboard-core']) assert.ok(!files.includes(`dist/modules/${f}.js`), `core must not pull ${f}`);
});

test('gzip sizes stay within +2% of scripts/gates/size-baseline.json', async () => {
  const { measure, readBaseline, check, format } = await gate();
  const baseline = readBaseline();
  assert.ok(baseline && baseline['core-closure-gzip'], 'baseline missing: run `npm run build && npm run gates:update`');
  const rows = check(measure(), baseline);
  const over = rows.filter(r => !r.ok);
  if (over.length) console.log(`\nSize gate:\n${format(rows)}\n`);
  assert.equal(over.length, 0, `over budget: ${over.map(r => `${r.metric} ${r.current} B > ${r.limit} B`).join('; ')}`);
});

test('the gate catches growth above 2%', async () => {
  const { measure, readBaseline, check } = await gate();
  const m = measure(), baseline = readBaseline();
  const rows = check({ ...m, 'icons-gzip': Math.ceil(baseline['icons-gzip'] * 1.021) }, baseline);
  assert.deepEqual(rows.filter(r => !r.ok).map(r => r.metric), ['icons-gzip']);
});
