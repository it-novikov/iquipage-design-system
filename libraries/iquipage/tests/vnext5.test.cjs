'use strict';
/** Contracts added in 0.6.0-vnext.5: grouped sections inside one dropdown menu. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');

test('ui.menu renders escaped non-interactive section labels between actions', () => {
  // ui.js needs a DOM at load time; the contract is checked on its source.
  const source = fs.readFileSync(path.join(root, 'src/modules/ui.js'), 'utf8');
  assert.match(source, /x\.section \? `<p class="iq-menu-section" role="presentation">\$\{components_js_1\.escapeHTML\(x\.section\)\}<\/p>`/);
  // Menu keyboard navigation only walks buttons, so section labels are skipped.
  assert.match(fs.readFileSync(path.join(root, 'src/modules/components.js'), 'utf8'), /items\(\) \{ return Array\.from\(this\.popup\?\.querySelectorAll\('button:not\(:disabled\)'\)/);
});

test('menu sections and long menus are styled by public DS rules', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles/foundation.css'), 'utf8');
  assert.match(css, /\.iq-menu-popup \.iq-menu-section\{/);
  assert.match(css, /\.iq-menu-popup\{max-height:min\(72vh,560px\);overflow:auto\}/);
});
