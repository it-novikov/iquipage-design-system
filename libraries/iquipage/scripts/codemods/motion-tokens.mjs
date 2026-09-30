/**
 * Motion codemod (wave 1, MOT-01/03/04/07/09/10/12/13/14/17, SYS-04).
 *
 * Replayable and idempotent: the integrator re-runs it after merging the colour and typography
 * streams, so every change it makes to src/styles/*.css lives here and nowhere else.
 *
 *   node scripts/codemods/motion-tokens.mjs           apply and print counts
 *   node scripts/codemods/motion-tokens.mjs --check   exit 1 when a run would still change something
 *
 * What it does:
 *   1. Removes the blanket reduced-motion resets (`*{animation:none!important…}`, `*{animation-duration:.01ms!important…}`)
 *      from foundation.css and settings.css. One strategy remains: both `@media (prefers-reduced-motion: reduce)` and
 *      `:root[data-motion=reduced]` zero the motion tokens (generated into src/styles/motion.css from tokens/semantic.json).
 *   2. Rewrites every raw `transition`/`animation` duration in src/styles to the nearest motion token and every raw
 *      easing (`ease`, `ease-in-out`, `cubic-bezier(...)`) to `var(--iq-ease*)`.
 *   3. Targeted fixes: progress bar animates transform instead of width; switch knob pseudo-element; hover lift only for
 *      primary/secondary buttons; `.iq-reveal`/`.iq-loading` fill backwards; skeleton breathes three times then rests
 *      faint; discussion arrival uses the layout token; whiteboard `will-change` only while gesturing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesDir = path.join(root, 'src/styles');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'tokens/semantic.json'), 'utf8')).base;
const check = process.argv.includes('--check');

const counts = {};
const bump = (key, n = 1) => { counts[key] = (counts[key] || 0) + n; };

// ------------------------------------------------------------------------------------------------
// Duration and easing mapping
// ------------------------------------------------------------------------------------------------
const parseMs = value => { const n = parseFloat(value); return value.endsWith('ms') ? n : n * 1000; };
const SCENE_MS = parseMs(tokens['motion-scene']);

/** Raw milliseconds → token expression. Ranges, not nearest-neighbour: colour and hover feedback (≤150) is `fast`,
 *  controls (≤230) `standard`, panels (<300) `enter`, layout moves (≤500) `layout`, indicators and presentation `scene`. */
export function durationToken(ms) {
  if (ms === 0) return null;
  if (ms <= 10) return 'var(--iq-motion-instant)';
  if (ms <= 150) return 'var(--iq-motion-fast)';
  if (ms <= 230) return 'var(--iq-motion-standard)';
  if (ms < 300) return 'var(--iq-motion-enter)';
  if (ms <= 500) return 'var(--iq-motion-layout)';
  if (ms <= SCENE_MS * 1.25) return 'var(--iq-motion-scene)';
  return `calc(${Math.max(2, Math.round(ms / SCENE_MS))} * var(--iq-motion-scene))`;
}

const bezier = s => s.replace(/^cubic-bezier\(|\)$/g, '').split(',').map(Number);
const CURVES = { ease: bezier(tokens.ease), 'ease-spring': bezier(tokens['ease-spring']), 'ease-out': bezier(tokens['ease-out']) };
const KEYWORDS = { ease: 'ease', 'ease-out': 'ease', 'ease-in-out': 'ease', 'ease-in': 'ease-out' };
/** Raw easing → token expression, or null for linear/steps (not curves to tokenise). */
export function easingToken(value) {
  const v = value.trim().toLowerCase();
  if (KEYWORDS[v]) return `var(--iq-${KEYWORDS[v]})`;
  if (!/^cubic-bezier\(/.test(v)) return null;
  const p = bezier(v.replace(/\s+/g, ''));
  if (p.length !== 4 || p.some(n => !Number.isFinite(n))) return null;
  let best = null, bestD = Infinity;
  for (const [name, q] of Object.entries(CURVES)) { const d = Math.hypot(...p.map((n, i) => n - q[i])); if (d < bestD) { bestD = d; best = name; } }
  return `var(--iq-${best})`;
}

// ------------------------------------------------------------------------------------------------
// CSS declaration walker (same masking approach as scripts/gates/styles.mjs)
// ------------------------------------------------------------------------------------------------
function mask(css) {
  const blank = s => s.replace(/[^\n]/g, ' ');
  return css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m[0] + blank(m.slice(1, -1)) + m[0]);
}
function splitTop(value, sep) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (!depth && (sep === ',' ? c === ',' : /\s/.test(c))) { if (sep === ',' || i > start) out.push(value.slice(start, i)); start = i + 1; }
  }
  out.push(value.slice(start));
  return sep === ',' ? out : out.filter(Boolean);
}
const TIME = /^\d*\.?\d+(ms|s)$/i;
const isZero = t => parseFloat(t) === 0;

