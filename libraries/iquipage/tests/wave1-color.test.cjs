'use strict';
/** Wave 1 colour/theme contracts: COL-03, COL-06, COL-07, COL-08, COL-09, COL-10, COL-11, COL-12, COL-13, COL-16, COL-22, ENG-14. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8'), exists = f => fs.existsSync(path.join(root, f));
const tokens = JSON.parse(read('tokens/semantic.json')), tokensCSS = read('tokens/tokens.css'), pkg = JSON.parse(read('package.json'));
const foundation = read('src/styles/foundation.css'), focus = read('src/styles/focus.css'), settings = read('src/styles/settings.css');
global.HTMLElement = global.HTMLElement || class {};
const { badge } = require('../src/modules/ui.js');

const parse = hex => { const h = hex.slice(1); const n = s => parseInt(s, 16); return [n(h.slice(0, 2)), n(h.slice(2, 4)), n(h.slice(4, 6)), h.length === 8 ? n(h.slice(6, 8)) / 255 : 1]; };
const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
const ratio = (fg, bg) => { const a = luminance(over(parse(fg), parse(bg))), b = luminance(parse(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const atLeast = (fg, bg, min, label) => assert.ok(ratio(fg, bg) >= min, `${label}: ${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)} < ${min}`);
const themes = ['light', 'dark'];
const walk = (dir, out = []) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const f = path.posix.join(dir, e.name); e.isDirectory() ? walk(f, out) : out.push(f); } return out; };

test('COL-03: accent fills are visible as UI on every dark surface and keep white text readable, for every accent', () => {
  const variants = { default: { light: {}, dark: {} }, ...tokens.accents };
  for (const [name, variant] of Object.entries(variants)) for (const theme of themes) {
    const t = { ...tokens[theme], ...variant[theme] };
    for (const bg of ['raised', 'surface', 'canvas']) atLeast(t['accent-fill'], t[bg], 3, `${theme}/${name} accent-fill on ${bg}`);
    atLeast(t['on-accent'], t['accent-fill'], 4.5, `${theme}/${name} text on accent-fill`);
    atLeast(t['on-accent'], t['accent-hover-fill'], 4.5, `${theme}/${name} text on accent-hover-fill`);
    assert.notEqual(t['accent-hover-fill'], t['accent-fill'], `${theme}/${name}: hover fill must differ from the fill`);
  }
});

test('COL-10: accent variants live in semantic.json and tokens.css generates their blocks; settings.css has none', () => {
  for (const accent of ['violet', 'green']) {
    for (const theme of themes) assert.deepEqual(Object.keys(tokens.accents[accent][theme]).sort(), ['accent', 'accent-fill', 'accent-hover-fill', 'accent-soft', 'focus']);
    assert.ok(tokensCSS.includes(`:root[data-accent="${accent}"]{`), `${accent} light block`);
    assert.ok(tokensCSS.includes(`[data-theme="dark"][data-accent="${accent}"]{`), `${accent} dark block`);
    assert.ok(tokensCSS.includes(`:root:not([data-theme="light"])[data-accent="${accent}"]{`), `${accent} system-dark block`);
    assert.ok(tokensCSS.includes(`:root[data-accent="${accent}"]{\n  --iq-accent: ${tokens.accents[accent].light.accent};`));
  }
  assert.ok(!/:root\[data-accent=/.test(settings), 'hand-written accent blocks are gone from settings.css');
  assert.ok(!read('scripts/gates/contrast.mjs').includes('settings.css'), 'the contrast gate reads accents from semantic.json');
});

test('COL-11: a document without data-theme follows the system scheme', () => {
  const block = tokensCSS.slice(tokensCSS.indexOf('@media (prefers-color-scheme: dark){\n:root:not([data-theme="light"]){'));
  assert.ok(block.length > 0, 'prefers-color-scheme block exists');
  const body = block.slice(0, block.indexOf('}\n}'));
  assert.ok(body.includes('  color-scheme: dark;'));
  for (const [k, v] of Object.entries(tokens.dark)) if (tokens.light[k] !== v) assert.ok(body.includes(`  --iq-${k}: ${v};`), `system-dark carries ${k}`);
  assert.ok(tokensCSS.indexOf('[data-theme="dark"]{') < tokensCSS.indexOf('@media (prefers-color-scheme: dark)'), 'explicit dark block precedes the system fallback');
});

test('ENG-14: theme-boot.js is a tiny plain script, shipped, exported and inlined before the catalog styles', () => {
  const src = read('src/theme-boot.js'), body = src.replace(/\/\*[\s\S]*?\*\/\s*/, '');
  assert.ok(Buffer.byteLength(body) < 400, `boot body is ${Buffer.byteLength(body)} B`);
  assert.ok(!/\b(import|export|require)\b/.test(body), 'plain script, no module syntax');
  new Function(body); // parses
  for (const key of ['theme', 'accent', 'density', 'motion']) assert.ok(body.includes(key), key);
  assert.ok(body.includes("'iq-'") && body.includes('prefers-color-scheme') && body.includes('document.documentElement.dataset'));
  assert.equal(pkg.exports['./theme-boot.js'], './dist/theme-boot.js');
  assert.ok(exists('dist/theme-boot.js') && Buffer.byteLength(read('dist/theme-boot.js')) < 400);
  for (const t of ['src/template.html', 'src/whiteboard-template.html', 'src/workbench-template.html']) {
    const html = read(t);
    assert.ok(html.includes('<script>__IQ_BOOT__</script><style>__IQ_CSS__</style>'), `${t} inlines the boot before the stylesheet`);
    assert.ok(!html.includes('data-theme="light"'), `${t} no longer hard-codes the light theme`);
  }
  assert.ok(read('scripts/build.mjs').includes("save('dist/theme-boot.js'"));
  assert.ok(read('src/modules/app.js').includes("localStorage.setItem('iq-theme'"), 'the catalog persists under the boot key');
  const doc = read('docs/INTEGRATION.md');
  assert.ok(doc.includes('## Темизация') && doc.includes('theme-boot.js') && doc.includes('prefers-color-scheme') && doc.includes('iq-theme'));
});

