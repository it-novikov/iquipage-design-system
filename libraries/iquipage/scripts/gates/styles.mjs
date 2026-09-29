/**
 * Raw-value ratchet for src/styles/*.css (SYS-03/04/05/07, TYP-13 partially).
 * Counts declarations that bypass tokens; the baseline records today's counts and
 * the test fails when any metric grows.
 *
 *   node scripts/gates/styles.mjs                 summary per metric and file
 *   node scripts/gates/styles.mjs --list <metric> every occurrence (file:line:col  declaration  [selector])
 *   node scripts/gates/styles.mjs --write         rewrite scripts/gates/styles-baseline.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const baselinePath = path.join(root, 'scripts/gates/styles-baseline.json');
export const stylesDir = path.join(root, 'src/styles');

export const METRICS = {
  'font-size-px': 'font-size (or font shorthand) with a px value instead of a type token',
  'font-size-below-12px': 'font-size below 12px (the «never shrink text for composition» rule)',
  'raw-hex': 'hex colour literals outside tokens.css',
  'radius-raw-px': 'border-radius declarations with raw px values instead of var(--iq-radius-*)',
  'duration-raw': 'non-zero raw ms/s durations in transition/animation instead of var(--iq-motion-*)',
  'z-index-raw': 'z-index with a raw number instead of a layer token',
  'important': '!important',
  'transition-all': 'transition: all',
};

/** Blanks comments and string bodies (keeps length and newlines) so the scanner never trips on them. */
function mask(css) {
  const blank = s => s.replace(/[^\n]/g, ' ');
  return css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m[0] + blank(m.slice(1, -1)) + m[0]);
}
const stripVar = value => value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, 'var()');
/** Value without var(...) bodies and the !important flag, for numeric matching. */
const clean = value => stripVar(value).replace(/\s*!important\s*$/i, '').trim();

/** Yields {prop, value, raw, offset, selector} for every declaration in the innermost blocks. */
function* declarations(css) {
  const masked = mask(css);
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
      if (!prop || prop.startsWith('--')) continue;
      const raw = css.slice(start, start + chunk.length).trim();
      yield { prop, value: chunk.slice(colon + 1).trim(), raw, offset: start + (chunk.length - chunk.trimStart().length), selector };
    }
  }
}

const PX = /(\d*\.?\d+)px\b/;
function fontSizePx({ prop, value }) {
  if (prop === 'font-size') { const m = /^(\d*\.?\d+)px$/.exec(clean(value)); return m ? +m[1] : null; }
  if (prop === 'font') { const m = /(?:^|\s)(\d*\.?\d+)px(?=\/|\s|$)/.exec(clean(value)); return m ? +m[1] : null; }
  return null;
}
const RULES = {
  'font-size-px': d => fontSizePx(d) !== null,
  'font-size-below-12px': d => { const v = fontSizePx(d); return v !== null && v < 12; },
  'raw-hex': d => /(^|[^\w&])#[0-9a-f]{3,8}\b/i.test(d.value.replace(/url\([^)]*\)/gi, '')),
  'radius-raw-px': d => /(^|-)radius$/.test(d.prop) && PX.test(clean(d.value)),
  'duration-raw': d => /^(transition|animation)(-duration|-delay)?$/.test(d.prop) && /(^|[\s,])(?!0+\.?0*m?s\b)\d*\.?\d+m?s\b/.test(clean(d.value)),
  'z-index-raw': d => d.prop === 'z-index' && /^-?\d+$/.test(clean(d.value)),
  'important': d => /!important/i.test(d.value),
  'transition-all': d => (d.prop === 'transition' && /(^|,)\s*all\b/.test(d.value)) || (d.prop === 'transition-property' && /\ball\b/.test(d.value)),
};

export function listFiles() { return fs.readdirSync(stylesDir).filter(f => f.endsWith('.css')).sort(); }