/** Rewrites one shorthand segment ("opacity .15s ease 20ms"). Order in the shorthand: first time = duration, second = delay. */
function rewriteSegment(segment, prop, selector) {
  const words = splitTop(segment.trim(), ' ');
  let times = 0;
  return words.map(w => {
    if (/^(var\(--iq-(motion|loading)-|calc\()/.test(w)) { times++; return w; } // already a token: still occupies the duration/delay slot
    if (TIME.test(w)) {
      const position = times++;
      if (isZero(w)) return w;
      if (position === 1 || /-delay$/.test(prop)) {
        // A delay that gates visibility is not motion: it must survive reduced motion.
        if (/\.iq-loading\b/.test(selector) && parseMs(w) === parseMs(tokens['loading-delay'])) { bump('delay→loading-delay'); return 'var(--iq-loading-delay)'; }
      }
      const token = durationToken(parseMs(w));
      if (token) { bump('duration→token'); return token; }
      return w;
    }
    const eased = easingToken(w);
    if (eased) { bump('easing→token'); return eased; }
    return w;
  }).join(' ');
}

function rewriteValue(prop, value, selector) {
  const important = /!important\s*$/i.test(value);
  const body = value.replace(/\s*!important\s*$/i, '');
  let next;
  if (/^(transition|animation)$/.test(prop)) next = splitTop(body, ',').map(seg => rewriteSegment(seg, prop, selector)).join(',');
  else if (/-(duration|delay)$/.test(prop)) next = splitTop(body, ',').map(seg => rewriteSegment(seg.trim(), prop, selector)).join(',');
  else next = splitTop(body, ',').map(seg => easingToken(seg.trim()) || seg.trim()).join(',');
  if (next !== body && /-timing-function$/.test(prop)) bump('easing→token');
  return next + (important ? '!important' : '');
}

/** Tokenises every transition/animation declaration in a stylesheet. */
export function tokeniseDurations(css) {
  const masked = mask(css);
  const edits = [];
  const re = /\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(masked))) {
    const bodyStart = m.index + 1;
    const before = masked.slice(0, m.index);
    const selector = before.slice(Math.max(before.lastIndexOf('{'), before.lastIndexOf('}'), before.lastIndexOf(';')) + 1).replace(/\s+/g, ' ').trim();
    let pos = 0;
    for (const chunk of m[1].split(';')) {
      const start = bodyStart + pos; pos += chunk.length + 1;
      const colon = chunk.indexOf(':');
      if (colon < 0) continue;
      const prop = chunk.slice(0, colon).trim().toLowerCase();
      if (!/^(transition|animation)(-duration|-delay|-timing-function)?$/.test(prop)) continue;
      const rawValue = css.slice(start + colon + 1, start + chunk.length);
      const lead = rawValue.match(/^\s*/)[0], trail = rawValue.match(/\s*$/)[0];
      const value = rawValue.trim();
      const next = rewriteValue(prop, value, selector);
      if (next !== value) edits.push([start + colon + 1, start + chunk.length, lead + next + trail]);
    }
  }
  let out = css;
  for (const [s, e, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + text + out.slice(e);
  return out;
}

// ------------------------------------------------------------------------------------------------
// Targeted rewrites (each one is a no-op once applied)
// ------------------------------------------------------------------------------------------------
const replaceAll = (css, key, from, to) => {
  const parts = css.split(from);
  if (parts.length > 1) bump(key, parts.length - 1);
  return parts.join(to);
};
const replaceRe = (css, key, re, to) => { const n = (css.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length; if (n) bump(key, n); return css.replace(re, to); };

function removeBlanketReduced(css) {
  // `*,*::before,*::after{…animation…}` inside any block, then media blocks left empty by that removal.
  css = replaceRe(css, 'blanket-star-removed', /\*,\*::before,\*::after\{[^{}]*(?:animation|transition)[^{}]*\}/g, '');
  css = replaceRe(css, 'blanket-data-motion-removed', /(?::root)?\[data-motion=reduced\] \*(?:, ?(?::root)?\[data-motion=reduced\] \*::(?:before|after))*\{[^{}]*\}\n?/g, '');
  css = replaceRe(css, 'empty-media-removed', /@media\s*\([^)]*\)\s*\{\s*\}/g, '');
  // The token zeroing now lives in motion.css (generated below).
  css = replaceRe(css, 'root-motion-zero-moved', /^:root\[data-motion=reduced\]\{--iq-motion-[^}]*\}\n?/gm, '');
  return css;
}

function foundationFixes(css) {
  // MOT-14: the switch knob is ::before; the spring transition was declared on a non-existent ::after.
  css = replaceRe(css, 'switch-pseudo-fixed', /\.iq-switch-track,\.iq-switch-track::after\{transition:[^}]*\}/,
    '.iq-switch-track{transition:background-color var(--iq-motion-standard) var(--iq-ease),box-shadow var(--iq-motion-standard) var(--iq-ease)}.iq-switch-track::before{transition:transform var(--iq-motion-standard) var(--iq-ease-spring)}');
  // MOT-12: hover lift only for primary/secondary buttons, never link/row-title/toast buttons.
  css = replaceAll(css, 'hover-lift-scoped', '.iq-btn:not(:disabled):not([aria-busy=true]):hover{transform:translateY(-1px)}', '.iq-btn:is(.primary,.secondary):not(:disabled):not([aria-busy=true]):hover{transform:translateY(-1px)}');
  // MOT-04: progress animates transform. `--progress` (a percentage) stays the API; the bar is full width and slides.
  css = replaceRe(css, 'progress-transform', /\.iq-progress span\{display:block;background:var\(--iq-accent\);width:var\(--progress,0%\);height:100%;transition:width[^}]*\}/,
    '.iq-progress span{display:block;background:var(--iq-accent);width:100%;height:100%;transform:translateX(calc(var(--progress,0%) - 100%));transition:transform var(--iq-motion-layout) var(--iq-ease-spring)}');
  css = replaceRe(css, 'progress-duplicate-removed', /\.iq-progress>span\{transition:width[^}]*\}\n?/, '');
  // MOT-13: fill backwards — the class may stay on the element, the effect must not.
  css = replaceAll(css, 'reveal-fill-backwards', '.iq-reveal{animation:iq-reveal var(--iq-motion-standard) var(--iq-ease) both}', '.iq-reveal{animation:iq-reveal var(--iq-motion-standard) var(--iq-ease) backwards}');
  css = replaceRe(css, 'loading-fill-backwards', /(\.iq-loading\{display:grid;gap:var\(--iq-space-3\);animation:iq-loading-appear [^}]*?) both\}/, '$1 backwards}');
  // MOT-01: the reduced override of .iq-loading is redundant once the tokens are zero; the delay token keeps the gate.
  css = replaceAll(css, 'loading-reduced-override-removed', '.iq-loading{animation:iq-loading-appear 1ms linear 180ms both}', '');
  // MOT-07: skeleton breathes three times, then rests faint (forwards) instead of freezing at full opacity.
  css = replaceAll(css, 'skeleton-policy', 'animation:iq-breathe 1.6s ease-in-out 3}', 'animation:iq-breathe calc(2 * var(--iq-motion-scene)) var(--iq-ease) 3 forwards}');
  css = replaceAll(css, 'skeleton-keyframes', '@keyframes iq-breathe{50%{opacity:.5}}', '@keyframes iq-breathe{from,to{opacity:.55}50%{opacity:1}}');
  // MOT-09: a discussion arrival is a working-surface change, not a presentation scene.
  css = replaceAll(css, 'discussion-arrive-layout', 'animation:iq-discussion-arrive var(--iq-motion-scene)', 'animation:iq-discussion-arrive var(--iq-motion-layout)');
  // MOT-08: toast enter/exit symmetrical on the standard token (the JS removal timer reads the same token).
  css = replaceRe(css, 'toast-symmetry', /\.iq-toast\.leaving\{opacity:0;transform:translateY\(6px\);transition:opacity \.?\d[^,}]*,transform [^}]+\}/, '.iq-toast.leaving{opacity:0;transform:translateY(6px);transition:opacity var(--iq-motion-standard) var(--iq-ease),transform var(--iq-motion-standard) var(--iq-ease)}');
  return css;
}

