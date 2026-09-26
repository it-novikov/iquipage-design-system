'use strict';
/** Contracts added in 0.6.0-vnext.4: touch targets and keyboard exit from the map object library. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('coarse pointers get 44px buttons, navigation links and checkboxes', () => {
  const touch = read('src/styles/touch.css');
  assert.match(touch, /@media \(pointer:coarse\)/);
  assert.match(touch, /\.iq-btn,\.iq-work-navigation a\{min-height:44px\}/);
  assert.match(touch, /\.iq-btn\.icon\{min-width:44px\}/);
  assert.match(touch, /\.iq-select-trigger,iq-select\[density=compact\] \.iq-select-trigger\{min-height:44px\}/);
  assert.match(touch, /\.iq-check\{min-height:44px;min-width:44px/);
  // Loaded last, so no earlier density rule overrides it.
  assert.match(read('scripts/build.mjs'), /focus\.css'\)\+'\\n'\+await read\('src\/styles\/touch\.css'\);/);
});

test('Escape inside the object library closes it and returns focus to the toggle', () => {
  const studio = read('src/modules/whiteboard-studio.js');
  assert.match(studio, /e\.key==='Escape'&&this\.libraryOpen&&this\.tool==='select'&&e\.target\.closest\?\.\('\.wb-library'\)/);
  assert.match(studio, /this\.libraryOpen=false;this\.render\(\);this\.shell\.querySelector\('\[data-wb-action=library-toggle\]'\)\?\.focus/);
});
