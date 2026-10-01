'use strict';
/** Contracts for 0.6.0-vnext.28: tree columns, status glyphs in board tones, hold-to-drag, the «Готово» divider. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const { statusGlyph, STATUS_GLYPHS, bindTreeDrag } = require('../src/modules/tree-columns.js');

test('status glyphs follow the board columns: shape, tone and a grey word only for review and testing', () => {
  const table = Object.fromEntries(Object.entries(STATUS_GLYPHS).map(([k, v]) => [k, [v.shape, v.tone, v.word]]));
  assert.deepEqual(table, {
    ready: ['ring', 'neutral', ''], in_progress: ['half', 'info', ''], review: ['half', 'warning', 'ревью'],
    ready_for_testing: ['ring-dot', 'planned', 'к тестированию'], testing: ['half', 'warning', 'тестирование'],
    ready_for_release: ['check', 'success', '']
  });
  assert.ok(Object.isFrozen(STATUS_GLYPHS) && Object.isFrozen(STATUS_GLYPHS.review));
  const html = statusGlyph('in_progress');
  assert.match(html, /^<span class="iq-status-glyph" data-shape="half" data-tone="info" role="img" aria-label="В работе"/);
  assert.match(html, /viewBox="0 0 15 15" width="15" height="15"/);
  assert.match(statusGlyph('ready_for_release'), /class="iq-status-check"/);
  assert.match(statusGlyph('ready_for_testing', { label: 'К тестированию', size: 18 }), /aria-label="К тестированию"[\s\S]*width="18"/);
  assert.match(statusGlyph({ shape: 'check', tone: 'success', label: '<b>' }), /data-shape="check" data-tone="success"[^>]*aria-label="&lt;b&gt;"/);
  assert.match(statusGlyph('unknown'), /data-shape="ring" data-tone="neutral"/);
  assert.match(statusGlyph({ shape: 'star', tone: 'pink' }), /data-shape="ring" data-tone="neutral"/);
});

test('the drag binding needs a root and onDrop, and the core entry and types export all of it', () => {
  assert.throws(() => bindTreeDrag({}), TypeError);
  const core = read('src/entries/core.js'), types = read('types/core.d.ts');
  for (const name of ['statusGlyph', 'STATUS_GLYPHS', 'bindTreeDrag', 'treeDropPosition']) {
    assert.match(core, new RegExp(`export const ${name}=treeColumns\\.${name};`));
    assert.match(types, new RegExp(`export declare (function|const) ${name}`));
  }
  assert.match(core, /export const version='0\.6\.0-vnext\.28';/);
  const manifest = JSON.parse(read('src/manifest.json'));
  for (const list of [manifest.application, manifest.library, manifest.entries.core]) assert.ok(list.includes('tree-columns.js'));
});

test('tree columns, glyph tones, drag states and the divider are token-only CSS', () => {
  const css = read('src/styles/foundation.css'), block = css.slice(css.indexOf('/* vnext.28'));
  assert.match(block, /\.tree-row\.has-columns\{display:grid;grid-template-columns:minmax\(0,1fr\) var\(--tree-columns/);
  assert.match(block, /border-block:1px solid transparent;background-clip:padding-box/);
  assert.match(block, /\.tree-row-main\{[^}]*padding-inline-start:calc\(16px \+ var\(--tree-level,0\)\*21px\)/);
  assert.match(block, /\.tree-row\[data-tone=critical\] \.tree-node-label\{color:var\(--iq-task-critical-text\);font-weight:500\}/);
  assert.match(block, /\.tree-row\.is-muted \.tree-node-label,\.tree-row\.is-muted\[data-tone\] \.tree-node-label\{color:var\(--iq-muted\);font-weight:400\}/);
  for (const tone of ['info', 'warning', 'planned', 'success']) assert.match(block, new RegExp(`\\.iq-status-glyph\\[data-tone=${tone}\\]\\{color:var\\(--iq-${tone}\\)\\}`));
  assert.match(block, /\[data-tree-drop-target\]\{position:relative;box-shadow:inset 0 0 0 1\.5px var\(--iq-accent\)\}/);
  assert.match(block, /\.tree-row\[data-tree-dragging\]\{opacity:\.35\}/);
  assert.match(block, /\.tree-divider\{display:flex;[^}]*height:36px;margin-top:6px/);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|!important|z-index/i);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)\{\.iq-tree-drag-ghost\{animation:none\}\}/);
  // The ghost is an opaque raised surface: the lift never fades it; a compact preview fits its content.
  assert.match(block, /\.iq-tree-drag-ghost\{[^}]*background:var\(--iq-raised\)/);
  assert.match(block, /@keyframes iq-tree-lift\{from\{scale:\.98\}\}/);
  assert.doesNotMatch(block, /\.iq-tree-drag-ghost[^{]*\{[^}]*opacity/);
  assert.match(block, /\.iq-tree-drag-ghost\[data-fit\]\{width:max-content/);
});