function whiteboardFixes(css) {
  // MOT-17: a permanent compositor layer for the whole world costs memory; promote only during a gesture.
  css = replaceAll(css, 'wb-will-change-scoped', '.wb-world{position:absolute;inset:0 auto auto 0;width:0;height:0;transform-origin:0 0;will-change:transform}',
    '.wb-world{position:absolute;inset:0 auto auto 0;width:0;height:0;transform-origin:0 0}.wb-stage.is-interacting .wb-world{will-change:transform}');
  // Blur over a panning canvas is recomputed every frame; the chip is opaque instead.
  css = replaceAll(css, 'wb-chip-no-backdrop', 'background:color-mix(in srgb,var(--iq-raised) 92%,transparent);backdrop-filter:blur(8px);', 'background:var(--iq-raised);');
  return css;
}

// ------------------------------------------------------------------------------------------------
// motion.css — generated from tokens/semantic.json
// ------------------------------------------------------------------------------------------------
export function motionCSS() {
  const zero = Object.keys(tokens).filter(k => k.startsWith('motion-')).map(k => `--iq-${k}:0ms`).join(';');
  return `/* Generated by scripts/codemods/motion-tokens.mjs from tokens/semantic.json — do not edit by hand (npm run build keeps it in sync).
   One reduced-motion strategy (MOT-01/MOT-10): the OS preference and the product setting both zero the motion tokens, so every
   component transition and animation collapses to 0 ms while transitionend/animationend still fire and component reduced-motion
   rules keep working. Delays that gate visibility (--iq-loading-delay) are not motion and stay. */
@media (prefers-reduced-motion: reduce){:root{${zero};scroll-behavior:auto}}
:root[data-motion=reduced]{${zero};scroll-behavior:auto}
/* Theme switch (MOT-05): interaction.withoutTransitions() holds the attribute for one painted frame so a theme change lands at once. */
:root[data-theme-switching],:root[data-theme-switching] *,:root[data-theme-switching] *::before,:root[data-theme-switching] *::after{transition:none!important}
/* Loading (MOT-07): interaction.bindLoading() adds .iq-loading-slow after --iq-loading-slow and reveals the note. */
.iq-loading-note{display:none;margin:0;color:var(--iq-muted)}
.iq-loading.iq-loading-slow>.iq-loading-note{display:block}
`;
}

