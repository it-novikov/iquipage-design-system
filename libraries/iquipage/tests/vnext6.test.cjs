'use strict';
/** Contracts added in 0.6.0-vnext.6: a public command-dialog variant for product search and palettes. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'src/styles/foundation.css'), 'utf8');

test('kind="command" gives any iq-dialog the command layout without a demo id', () => {
  assert.match(css, /iq-dialog\[kind=command\] \.iq-dialog-inner\{padding:0\}/);
  assert.match(css, /iq-dialog\[kind=command\] \.iq-dialog\{width:min\(620px,calc\(100vw - 32px\)\)/);
});

test('command groups, empty state and the active row are public classes', () => {
  for (const selector of ['.iq-command-group{', '.iq-command-empty{', '.iq-command-list>button[aria-selected=true]{']) assert.ok(css.includes(selector), selector);
});
