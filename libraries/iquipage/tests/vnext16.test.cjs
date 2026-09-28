'use strict';
/** Contracts for 0.6.0-vnext.16: task drawer building blocks (editor actions, value chips, inline title, RGB tags). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the editor offers toolbar actions only while editing, an empty-state action and Escape back to preview', () => {
  const js = read('src/modules/editor.js');
  assert.match(js, /set toolbarActions\(value\)/);
  assert.match(js, /class="md-toolbar-action" data-toolbar-action=/);
  assert.match(js, /data-empty-action=/);
  assert.match(js, /event\.key !== 'Escape' \|\| !this\.previewOnBlur \|\| this\.previewMode/);
  assert.match(js, /this\.querySelector\('\.md-toolbar'\)\.hidden = on;/);
});
test('selects show the chosen avatar and tone; the property strip styles value-first chips', () => {
  const js = read('src/modules/components.js'), css = read('src/styles/foundation.css');
  assert.match(js, /this\.trigger\.dataset\.tone = typeof match\?\.tone === 'string'/);
  assert.match(js, /iq-select-avatar/);
  for (const rule of ['.iq-properties iq-tag-picker{', '.iq-property-strip{', '.iq-property-strip .iq-select-trigger[data-tone=critical]', '.iq-property-strip iq-date-field[data-tone=danger]', '.iq-inline-title{', '.iq-color-field{', '.md-toolbar-actions{'])
    assert.ok(css.includes(rule), rule);
});
test('any RGB tag colour renders without inline styles and with theme-derived contrast', () => {
  const js = read('src/modules/components.js'), css = read('src/styles/foundation.css');
  assert.match(js, /function tagToneAttributes\(tone\)/);
  assert.match(js, /insertRule\(`\[data-tag-color="\$\{hex\}"\]\{--iq-tag-color:#\$\{hex\}\}`/);
  assert.match(js, /data-tone="custom" data-tag-color="\$\{hex\}"/);
  assert.match(css, /oklch\(from var\(--iq-tag-color,#62646B\) \.43 min\(c,\.13\) h\)/);
  assert.match(css, /\[data-theme=dark\] \.iq-tag\[data-tone=custom\]/);
  assert.match(read('src/entries/core.js'), /export const tagToneAttributes=m0\.tagToneAttributes;/);
  assert.match(read('types/core.d.ts'), /export declare function tagToneAttributes\(tone:string\):string;/);
});
test('custom tag colours keep at least 4.5:1 text contrast across hues in both themes', () => {
  // OKLCH → sRGB for the derived pairs (fill L .945/.28, text L .43/.86, clamped chroma), then WCAG contrast.
  const toLinear = ([L, C, h]) => { const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(v => Math.min(1, Math.max(0, v))); };
  const lum = c => { const [r, g, b] = toLinear(c); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + .05) / (b + .05); };
  for (let h = 0; h < 360; h += 15) {
    assert.ok(ratio([.43, .13, h], [.945, .045, h]) >= 4.5, 'light ' + h);
    assert.ok(ratio([.86, .10, h], [.28, .05, h]) >= 4.5, 'dark ' + h);
  }
});
