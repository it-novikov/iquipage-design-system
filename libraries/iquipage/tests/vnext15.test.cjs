'use strict';
/** Contracts for 0.6.0-vnext.15: the settings workspace redesign on the DS side navigation and shared compositions. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the settings layout fills its container and switches halves on phones', () => {
  const js = read('src/modules/settings.js');
  assert.doesNotMatch(js, /max-width:1440px/);
  assert.match(js, /var\(--iq-settings-nav-width,264px\)/);
  assert.match(js, /\.measure\{max-width:var\(--iq-settings-measure,1120px\)\}/);
  assert.match(js, /:host\(\[view=index\]\) \.content,:host\(\[view=section\]\) aside\{display:none\}/);
});
test('settings navigation is the DS side navigation, with a neutral current item and quiet group labels', () => {
  const js = read('src/modules/settings.js'), css = read('src/styles/settings.css'), foundation = read('src/styles/foundation.css');
  assert.match(js, /class="product-nav-link"/);
  assert.match(js, /role="group" aria-labelledby=/);
  assert.match(js, /class="nav-count"/);
  assert.doesNotMatch(css, /\.iq-settings-navigation/);
  assert.doesNotMatch(css, /aria-current[^}]*accent/);
  assert.match(foundation, /\.product-nav-section h3,\.product-nav-group-label\{/);
  assert.match(read('src/styles/touch.css'), /\.product-nav-link\{min-height:44px\}|,\.product-nav-link\{min-height:44px\}/);
});
test('shared compositions exist and use DS tokens only', () => {
  const css = read('src/styles/settings.css');
  for (const name of ['.iq-page-heading', '.iq-settings-stack', '.iq-settings-group', '.iq-settings-panel', '.iq-settings-row', '.iq-settings-field-row', '.iq-settings-facts', '.iq-settings-lock', '.iq-settings-savebar', '.iq-empty.compact', '.iq-secret', '.iq-choice-list', '.iq-choice-grid', '.iq-settings-skeleton'])
    assert.ok(css.includes(name + '{') || css.includes(name + ' ') || css.includes(name + '>'), name);
  assert.doesNotMatch(css, /font(-size)?:[^;}]*\b(1[0-9]|2\d|30)px/);
  assert.match(css, /\.iq-settings-savebar\[hidden\]\{display:none\}/);
});
test('selected visual choices get an accent ring without a fill', () => {
  const css = read('src/styles/settings.css');
  assert.match(css, /\.iq-visual-choice:has\(:checked\)\{border-color:var\(--iq-accent\);box-shadow:inset 0 0 0 1px var\(--iq-accent\)\}/);
  assert.match(css, /\.iq-visual-choices\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
test('types describe the new navigation items', () => {
  const types = read('types/core.d.ts');
  assert.match(types, /interface SettingsNavigationItem \{id:string;label:string;icon\?:string;count\?:number;countLabel\?:string;\}/);
  assert.match(types, /export declare const version:'0\.6\.0-vnext\.1[5-9]';/);
});
