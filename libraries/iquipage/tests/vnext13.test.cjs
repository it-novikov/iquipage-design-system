'use strict';
/** Contracts added in 0.6.0-vnext.13: closed rich tooltips stay hidden, keyboard-only focus tooltips, dock-tools, switcher hover. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('a closed rich tooltip is never displayed', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-tooltip-rich:popover-open\{display:grid\}/);
  assert.doesNotMatch(css, /\.iq-tooltip-rich\{display:grid/);
  assert.match(read('src/modules/components.js'), /if \(!child\.matches\(':focus-visible'\)\) return;/);
});
test('hosts choose the canvas tools shown in the dock', () => {
  const css = read('src/styles/whiteboard-workshop.css');
  for (const tool of ['select', 'hand', 'connect']) assert.match(css, new RegExp(`iq-whiteboard\\[dock-tools\\]:not\\(\\[dock-tools~=${tool}\\]\\) \\.wb-dock \\[data-tool=${tool}\\]`));
});
test('switchers underline their label on hover instead of filling the background', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-switcher\.iq-btn\.ghost:hover,\.iq-switcher\.iq-btn\.ghost\[aria-expanded=true\]\{background:transparent/);
  assert.match(css, /\.iq-switcher:hover \.iq-switcher-label,\.iq-switcher\[aria-expanded=true\] \.iq-switcher-label\{text-decoration-color:currentColor\}/);
});
