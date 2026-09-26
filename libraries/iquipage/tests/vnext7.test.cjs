'use strict';
/** Contracts added in 0.6.0-vnext.7: catalog tag picker with motion, whiteboard host embedding, inset focus. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('iq-tag-picker is registered and keeps value, creation and motion contracts', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /'iq-tag-picker': IqTagPicker/);
  assert.match(js, /this\.emit\('iq-create', \{ label, accept:/);
  assert.match(js, /this\.emit\('iq-change', \{ value: this\.value \}\)/);
  assert.match(js, /role="combobox" aria-autocomplete="list"/);
  assert.match(js, /chip\.setAttribute\('data-leaving', ''\)/);
  const css = read('src/styles/foundation.css');
  assert.match(css, /@keyframes iq-tag-in/);assert.match(css, /\.iq-tag\[data-entering\]\{animation:iq-tag-in/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.iq-tag\[data-entering\],\.iq-tag\[data-leaving\]\{animation:none\}\}/);
});

test('whiteboard hosts can hide the selection bar and start with the library open', () => {
  assert.match(read('src/styles/whiteboard-workshop.css'), /iq-whiteboard\[selection-bar=none\] :is\(\.wb-command-row,\.wb-formatting\)\{display:none!important\}/);
  assert.match(read('src/modules/whiteboard-studio.js'), /this\.hasAttribute\('library-open'\)\?innerWidth>760/);
});

test('transparent controls draw keyboard focus inside their bounds', () => {
  assert.match(read('src/styles/focus.css'), /:is\(\.iq-btn\.ghost,\.iq-btn\.icon,\.iq-tag,\.iq-segmented>button,\.iq-command-list>button,\.iq-menu-popup button,\.iq-list-item\):focus-visible\{outline-offset:-2px\}/);
});
