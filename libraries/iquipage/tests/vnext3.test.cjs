'use strict';
/** Contracts added in 0.6.0-vnext.3 for the Sprintique UX alignment. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'tokens/semantic.json'), 'utf8'));
const foundation = fs.readFileSync(path.join(root, 'src/styles/foundation.css'), 'utf8');
const TONES = ['neutral', 'blue', 'purple', 'green', 'amber', 'red'];

test('every tag tone has its own fill and text token in both themes', () => {
  for (const theme of ['light', 'dark']) for (const tone of TONES) for (const part of ['fill', 'text'])
    assert.match(tokens[theme][`tag-${tone}-${part}`] || '', /^#[0-9A-F]{6}$/i, `${theme} tag-${tone}-${part}`);
  // Blue and green used to reuse light avatar colours in dark theme.
  for (const tone of ['blue', 'green']) assert.notEqual(tokens.dark[`tag-${tone}-fill`], tokens.light[`tag-${tone}-fill`]);
});

test('tag tones and the selectable tag are public CSS variants', () => {
  for (const tone of TONES) assert.ok(foundation.includes(`.iq-tag[data-tone=${tone}]`), tone);
  assert.match(foundation, /button\.iq-tag\[aria-pressed=true\]\{box-shadow:inset 0 0 0 1\.5px var\(--iq-tag-tone-text/);
});

test('the type scale is a token contract, including meta and title steps', () => {
  const steps = { display: '4rem', heading1: '2.75rem', heading2: '2rem', heading3: '1.375rem', lead: '1.25rem', title: '1.125rem', body: '1rem', interface: '.875rem', label: '.8125rem', caption: '.75rem', meta: '.75rem' }; // rem at a 16px root since wave 1 (TYP-03); meta is the 12px floor (TYP-04)
  for (const [step, size] of Object.entries(steps)) {
    assert.equal(tokens.base[`type-${step}-size`], size, step);
    assert.ok(tokens.base[`type-${step}-weight`], step + ' weight');
  }
  assert.ok(!/:root\{--iq-type-/.test(foundation), 'type scale must not be redefined in CSS');
});

test('form dialog, compact select and switcher are public variants', () => {
  for (const selector of ['.iq-dialog[data-layout=form]', '.iq-dialog-body', 'iq-select[density=compact]', 'iq-select[label-hidden]>.iq-control-label', '.iq-switcher-label'])
    assert.ok(foundation.includes(selector), selector);
});

test('work-list is exposed as a public entry with no product dependency', () => {
  global.HTMLElement ||= class {};
  const { WindowIndex } = require('../src/modules/work-list-index.js');
  const { TableWindow } = require('../src/modules/work-list-table.js');
  const { bindRowDrag } = require('../src/modules/work-list-drag.js');
  const index = new WindowIndex(['a', 'b', 'c'], 40);
  assert.equal(index.total, 120);
  index.measure(1, 60);
  assert.equal(index.total, 140);
  assert.equal(typeof TableWindow, 'function');
  assert.equal(typeof bindRowDrag, 'function');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['./work-list'].import, './dist/work-list.js');
  assert.ok(fs.existsSync(path.join(root, 'types/work-list.d.ts')));
});

test('the embedded board accepts the edit command', () => {
  const source = fs.readFileSync(path.join(root, 'src/modules/whiteboard.js'), 'utf8');
  assert.match(source, /const allowed=\['edit','quick-note'/);
});
