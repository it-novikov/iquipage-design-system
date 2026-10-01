'use strict';
/** Wave 0 accessibility and colour contracts: A11Y-01..05, COL-01, COL-02, COL-04, COL-05 (first step), COL-17. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const tokens = JSON.parse(read('tokens/semantic.json'));
const foundation = read('src/styles/foundation.css'), focus = read('src/styles/focus.css');
const components = read('src/modules/components.js');
const notify = components.slice(components.indexOf('function notify('), components.indexOf('class IqNumber'));

const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const n = parseInt(hex.slice(1, 7), 16); return 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255); };
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const atLeast = (fg, bg, min, why) => assert.ok(contrast(fg, bg) >= min, `${why}: ${fg} on ${bg} = ${contrast(fg, bg).toFixed(2)} < ${min}`);

test('A11Y-01: notify() announces through permanent live nodes and keeps undo toasts until dismissed', () => {
  assert.ok(notify.includes(`node.setAttribute('role', role)`) && notify.includes(`liveNode('status', 'polite')`) && notify.includes(`liveNode('alert', 'assertive')`));
  assert.ok(notify.includes('sr-only iq-toast-live'), 'live nodes are visually hidden and reused');
  assert.ok(notify.includes('[options.message, options.description, options.action?.label]') && notify.includes('live.textContent = announcement'));
  assert.ok(notify.includes(`options.tone === 'danger' ? alert : polite`), 'errors are assertive');
  assert.ok(!notify.includes('class="iq-toast-copy" role="status"'), 'the visual toast no longer carries the live role');
  // vnext.25 (SPR-8): only an undo action keeps the toast; the timing policy itself is tested in vnext25.test.cjs.
  assert.ok(components.includes('if (options.action?.undo)\n        return 0;'), 'a toast with an undo action does not auto-dismiss');
  assert.ok(notify.includes('!duration ||') && notify.includes("toast.matches(':hover')"), 'persistent toasts skip the timer; hover pause stays');
});

test('A11Y-02: the board drag handle is at least 24x24 on desktop', () => {
  assert.ok(foundation.includes('.iq-drag-handle{width:24px;height:26px;min-width:24px;'));
  assert.ok(!/\.task-card \.iq-drag-handle \{[^}]*width:18px/.test(foundation), 'the task card no longer shrinks the handle');
});

test('A11Y-03: tag remove buttons are 24x24 and reachable on coarse pointers', () => {
  assert.ok(/\.iq-tag button\{[^}]*width:24px;height:24px/.test(foundation));
  assert.ok(/\.iq-tag \.iq-tag-remove\{[^}]*width:24px;height:24px/.test(foundation));
  assert.ok(foundation.includes('@media(hover:none),(pointer:coarse){iq-tag-picker:is([appearance=inline],[appearance=ghost]) .iq-tag .iq-tag-remove{width:24px;opacity:1'));
});

test('A11Y-04: search, command and select-search fields show a focus ring', () => {
  assert.ok(focus.includes('.iq-search-small:focus-within,.iq-command-input:focus-within{box-shadow:inset 0 0 0 1.5px var(--iq-focus)}'));
  // vnext.27: the search inside an open list keeps a soft ring (the caret and the open list already show focus).
  assert.ok(focus.includes('.iq-select-search:focus-within{box-shadow:inset 0 0 0 1px var(--iq-line-strong)}'));
});

test('A11Y-05: roadmap resize handles are 24px with an extended hit area', () => {
  assert.ok(/\.rm-handle\{[^}]*width:24px/.test(foundation));
  assert.ok(foundation.includes(".rm-handle::before{content:'';position:absolute;inset:-8px}"));
});

test('COL-01: field borders use --iq-field-line and reach 3:1 on recessed and raised in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const t = tokens[theme];
    assert.ok(t['field-line'], `${theme} field-line`);
    atLeast(t['field-line'], t.recessed, 3, `${theme} field border on recessed`);
    atLeast(t['field-line'], t.raised, 3, `${theme} field border on raised`);
  }
  assert.ok(!foundation.includes('--iq-fixed-55545e'), 'the dark field patch is gone');
  for (const shell of ['.iq-input-shell,.iq-combo-shell{', '.iq-select-trigger{', '.iq-date-trigger{']) {
    const rule = foundation.slice(foundation.indexOf(shell), foundation.indexOf('}', foundation.indexOf(shell)));
    assert.ok(rule.includes('border:1px solid var(--iq-field-line)'), shell);
  }
});

test('COL-02: dark secondary buttons keep a visible border', () => {
  assert.ok(foundation.includes('.iq-btn.secondary{border-color:var(--iq-control);background:var(--iq-secondary-fill)}'), 'secondary fill is a per-theme role, not a dark patch');
  assert.ok(!foundation.includes('[data-theme=dark] .iq-btn.secondary'));
  atLeast(tokens.dark.control, tokens.dark['secondary-fill'], 3, 'dark secondary border on its fill');
});

test('COL-04: light --iq-faint reads at 4.5:1 on the canvas', () => {
  atLeast(tokens.light.faint, tokens.light.canvas, 4.5, 'placeholder on canvas');
});

test('COL-05: --iq-line-strong reaches 3:1 on canvas and surface in both themes and outlines badges', () => {
  for (const theme of ['light', 'dark']) {
    const t = tokens[theme];
    atLeast(t['line-strong'], t.canvas, 3, `${theme} line-strong on canvas`);
    atLeast(t['line-strong'], t.surface, 3, `${theme} line-strong on surface`);
    atLeast(t['line-strong'], t.raised, 3, `${theme} line-strong on raised`);
  }
  assert.ok(foundation.includes('.iq-badge.outline{background:transparent;color:var(--iq-muted);border:1px solid var(--iq-line-strong);'));
  assert.ok(!/\.iq-badge\.outline\{[^}]*var\(--iq-line\)/.test(foundation));
});

test('COL-17: light whiteboard shape outlines reach 3:1 on the whiteboard canvas', () => {
  atLeast(tokens.light['wb-shape-line'], tokens.light['wb-canvas'], 3, 'shape line on wb canvas');
  atLeast(tokens.dark['wb-shape-line'], tokens.dark['wb-canvas'], 3, 'dark shape line on wb canvas');
});
