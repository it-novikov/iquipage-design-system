'use strict';
/** Contracts for 0.6.0-vnext.21: readable soft success/warning in both themes; no Keycloak theme in the package. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const tokens = JSON.parse(read('tokens/semantic.json'));

function luminance(hex) {
  const channel = v => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const h = hex.replace('#', '');
  return 0.2126 * channel(h.slice(0, 2)) + 0.7152 * channel(h.slice(2, 4)) + 0.0722 * channel(h.slice(4, 6));
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('soft success and warning keep their text readable in both themes', () => {
  for (const theme of ['light', 'dark']) for (const tone of ['success', 'warning', 'danger', 'info']) {
    const ratio = contrast(tokens[theme][tone], tokens[theme][tone + '-bg']);
    assert.ok(ratio >= 4.5, `${theme} ${tone}: ${ratio.toFixed(2)}`);
  }
});
test('the saturated colours stay as fills, and the error state uses them', () => {
  for (const theme of ['light', 'dark']) for (const tone of ['success', 'warning']) assert.notEqual(tokens[theme][tone + '-fill'], tokens[theme][tone + '-bg']);
  assert.ok(read('src/styles/foundation.css').includes('.iq-pro-state.is-error .iq-pro-state-icon{background:var(--iq-warning-fill);color:var(--iq-on-warning)}'));
});
test('the package ships no Keycloak theme', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(!fs.existsSync(path.join(root, 'keycloak')));
  assert.ok(!JSON.stringify(pkg.exports).includes('keycloak') && !pkg.files.includes('keycloak'));
  assert.ok(!read('src/styles/auth-dialog.css').includes('iq-auth-input'));
});