// ------------------------------------------------------------------------------------------------
// Run
// ------------------------------------------------------------------------------------------------
export function run({ write = !check } = {}) {
  const changed = [];
  for (const file of fs.readdirSync(stylesDir).filter(f => f.endsWith('.css') && f !== 'motion.css').sort()) {
    const full = path.join(stylesDir, file);
    const before = fs.readFileSync(full, 'utf8');
    let css = before;
    if (file === 'foundation.css' || file === 'settings.css') css = removeBlanketReduced(css);
    if (file === 'foundation.css') css = foundationFixes(css);
    if (file === 'whiteboard.css') css = whiteboardFixes(css);
    css = tokeniseDurations(css);
    if (css !== before) { changed.push(file); if (write) fs.writeFileSync(full, css); }
  }
  const motionPath = path.join(stylesDir, 'motion.css');
  const generated = motionCSS();
  if (!fs.existsSync(motionPath) || fs.readFileSync(motionPath, 'utf8') !== generated) { changed.push('motion.css'); if (write) fs.writeFileSync(motionPath, generated); }
  return { changed, counts };
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const { changed, counts } = run();
  const lines = Object.entries(counts).sort().map(([k, n]) => `  ${k.padEnd(34)} ${n}`);
  console.log(`motion-tokens: ${changed.length ? (check ? 'would change ' : 'changed ') + changed.join(', ') : 'nothing to do'}`);
  if (lines.length) console.log(lines.join('\n'));
  if (check && changed.length) process.exit(1);
}
