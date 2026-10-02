'use strict';
/** Contracts for 0.6.0-vnext.30: the scale, the amount field, figure rows in tooltips and the creatable combobox. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const { scale, scaleParts, SCALE_TARGET_AT } = require('../src/modules/scale.js');
const ui = require('../src/modules/ui.js');
const css = read('src/styles/foundation.css'), components = read('src/modules/components.js'), types = read('types/core.d.ts'), core = read('src/entries/core.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('with a target the track ends at the mark and only an overrun goes past it', () => {
  const within = scaleParts({ target: 100, done: 50, pending: 25 });
  assert.equal(within.end, SCALE_TARGET_AT); assert.equal(within.mark, SCALE_TARGET_AT);
  close(within.done.to, 0.42); close(within.pending.from, 0.42); close(within.pending.to, 0.63); assert.equal(within.over.to, within.over.from);
  const over = scaleParts({ target: '1200000', done: '980000', pending: '340000' });
  close(over.pending.to, SCALE_TARGET_AT); close(over.over.to - over.over.from, 0.084);
  // Done alone beyond the target: clipped at the mark, the rest is the overrun, never wider than the room.
  const far = scaleParts({ target: 10, done: 1000 });
  close(far.done.to, SCALE_TARGET_AT); assert.equal(far.pending.to, far.pending.from); close(far.over.to, 1);
});

test('a zero target has no track and any amount is an overrun; without a target parts share the full track', () => {
  const zero = scaleParts({ target: 0, done: 5 });
  assert.deepEqual([zero.end, zero.mark], [0, 0]); close(zero.over.to, 1 - SCALE_TARGET_AT);
  assert.equal(scaleParts({ target: 0 }).over.to, 0);
  const free = scaleParts({ done: 30, pending: 10, max: 80 });
  assert.deepEqual([free.end, free.mark], [1, null]); close(free.done.to, 0.375); close(free.pending.to, 0.5);
  assert.deepEqual(scaleParts({}).done, { from: 0, to: 0 });
  // Exact decimal strings beyond 2^53 still draw.
  close(scaleParts({ target: '99999999999999999999', done: '49999999999999999999' }).done.to, SCALE_TARGET_AT / 2);
});

test('markup: an image with its text, rounded ends on the outer segments, the overrun tone', () => {
  const html = scale({ target: 100, done: 60, pending: 50, size: 'sm', label: 'План 100 <₽>' });
  assert.match(html, /^<div class="iq-scale" data-size="sm" role="img" aria-label="План 100 &lt;₽&gt;">/);
  assert.match(html, /class="iq-scale-done" style="--iq-scale-from:0\.00%;--iq-scale-to:50\.40%" data-start>/);
  assert.match(html, /class="iq-scale-over"[^>]* data-end>/);
  assert.match(html, /iq-scale-mark" style="--iq-scale-at:84\.00%"/);
  assert.doesNotMatch(html, /iq-scale-pending[^>]*data-end/);
  assert.match(scale({ target: 1, done: 2, over: 'success' }), /data-over="success"/);
  assert.match(scale({ done: 1, size: 'huge' }), /data-size="md"/);
  assert.equal(ui.scale({ done: 1 }), scale({ done: 1 }));
  for (const rule of ['.iq-scale{', '.iq-scale-over{background:var(--iq-danger)}', '.iq-scale[data-over="success"] .iq-scale-over', '.iq-scale>.iq-scale-mark{', '@media (forced-colors: active){.iq-scale-track']) assert.ok(css.includes(rule), rule);
  assert.match(core, /export const scale=scaleModule\.scale;/); assert.match(types, /export declare function scale\(options\?:ScaleOptions\):string;/);
});

test('ui.amount: decimal input, right-aligned tabular figures, unit as a suffix, a hidden label kept for assistive technology', () => {
  const html = ui.amount('Сумма', '1 320 000', { name: 'amount', suffix: '₽', labelHidden: true, placeholder: 'Сумма' });
  assert.match(html, /^<div class="iq-field iq-amount"><div class="iq-input-shell"><input id="field-\d+" name="amount" inputmode="decimal"/);
  assert.match(html, /aria-label="Сумма"/); assert.match(html, /<span class="iq-input-suffix" data-amount-suffix>₽<\/span>/);
  assert.match(ui.amount('Сумма', '', { suffix: '$' }), /<label class="iq-control-label" for="field-\d+">Сумма<\/label>/);
  assert.ok(css.includes('.iq-amount input{text-align:end;font-variant-numeric:tabular-nums}'));
});

test('tooltip figure rows, bottom placement and the creatable combobox', () => {
  assert.match(components, /line\.split\('\\t'\)/); assert.match(components, /row\.className = 'iq-tooltip-row'/);
  assert.match(components, /getAttribute\('placement'\) === 'bottom'/);
  assert.match(components, /hasAttribute\('creatable'\)/); assert.match(components, /this\.emit\('iq-create', \{ label \}\)/);
  assert.ok(css.includes('.iq-tooltip-row{display:flex;justify-content:space-between'));
});

test('the release is 0.6.0-vnext.30 everywhere it is named', () => {
  assert.match(core, /export const version='0\.6\.0-vnext\.30';/);
  assert.equal(require('../package.json').version, '0.6.0-vnext.30');
  assert.match(types, /export declare const version:'0\.6\.0-vnext\.30';/);
  assert.equal(JSON.parse(read('tokens/semantic.json')).meta.version, '0.6.0-vnext.30');
  assert.equal(JSON.parse(read('PROVENANCE.json')).release, '0.6.0-vnext.30');
});