test('COL-08: no --iq-fixed-* anywhere; the replacements are per-theme roles', () => {
  for (const f of [...walk('src'), ...walk('tokens')]) if (/\.(css|js|html|json)$/.test(f)) assert.ok(!read(f).includes('--iq-fixed-'), f);
  for (const theme of themes) assert.ok(!Object.keys(tokens[theme]).some(k => k.startsWith('fixed-')), `${theme} has no fixed-* tokens`);
  for (const role of ['scrim', 'scrim-strong', 'story-ink', 'story-surface', 'story-muted', 'secondary-fill', 'secondary-hover-fill', 'raised-edge', 'on-white', 'document-bed', 'media-chip', 'shadow-color-soft', 'shadow-color-strong', 'shadow-color-deep']) {
    for (const theme of themes) assert.ok(tokens[theme][role], `${theme} ${role}`);
  }
  for (const role of ['scrim', 'story-surface', 'secondary-fill', 'raised-edge', 'shadow-1', 'shadow-2', 'shadow-3']) assert.notEqual(tokens.light[role], tokens.dark[role], `${role} differs per theme`);
  for (const theme of themes) {
    for (const k of ['ink', 'muted', 'subtle']) atLeast(tokens[theme][`story-${k}`], tokens[theme]['story-surface'], 4.5, `${theme} story-${k}`);
    atLeast(tokens[theme]['on-white'], tokens[theme].white, 4.5, `${theme} on-white`);
    atLeast(tokens[theme]['document-bed-ink'], tokens[theme]['document-bed'], 4.5, `${theme} document-bed-ink`);
  }
  assert.ok(!/\[data-theme=dark\]\{\s*\}/.test(foundation), 'the empty dark block is gone');
  const patches = foundation.match(/\[data-theme=dark\][^{]*\{/g) || [];
  assert.ok(patches.length <= 2, `dark patches left: ${patches.length}\n${patches.join('\n')}`);
  assert.ok(!foundation.includes('border-color:transparent}') || !/\[data-theme=dark\][^{]*\{border-color:transparent\}/.test(foundation), 'no dark border-color:transparent patch');
});

test('COL-09: the dead colour tokens are gone from tokens and sources', () => {
  const dead = ['glass', 'specular', 'material-deep', 'material-mid', 'material-light', 'primary-hover', 'epic-fill', 'on-epic', 'card-accent-critical', 'card-accent-high', 'card-accent-epic', 'task-epic-surface'];
  for (const k of dead) for (const theme of themes) assert.ok(!(k in tokens[theme]), `${theme} ${k}`);
  const pattern = new RegExp(`--iq-(${dead.join('|')})\\b`);
  for (const f of [...walk('src'), ...walk('tokens')]) if (/\.(css|js|html)$/.test(f)) assert.ok(!pattern.test(read(f)), f);
  assert.ok(!read('src/modules/palette.js').includes('card-accent'));
});

test('COL-13: dark layers separate by shadow and a 1px edge instead of transparent borders', () => {
  for (const n of [1, 2, 3]) {
    assert.ok(!(`shadow-${n}` in tokens.base), `shadow-${n} is per theme`);
    const alpha = parseInt(tokens.dark[`shadow-${n}`].match(/#[0-9A-F]{6}([0-9A-F]{2})/i)[1], 16) / 255;
    assert.ok(alpha >= 0.4 && alpha <= 0.6, `dark shadow-${n} alpha ${alpha.toFixed(2)}`);
  }
  atLeast(tokens.dark['raised-edge'], tokens.dark.raised, 1.5, 'dark raised edge');
  atLeast(tokens.light['raised-edge'], tokens.light.raised, 1.5, 'light raised edge');
  for (const sel of ['.iq-card{', '.iq-metric{', '.iq-popup{', '.task-card{', '.iq-btn-group{']) {
    const rule = foundation.slice(foundation.indexOf(sel), foundation.indexOf('}', foundation.indexOf(sel)));
    assert.ok(rule.includes('var(--iq-raised-edge)'), `${sel} uses the raised edge`);
  }
});

test('COL-06: status badges carry a glyph, chart series differ by shape and order, planned separates from info', () => {
  assert.ok(foundation.includes('.iq-badge:is(.success,.danger,.warning)>.iq-icon{display:inline-block}'));
  assert.ok(!foundation.includes('.iq-badge>.iq-icon,.iq-badge>.iq-dot{display:none}'));
  assert.match(badge('Готово'), /^<span class="iq-badge success"><svg class="iq-icon" data-glyph="checkCircle"/);
  assert.match(badge('Ошибка', 'danger'), /data-glyph="xCircle"/);
  assert.match(badge('На проверке'), /data-glyph="warning"/);
  assert.ok(!badge('Черновик', 'outline').includes('<svg') && !badge('Готово', 'success', false).includes('<svg'));
  const chart = read('src/modules/data-chart.js');
  assert.ok(chart.includes('function chartMarker') && chart.includes('<rect ') && chart.includes('<polygon ') && chart.includes('shape-${i%4}'));
  assert.ok(foundation.includes('.iq-series-swatch.shape-2{') && foundation.includes('.iq-series-swatch.shape-3{'));
  assert.equal(tokens.light['chart-series-1'], tokens.light.info, 'series 1 is blue');
  assert.equal(tokens.light['chart-series-2'], tokens.light.warning, 'series 2 is orange');
  assert.equal(tokens.light['chart-series-3'], tokens.light.success, 'series 3 is green');
  assert.equal(tokens.light['chart-series-4'], tokens.light['planned-fill'], 'series 4 is purple');
  // Protanopia (Machado 2009, severity 1) in linear RGB, then CIE76 ΔE in Lab.
  const lin = c => channel(c), P = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
  const lab = ([R, G, B]) => { const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883; const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const protan = hex => { const [R, G, B] = parse(hex).slice(0, 3).map(lin); return lab(P.map(r => r[0] * R + r[1] * G + r[2] * B)); };
  const dE = (a, b) => Math.hypot(...protan(a).map((v, i) => v - protan(b)[i]));
  assert.ok(dE(tokens.light.planned, tokens.light.info) >= 20, `light planned/info protan ΔE ${dE(tokens.light.planned, tokens.light.info).toFixed(1)}`);
  assert.ok(dE(tokens.dark.planned, tokens.dark.info) >= 12, `dark planned/info protan ΔE ${dE(tokens.dark.planned, tokens.dark.info).toFixed(1)}`);
  for (const theme of themes) {
    atLeast(tokens[theme].planned, tokens[theme]['planned-bg'], 4.5, `${theme} planned on planned-bg`);
    atLeast(tokens[theme]['on-planned'], tokens[theme]['planned-fill'], 4.5, `${theme} on-planned`);
    atLeast(tokens[theme].planned, tokens[theme].canvas, 4.5, `${theme} planned on canvas`);
  }
});

test('COL-16: disabled is a colour role, not an opacity', () => {
  for (const theme of themes) {
    const t = tokens[theme];
    assert.ok(t['disabled-ink'] && t['disabled-fill'], theme);
    atLeast(t['disabled-ink'], t.canvas, 4.5, `${theme} disabled-ink on canvas`);
    atLeast(t['disabled-ink'], t['disabled-fill'], 4.5, `${theme} disabled-ink on disabled-fill`);
  }
  for (const sel of ['.iq-btn:disabled{', '.iq-select-trigger:disabled{', '.iq-option[aria-disabled=true]{', '.iq-check:has(:disabled),.iq-radio:has(:disabled),.iq-switch:has(:disabled){']) {
    const rule = foundation.slice(foundation.indexOf(sel), foundation.indexOf('}', foundation.indexOf(sel)));
    assert.ok(rule.length > 0 && !rule.includes('opacity') && rule.includes('var(--iq-disabled-ink)'), `${sel} → ${rule}`);
  }
});

test('COL-22: the focus ring sits on a canvas-coloured halo', () => {
  assert.ok(focus.includes(':focus-visible{outline:2px solid var(--iq-focus);outline-offset:2px;box-shadow:0 0 0 4px var(--iq-focus-halo)}'));
  assert.ok(focus.includes('outline-offset:-2px;box-shadow:inset 0 0 0 4px var(--iq-focus-halo)'));
  for (const theme of themes) {
    assert.equal(tokens[theme]['focus-halo'], tokens[theme].canvas, `${theme} halo is the canvas colour`);
    atLeast(tokens[theme].focus, tokens[theme]['focus-halo'], 3, `${theme} ring on halo`);
    atLeast(tokens[theme]['focus-halo'], tokens[theme]['accent-fill'], 3, `${theme} halo on accent button`);
    atLeast(tokens[theme]['focus-halo'], tokens[theme].primary, 3, `${theme} halo on primary button`);
  }
});

test('COL-12 / COL-07: prefers-contrast: more is generated; the critical signal reads on its lit field', () => {
  const block = tokensCSS.slice(tokensCSS.indexOf('@media (prefers-contrast: more){'));
  assert.ok(block.includes('  --iq-line: var(--iq-line-strong);') && block.includes('  --iq-muted: var(--iq-ink);') && block.includes('  --iq-raised-edge: var(--iq-line-strong);'));
  assert.deepEqual(tokens.contrast.more.line, 'var(--iq-line-strong)');
  const core = over(parse(tokens.light['task-light-critical-core']), parse(tokens.light.canvas)).map(Math.round);
  const lit = '#' + core.map(v => v.toString(16).padStart(2, '0')).join('');
  atLeast(tokens.light['task-critical-text'], lit, 5, 'critical text on the lit field');
  assert.ok(foundation.includes('tr[data-task-emphasis]:not([data-task-emphasis=none]) .task-row-meta .task-id{color:var(--iq-task-light-meta)}'));
});
