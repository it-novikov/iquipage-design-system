'use strict';
/** Contracts added in 0.6.0-vnext.8: single-scroller roadmap, visible work-list header, flicker-free loading,
 *  calendar entries as task cards, and a markdown editor that can open straight in preview. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('src/styles/foundation.css');

test('iq-roadmap[fill] makes the grid the only scroller', () => {
  assert.match(css, /iq-roadmap\[fill\] \.rm-scroll\{flex:1;min-height:0;max-height:none\}/);
});
test('work lists show a DS column header', () => {
  assert.match(read('src/styles/work-list.css'), /\.iq-work-list thead th\{/);
});
test('.iq-loading waits 180ms before appearing and .iq-reveal fades content in', () => {
  assert.match(css, /\.iq-loading\{display:grid;gap:var\(--iq-space-3\);animation:iq-loading-appear var\(--iq-motion-standard\) var\(--iq-ease\) var\(--iq-loading-delay\) backwards\}/); // wave 1: the 180 ms gate is the --iq-loading-delay token (not zeroed by reduced motion)
  assert.match(css, /\.iq-reveal\{animation:iq-reveal/);
});
test('calendar entries render as task cards with key, signal, kind and owner, never the raw id', () => {
  const js = read('src/modules/structured.js');
  assert.match(js, /class="task-card plan-card/);assert.ok(js.includes("(0,task_kind_js_1.taskSignal)(t)"));
  assert.doesNotMatch(js, /plan-entry-top"><span>\$\{components_js_1\.escapeHTML\(t\.id\)\}/);
});
test('iq-markdown-editor[preview] opens in preview without a height animation', () => {
  assert.match(read('src/modules/editor.js'), /this\.setPreviewMode\(!!this\._initialPreview \|\| this\.hasAttribute\('preview'\), false, false\)/);
});
