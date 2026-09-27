'use strict';
/** Contracts for 0.6.0-vnext.18: people, sections, relation lanes, tag picker "+", colour circles. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('one person keeps one avatar tone and groups show at most three discs with one tooltip', () => {
  const ui = read('src/modules/ui.js'), css = read('src/styles/foundation.css');
  assert.match(ui, /function avatarTone\(key\)/);
  assert.match(ui, /list\.length > max \? list\.slice\(0, max - 1\) : list/);
  assert.match(ui, /<iq-tooltip heading=/);
  assert.match(css, /\.iq-avatars:is\(\.xs,\.sm,\.lg\) \.iq-avatar\+\.iq-avatar\{margin-left:calc\(var\(--avatar-size\) \* -\.25\)\}/);
});
test('sections, compact heading scale and property sizes', () => {
  const css = read('src/styles/foundation.css');
  for (const rule of ['.iq-section{', '.iq-section-head{', 'iq-markdown-editor[density=compact] .md-preview h1{', '.iq-properties{--iq-properties-label:136px}'])
    assert.ok(css.includes(rule), rule);
  assert.match(css, /\.iq-property-strip \.iq-select-trigger>\.iq-icon:last-child,\.iq-property-strip \.iq-combo-shell>\.iq-icon:last-child\{display:none\}/);
});
test('relation lanes name the role of their nodes towards the centre', () => {
  const js = read('src/modules/relation-map.js');
  for (const label of ['Блокируют эту задачу', 'Ждут эту задачу', 'Связанные', 'Родительская задача', 'Заблокирована', 'Эта задача'])
    assert.ok(js.includes(label), label);
  assert.doesNotMatch(js, /'Зависит от'|'Блокирует'/);
  assert.match(js, /NODE_H=76/);
  assert.match(read('src/styles/foundation.css'), /\.rm-edge\.rm-edge-blocker\{stroke:var\(--iq-warning\)\}/);
});
test('the tag picker creates tags from a trailing "+" and removes chips in two steps', () => {
  const js = read('src/modules/components.js'), css = read('src/styles/foundation.css');
  assert.match(js, /class="iq-btn ghost icon sm iq-tag-picker-add" data-tag-create aria-label="Создать тег"/);
  assert.doesNotMatch(js, /iq-tag iq-tag-add/);
  assert.match(js, /if \(this\.armed\) \{ this\.armed = false; this\.remove/);
  assert.match(css, /\.iq-tag-picker-add\{flex:none;margin-left:auto/);
});
test('colour circles keep distinct fills in both themes', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-color-swatch::before\{[^}]*background:var\(--iq-tag-tone-text/);
  assert.match(css, /\.iq-color-swatch:has\(:checked\)>\.iq-icon\{opacity:1\}/);
});
