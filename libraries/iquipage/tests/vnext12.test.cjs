'use strict';
/** Contracts added in 0.6.0-vnext.12: date formatters, rich tooltip, footer checkboxes, property list, soft badge, rail tooltips. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
global.HTMLElement ??= class {};
global.customElements ??= { get() {}, define() {} };
const time = require('../src/modules/time.js');

test('dates read as 04.10.2000 and 04.10.2000 14:00, calendar dates never shift', () => {
  assert.equal(time.formatDate('2000-10-04'), '04.10.2000');
  assert.equal(time.formatDateTime('2000-10-04T14:00:00Z', { timeZone: 'UTC' }), '04.10.2000 14:00');
  assert.equal(time.formatDateTime('2000-10-04'), '04.10.2000');
  assert.equal(time.formatDateRange('2026-09-21', '2026-10-05'), '21.09.2026 – 05.10.2026');
  assert.equal(time.formatDate(''), '');
  assert.match(read('src/modules/date-field.js'), /time_js_1\.formatDate\(this\.chosen\)/);
  assert.match(read('src/entries/core.js'), /export const formatDateRange=m4\.formatDateRange;/);
});
test('iq-tooltip takes a heading and one line per newline', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /const heading = this\.getAttribute\('heading'\)/);
  assert.match(js, /tip\.classList\.add\('iq-tooltip-rich'\)/);
  assert.match(read('src/styles/foundation.css'), /\.iq-tooltip-rich\{display:grid/);
});
test('editor footer actions are DS checkboxes with an optional hint', () => {
  const js = read('src/modules/editor.js');
  assert.match(js, /className = 'iq-check md-footer-toggle'/);
  assert.match(js, /this\.listen\(actions,'change'/);
  assert.doesNotMatch(js, /iq-btn secondary sm pill/);
});
test('property list, soft badge and the rail tooltip placement are public', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-properties :is\(iq-select,iq-combobox,iq-date-field\)\{display:grid;grid-template-columns:var\(--iq-properties-label,88px\)/);
  assert.match(css, /\.iq-badge\.soft\.info\{background:var\(--iq-info-bg\)/);
  assert.match(read('src/modules/whiteboard-workshop.js'), /this\.getAttribute\('dock'\)==='side'&&button\.closest\('\.wb-footer'\)/);
});
