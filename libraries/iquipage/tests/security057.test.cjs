'use strict';
/** Regressions for the R4 security findings in this package. Each test fails on the previous build. */
const test = require('node:test'), assert = require('node:assert/strict');
global.HTMLElement = class {};
const { safeMarkdown } = require('../src/modules/markdown.js');
const { IqCalendar } = require('../src/modules/components.js');
const { IqDataChart } = require('../src/modules/data-chart.js');
const { IqDataSurface } = require('../src/modules/advanced-base.js');
const { mark } = require('../src/modules/icons.js');

const elapsed = source => { const started = process.hrtime.bigint(); safeMarkdown(source); return Number(process.hrtime.bigint() - started) / 1e6; };

test('unmatched delimiter runs stay linear instead of rescanning every suffix', () => {
  // The previous parser needed ~1.7s at 20 000 and ~27s at 80 000 escaped delimiters.
  const small = elapsed('*' + '\\\\*'.repeat(20000)), large = elapsed('*' + '\\\\*'.repeat(80000));
  assert.ok(large < 2000, `80 000 escaped delimiters took ${large.toFixed(0)}ms`);
  assert.ok(large < small * 8 + 200, `growth ${small.toFixed(0)}ms -> ${large.toFixed(0)}ms is worse than linear`);
});

test('unterminated autolinks stay linear and remain escaped text', () => {
  // The previous parser searched for a closing bracket again at every '<': ~630ms at 80 000.
  const small = elapsed('<https://a.b'.repeat(20000)), large = elapsed('<https://a.b'.repeat(80000));
  assert.ok(large < 250, `80 000 unterminated autolinks took ${large.toFixed(0)}ms`);
  assert.ok(large < small * 8 + 100, `growth ${small.toFixed(0)}ms -> ${large.toFixed(0)}ms is worse than linear`);
  assert.equal(safeMarkdown('plain <notaurl> tail'), '<p>plain &lt;notaurl&gt; tail</p>');
});

test('the bounded parser still renders the supported subset', () => {
  assert.equal(safeMarkdown('**b** _i_ `c`'), '<p><strong>b</strong> <em>i</em> <code>c</code></p>');
  assert.match(safeMarkdown('[x](https://ok.example/a)'), /<a href="https:\/\/ok\.example\/a" target="_blank"/);
  assert.equal(safeMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('calendar reset normalizes the time attribute exactly like mount and the property', () => {
  const hostile = '14:30" onload="alert(1)';
  const calendar = Object.assign(Object.create(IqCalendar.prototype), {
    time: '09:15', initial: '2026-01-02', chosen: '2026-01-02', focused: '2026-01-02', current: new Date('2026-01-02T12:00:00Z'),
    isConnected: false, render() {}, getAttribute(name) { return name === 'time' ? hostile : null; }
  });
  calendar.timeValue = hostile;
  assert.equal(calendar.time, '09:15');
  calendar.resetToInitial();
  assert.equal(calendar.time, '14:30');
});

test('chart and surface states normalize an arbitrary attribute before it reaches markup', () => {
  const hostile = 'ready"><img src=x onerror=alert(1)>';
  const chart = Object.assign(Object.create(IqDataChart.prototype), { getAttribute: () => hostile });
  assert.equal(chart.state, 'ready');
  const surface = Object.assign(Object.create(IqDataSurface.prototype), { _state: 'ready', getAttribute: () => hostile });
  assert.equal(surface.state, 'ready');
  const loading = Object.assign(Object.create(IqDataSurface.prototype), { _state: 'ready', getAttribute: () => 'loading' });
  assert.equal(loading.state, 'loading');
});

test('the public mark helper has no class hole', () => {
  assert.equal(mark.length, 0);
  assert.match(mark(), /^<svg class="iq-mark"/);
  assert.equal(mark('" onload="alert(1)'), mark());
});
