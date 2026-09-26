'use strict';
/** Contracts for 0.6.0-vnext.14: the settings workspace (PR #8) on DS tokens, loaded after the component styles. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('settings components are registered by core and exported', () => {
  const core = read('src/entries/core.js');
  assert.match(core, /export const IqSettingsLayout=settings\.IqSettingsLayout;/);
  assert.match(core, /registerAuthDialog\(\);registerAuthScreen\(\);registerSettings\(\);/);
  assert.match(read('src/manifest.json'), /"auth-dialog\.js",\s*"settings\.js"/);
});
test('settings styles load after foundation so the base rules do not override them', () => {
  const build = read('scripts/build.mjs');
  assert.ok(build.indexOf("src/styles/foundation.css") < build.indexOf("src/styles/settings.css"));
  assert.ok(build.indexOf("src/styles/settings.css") < build.indexOf("src/styles/focus.css"));
});
test('settings typography uses the DS type scale and navigation icons exist', () => {
  const css = read('src/styles/settings.css');
  assert.doesNotMatch(css, /font(-size)?:[^;}]*\b(1[2-9]|2\d|30)px/);
  assert.match(css, /\.iq-settings-heading h1\{font:600 var\(--iq-work-compact-title\)/);
  assert.match(read('src/modules/settings.js'), /icon\(item\.icon\|\|'sliders',18\)/);
});