/** @returns {{[metric]: Array<{file,line,col,declaration,selector}>}} */
export function scan(files = listFiles()) {
  const found = Object.fromEntries(Object.keys(METRICS).map(m => [m, []]));
  for (const file of files) {
    const css = fs.readFileSync(path.join(stylesDir, file), 'utf8');
    const lineStarts = [0]; for (let i = 0; i < css.length; i++) if (css[i] === '\n') lineStarts.push(i + 1);
    const position = offset => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; } return { line: lo + 1, col: offset - lineStarts[lo] + 1 }; };
    for (const d of declarations(css)) for (const [metric, rule] of Object.entries(RULES)) {
      if (rule(d)) found[metric].push({ file, ...position(d.offset), declaration: d.raw.length > 90 ? d.raw.slice(0, 87) + '…' : d.raw, selector: d.selector.length > 70 ? d.selector.slice(0, 67) + '…' : d.selector });
    }
  }
  return found;
}

export function summarize(found) {
  const metrics = {};
  for (const [metric, hits] of Object.entries(found)) {
    const files = {};
    for (const h of hits) files[h.file] = (files[h.file] || 0) + 1;
    metrics[metric] = { total: hits.length, files: Object.fromEntries(Object.entries(files).sort()) };
  }
  return metrics;
}
export function buildBaseline(found = scan()) {
  return { note: 'Raw-value counts in src/styles today (SYS-03/04/05/07 ratchet). Counts may only shrink; regenerate after a deliberate cleanup: npm run gates:update.', metrics: summarize(found) };
}
export function readBaseline() { return fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null; }
export function writeBaseline(found = scan()) { fs.writeFileSync(baselinePath, JSON.stringify(buildBaseline(found), null, 2) + '\n'); return baselinePath; }

/** @returns {Array<{metric,total,baseline,grownFiles:string[],hits:[]}>} metrics whose count exceeds the baseline. */
export function check(found, baseline) {
  const grown = [];
  const current = summarize(found);
  for (const metric of Object.keys(METRICS)) {
    const b = baseline.metrics[metric];
    if (!b) { grown.push({ metric, total: current[metric].total, baseline: null, grownFiles: Object.keys(current[metric].files), hits: found[metric] }); continue; }
    if (current[metric].total <= b.total) continue;
    const grownFiles = Object.keys(current[metric].files).filter(f => current[metric].files[f] > (b.files[f] || 0));
    grown.push({ metric, total: current[metric].total, baseline: b.total, grownFiles, hits: found[metric].filter(h => grownFiles.includes(h.file)) });
  }
  return grown;
}

export const formatHit = h => `${h.file}:${h.line}:${h.col}  ${h.declaration}${h.selector ? `   [${h.selector}]` : ''}`;
export function formatGrowth(grown, limit = 60) {
  return grown.map(g => {
    const head = `${g.metric}: ${g.total} > baseline ${g.baseline ?? '(none)'} — ${METRICS[g.metric]}\n  files that grew: ${g.grownFiles.join(', ') || '-'}`;
    const lines = g.hits.slice(0, limit).map(h => '  ' + formatHit(h));
    if (g.hits.length > limit) lines.push(`  … and ${g.hits.length - limit} more (node scripts/gates/styles.mjs --list ${g.metric})`);
    return [head, ...lines].join('\n');
  }).join('\n\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = scan();
  const list = process.argv.indexOf('--list');
  if (process.argv.includes('--write')) console.log(`Wrote ${writeBaseline(found)}`);
  else if (list > -1) { const metric = process.argv[list + 1]; if (!found[metric]) throw new Error(`unknown metric ${metric}; one of ${Object.keys(METRICS).join(', ')}`); console.log(found[metric].map(formatHit).join('\n')); console.log(`\n${found[metric].length} × ${metric}`); }
  else { const s = summarize(found); for (const [m, v] of Object.entries(s)) console.log(`${m.padEnd(22)} ${String(v.total).padStart(5)}   ${Object.entries(v.files).map(([f, n]) => `${f.replace('.css', '')}=${n}`).join(' ')}`); }
}
