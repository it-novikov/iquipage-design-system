/**
 * Contrast ratchet (COL-14). Computes WCAG 2 contrast (and APCA Lc, informational)
 * for a fixed matrix of token pairs from tokens/semantic.json, for both themes and
 * for the three accents (default blue, data-accent=violet, data-accent=green — the
 * overrides are read from src/styles/settings.css).
 *
 *   node scripts/gates/contrast.mjs            print the full table
 *   node scripts/gates/contrast.mjs --write    rewrite scripts/gates/contrast-baseline.json
 *
 * The baseline lists the pairs that fail TODAY with their current ratio. The test
 * (tests/gate-contrast.test.cjs) fails when a pair fails that is not in the baseline
 * or when a baseline pair got worse. Use `npm run gates:update` after a deliberate cleanup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const baselinePath = path.join(root, 'scripts/gates/contrast-baseline.json');

export const THRESHOLDS = { text: 4.5, large: 3, ui: 3, disabled: 3 };
/** Tokens that `:root[data-accent=…]` rewrites; pairs touching them are evaluated per accent. */
const ACCENT_TOKENS = ['accent', 'accent-fill', 'accent-soft', 'focus', 'accent-hover-fill'];
const ACCENTS = ['default', 'violet', 'green'];

// ---- colour math -----------------------------------------------------------
export function parseHex(hex) {
  let h = String(hex).trim();
  if (h === 'transparent') return [0, 0, 0, 0];
  if (!/^#[0-9a-f]{3,8}$/i.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  h = h.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  const n = s => parseInt(s, 16);
  return [n(h.slice(0, 2)), n(h.slice(2, 4)), n(h.slice(4, 6)), h.length === 8 ? n(h.slice(6, 8)) / 255 : 1];
}
export function over(fg, bg) {
  const [r, g, b, a] = fg, [R, G, B] = bg;
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}
export function mix(a, b, weightA) { return over([a[0], a[1], a[2], weightA], b); }
export function toHex(c) { return '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function luminance([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function wcag(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** APCA-W3 0.1.9 (informational only; the gate is WCAG 2). */
export function apca(fg, bg) {
  const y = ([r, g, b]) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.0721750 * (b / 255) ** 2.4;
  const clamp = Y => (Y < 0.022 ? Y + (0.022 - Y) ** 1.414 : Y);
  const Yt = clamp(y(fg)), Yb = clamp(y(bg));
  if (Math.abs(Yb - Yt) < 0.0005) return 0;
  if (Yb > Yt) { const S = (Yb ** 0.56 - Yt ** 0.57) * 1.14; return S < 0.1 ? 0 : (S - 0.027) * 100; }
  const S = (Yb ** 0.65 - Yt ** 0.62) * 1.14; return S > -0.1 ? 0 : (S + 0.027) * 100;
}

// ---- token sets ------------------------------------------------------------
export function loadTokens() { return JSON.parse(fs.readFileSync(path.join(root, 'tokens/semantic.json'), 'utf8')); }

/** Reads `:root[data-accent=X]{--iq-a:var(--iq-b);…}` blocks from settings.css into {X:{a:b}}. */
export function readAccentOverrides() {
  const css = fs.readFileSync(path.join(root, 'src/styles/settings.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const map = {};
  for (const m of css.matchAll(/:root\[data-accent=["']?(\w+)["']?\]\s*\{([^}]*)\}/g)) {
    const entries = {};
    for (const d of m[2].matchAll(/--iq-([\w-]+)\s*:\s*var\(--iq-([\w-]+)\)/g)) entries[d[1]] = d[2];
    map[m[1]] = { ...(map[m[1]] || {}), ...entries };
  }
  for (const a of ACCENTS.slice(1)) if (!map[a] || !map[a].accent) throw new Error(`settings.css has no :root[data-accent=${a}] override for --iq-accent`);
  return map;
}

/** Flat {token: value} for a theme + accent. */
export function themeTokens(tokens, theme, accent, overrides) {
  const t = { ...tokens.base, ...tokens[theme] };
  if (accent !== 'default') for (const [k, src] of Object.entries(overrides[accent])) { if (!(src in t)) throw new Error(`accent ${accent}: ${src} is not a token`); t[k] = t[src]; }
  return t;
}

// ---- the matrix ------------------------------------------------------------
// [label, fg, bg, kind]; fg/bg are token names or (t) => rgba. kind: text | large | ui | disabled.
const alpha = (token, w, base) => t => mix(parseHex(t[token]), parseHex(t[base]), w);
export const PAIRS = [];
const add = (...rows) => PAIRS.push(...rows);
for (const fg of ['ink', 'muted', 'subtle', 'faint']) for (const bg of ['canvas', 'surface', 'raised', 'recessed']) add([`${fg} / ${bg}`, fg, bg, 'text']);
add(['ink / hover', 'ink', 'hover', 'text'], ['muted / hover', 'muted', 'hover', 'text'], ['ink / menu-focus', 'ink', 'menu-focus', 'text'], ['muted / menu-focus', 'muted', 'menu-focus', 'text'], ['ink / accent-soft (::selection)', 'ink', 'accent-soft', 'text']);
for (const tone of ['success', 'warning', 'danger', 'info', 'planned']) add(
  [`${tone} / canvas`, tone, 'canvas', 'text'], [`${tone} / surface`, tone, 'surface', 'text'], [`${tone} / raised`, tone, 'raised', 'text'],
  [`${tone} / ${tone}-bg (soft badge)`, tone, `${tone}-bg`, 'text'], [`on-${tone} / ${tone}-fill (filled badge)`, `on-${tone}`, `${tone}-fill`, 'text'], [`${tone}-fill / canvas (ui)`, `${tone}-fill`, 'canvas', 'ui']);
add(['on-neutral / neutral-fill', 'on-neutral', 'neutral-fill', 'text'], ['epic / canvas', 'epic', 'canvas', 'text'], ['on-epic / epic-fill', 'on-epic', 'epic-fill', 'text']);
add(['link: accent / canvas', 'accent', 'canvas', 'text'], ['accent / surface', 'accent', 'surface', 'text'], ['accent / raised', 'accent', 'raised', 'text'], ['accent / accent-soft (pressed btn)', 'accent', 'accent-soft', 'text'],
  ['on-accent / accent-fill (btn.accent)', 'on-accent', 'accent-fill', 'text'], ['on-accent / accent-hover-fill', 'on-accent', 'accent-hover-fill', 'text'], ['accent-fill / canvas (ui)', 'accent-fill', 'canvas', 'ui'], ['accent / canvas (ui, pressed border)', 'accent', 'canvas', 'ui'],
  ['on-primary / primary (btn.primary)', 'on-primary', 'primary', 'text'], ['focus-text / focus-fill', 'focus-text', 'focus-fill', 'text']);
for (const bg of ['canvas', 'surface', 'raised', 'recessed']) add([`focus / ${bg} (ring)`, 'focus', bg, 'ui']);
add(['focus / accent-fill (ring on accent btn)', 'focus', 'accent-fill', 'ui'], ['focus / primary (ring on primary btn)', 'focus', 'primary', 'ui']);
for (const line of ['line', 'line-strong', 'control']) for (const bg of ['canvas', 'surface', 'raised']) add([`${line} / ${bg} (ui)`, line, bg, 'ui']);
add(['placeholder: subtle / raised (.iq-input-shell)', 'subtle', 'raised', 'text'], ['placeholder: subtle / field-bg', 'subtle', 'field-bg', 'text'], ['placeholder: muted / raised (.md-input)', 'muted', 'raised', 'text'], ['placeholder: faint / canvas (inline title)', 'faint', 'canvas', 'text'],
  ['disabled btn.primary: on-primary@45% / primary@45% over canvas', alpha('on-primary', .45, 'canvas'), alpha('primary', .45, 'canvas'), 'disabled'],
  ['disabled ghost/secondary: ink@45% / canvas', alpha('ink', .45, 'canvas'), 'canvas', 'disabled'],
  ['disabled input: ink@65% / surface', alpha('ink', .65, 'surface'), 'surface', 'disabled'],
  ['disabled option: ink@40% / raised', alpha('ink', .40, 'raised'), 'raised', 'disabled'],
  ['disabled calendar day: ink@30% / raised', alpha('ink', .30, 'raised'), 'raised', 'disabled']);
for (const k of ['critical', 'high', 'epic']) add([`task-${k}-text / task-${k}-surface`, `task-${k}-text`, `task-${k}-surface`, 'text'], [`card-accent-${k} / canvas (ui stripe)`, `card-accent-${k}`, 'canvas', 'ui']);
add(['task-light-meta / canvas', 'task-light-meta', 'canvas', 'text']);
for (const k of ['', 'neutral-', 'blue-', 'purple-', 'green-', 'amber-', 'red-']) add([`tag-${k}text / tag-${k}fill`, `tag-${k}text`, `tag-${k}fill`, 'text']);
for (const k of ['blue', 'sand', 'lilac', 'sage']) add([`avatar-${k}-ink / avatar-${k}-bg`, `avatar-${k}-ink`, `avatar-${k}-bg`, 'text']);
add(['on-avatar-more / avatar-more', 'on-avatar-more', 'avatar-more', 'text'], ['nav-current-ink / nav-current-bg', 'nav-current-ink', 'nav-current-bg', 'text'], ['calendar-complete-ink / calendar-complete-bg', 'calendar-complete-ink', 'calendar-complete-bg', 'text'],
  ['calendar-adjacent-text / canvas', 'calendar-adjacent-text', 'canvas', 'text'], ['sample-ink / sample-bg', 'sample-ink', 'sample-bg', 'text'], ['priority-neutral-ink / priority-neutral-bg', 'priority-neutral-ink', 'priority-neutral-bg', 'text'],
  ['canvas / ink (tooltip)', 'canvas', 'ink', 'text'], ['fixed-1d1d1f / white (btn.white)', 'fixed-1d1d1f', 'white', 'text'], ['white / material-deep', 'white', 'material-deep', 'text']);
for (const k of ['sand', 'lavender', 'mint', 'sky', 'rose']) add([`wb-note-ink / wb-${k}`, 'wb-note-ink', `wb-${k}`, 'text']);
add(['wb-shape-line / wb-canvas (ui)', 'wb-shape-line', 'wb-canvas', 'ui'], ['wb-edge / wb-canvas (ui)', 'wb-edge', 'wb-canvas', 'ui'], ['graph-edge / canvas (ui)', 'graph-edge', 'canvas', 'ui'], ['graph-node-border / graph-node (ui)', 'graph-node-border', 'graph-node', 'ui']);
for (let i = 1; i <= 6; i++) add([`chart-series-${i} / canvas (ui)`, `chart-series-${i}`, 'canvas', 'ui']);

const dependsOnAccent = ([, fg, bg]) => [fg, bg].some(x => typeof x === 'string' && ACCENT_TOKENS.includes(x));

function resolve(t, x, fallbackBg) {
  if (typeof x === 'function') return x(t);
  if (!(x in t)) throw new Error(`Token "${x}" is missing from tokens/semantic.json`);
  const c = parseHex(t[x]);
  return c[3] < 1 ? over(c, fallbackBg || parseHex(t.canvas)) : c;
}

/** @returns rows: {key, theme, accent, label, kind, fg, bg, ratio, apca, threshold, pass} */
export function computeMatrix(tokens = loadTokens(), overrides = readAccentOverrides()) {
  const rows = [];
  for (const theme of ['light', 'dark']) for (const pair of PAIRS) {
    const [label, fg, bg, kind] = pair;
    for (const accent of dependsOnAccent(pair) ? ACCENTS : ['default']) {
      const t = themeTokens(tokens, theme, accent, overrides);
      const B = resolve(t, bg), F = resolve(t, fg, B);
      const ratio = +wcag(F, B).toFixed(2), threshold = THRESHOLDS[kind];
      rows.push({ key: `${theme}/${accent}/${label}`, theme, accent, label, kind, fg: toHex(F), bg: toHex(B), ratio, apca: +apca(F, B).toFixed(1), threshold, pass: ratio >= threshold });
    }
  }
  return rows;
}

export function buildBaseline(rows) {
  const failing = {};
  for (const r of rows.filter(r => !r.pass)) failing[r.key] = { ratio: r.ratio, threshold: r.threshold, fg: r.fg, bg: r.bg };
  return { note: 'Pairs failing WCAG 2 today (COL-14 ratchet). Regenerate only after a deliberate cleanup: npm run gates:update.', source: `tokens/semantic.json ${loadTokens().meta.version}`, thresholds: THRESHOLDS, pairs: PAIRS.length, evaluated: rows.length, failing: Object.keys(failing).length, entries: failing };
}
export function readBaseline() { return fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null; }
export function writeBaseline(rows = computeMatrix()) { fs.writeFileSync(baselinePath, JSON.stringify(buildBaseline(rows), null, 2) + '\n'); return baselinePath; }

/** Compares rows with the baseline. Returns {newFailures, regressions, stale}. */
export function check(rows, baseline) {
  const entries = (baseline && baseline.entries) || {};
  const newFailures = [], regressions = [], seen = new Set();
  for (const r of rows) {
    if (r.pass) continue;
    seen.add(r.key);
    const b = entries[r.key];
    if (!b) newFailures.push(r);
    else if (r.ratio < b.ratio - 0.005) regressions.push({ ...r, baselineRatio: b.ratio });
  }
  const stale = Object.keys(entries).filter(k => !seen.has(k));
  return { newFailures, regressions, stale };
}

export function formatTable(rows, { onlyFailing = false } = {}) {
  const cols = ['theme', 'accent', 'kind', 'label', 'fg', 'bg', 'ratio', 'apca', 'threshold', 'status'];
  const data = rows.filter(r => !onlyFailing || !r.pass).map(r => ({ ...r, status: r.pass ? 'ok' : r.baselineRatio !== undefined ? `WORSE (was ${r.baselineRatio})` : 'FAIL' }));
  const width = Object.fromEntries(cols.map(c => [c, Math.max(c.length, ...data.map(r => String(r[c]).length))]));
  const line = r => cols.map(c => String(r[c]).padEnd(width[c])).join('  ');
  return [line(Object.fromEntries(cols.map(c => [c, c]))), cols.map(c => '-'.repeat(width[c])).join('  '), ...data.map(line)].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = computeMatrix();
  if (process.argv.includes('--write')) { console.log(`Wrote ${writeBaseline(rows)} (${rows.filter(r => !r.pass).length} failing of ${rows.length})`); }
  else { console.log(formatTable(rows, { onlyFailing: process.argv.includes('--failing') })); console.log(`\n${rows.filter(r => !r.pass).length} of ${rows.length} pairs fail.`); }
}
