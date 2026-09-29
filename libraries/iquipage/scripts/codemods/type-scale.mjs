/**
 * Type-scale codemod for src/styles/*.css (wave 1 «Основания», TYP-03..10, TYP-16, TYP-19).
 *
 * Every change to the stylesheets in the typography stream is produced by this script so the
 * integrator can replay it on top of other streams' CSS. It is idempotent: a second run reports
 * zero changes. Rules, in the order they are applied to each declaration:
 *
 *   font-size / font shorthand (TYP-03, TYP-04)
 *     px on a scale step            → var(--iq-type-<role>-size) (the scale is read from tokens/semantic.json)
 *     px below 12 on a component    → var(--iq-type-meta-size), the 12px floor; catalog selectors
 *                                     (.home- .landing- .proof- .narrative- .sample- .demo- .story-
 *                                     .catalog- .edition- .feature- .cover-) keep their size as a rem
 *                                     literal, except the eyebrow/kicker classes (TYP-16)
 *     any other px                  → rem literal at a 16px root (15px → .9375rem)
 *   @media (max-width…) (TYP-05)    a font-size smaller than the same selector's base size is removed;
 *                                   a font shorthand that shrinks gets the base size instead
 *   line-height (TYP-07)            below the Cyrillic minimum on display/h1/h2/h3 rules → the role's
 *                                   lineHeight token (1.1 / 1.15 / 1.2 / 1.3)
 *   letter-spacing (TYP-08)         literals → the nearest --iq-tracking-* token; kickers → tracking-caps
 *   font-weight (TYP-10)            750 → 700 (InterVariable ships 400–700; 450/550/650 stay: the
 *                                   variable font renders them)
 *   -webkit-line-clamp (TYP-19)     the standard line-clamp is declared next to it
 *   overflow-wrap (TYP-09)          anywhere → break-word on prose selectors (documents, paragraphs,
 *                                   messages); table cells, titles, code and tags keep anywhere
 *   kickers (TYP-16)                .sample-overline, .iq-pro-eyebrow, .wb-library-eyebrow,
 *                                   .narrative-toolbar>span, .eyebrow, .wb-panel-kicker,
 *                                   .iq-work-header-eyebrow, .landing-manifest>span, .narrative-card>.row
 *                                   get text-transform:uppercase and tracking-caps; sources hold sentence case
 *
 *   node scripts/codemods/type-scale.mjs            rewrite src/styles and print the summary
 *   node scripts/codemods/type-scale.mjs --dry      summary only
 *   node scripts/codemods/type-scale.mjs --root DIR another library root (tests run it on a copy)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Build order of the sheets: later files win the cascade, so base sizes are collected in this order. */
const ORDER = ['foundation.css', 'whiteboard.css', 'everyday.css', 'whiteboard-workshop.css', 'work-list.css', 'auth-dialog.css', 'auth-screen.css', 'settings.css', 'text.css', 'focus.css', 'touch.css', 'everyday-demo.css'];
export const FLOOR_PX = 12;
export const FLOOR_TOKEN = 'meta';
/** Roles in the order that wins when two roles share a size (12px is caption, not meta). */
const ROLE_PRIORITY = ['body', 'interface', 'label', 'caption', 'title', 'lead', 'heading3', 'heading2', 'heading1', 'display', 'meta'];
export const CATALOG = /(^|[\s>+~(,])\.(home|landing|proof|narrative|sample|demo|story|catalog|edition|feature|cover)-/;
export const EYEBROWS = ['.sample-overline', '.iq-pro-eyebrow', '.wb-library-eyebrow', '.narrative-toolbar>span', '.eyebrow', '.wb-panel-kicker', '.iq-work-header-eyebrow', '.landing-manifest>span', '.narrative-card>.row'];
/** Selectors whose text is prose: long words may break at the end of a line, but never count towards min-content. */
const PROSE = new Set(['.md-document', '.md-preview', '.comment-body', '.iq-auth-content', '.iq-pro-subtitle', '.iq-pro-error', '.iq-pro-draft small', '.iq-remote-status']);
const LINE_HEIGHT_MIN = { display: 1.1, heading1: 1.15, heading2: 1.2, heading3: 1.3 };
/** Cyrillic-safe tracking: values at or beyond a step snap to it, small negatives go to body (0). */
const TRACKING = [[-0.026, 'display'], [-0.021, 'h1'], [-0.015, 'h2'], [-0.010, 'h3']];

export const RULES = {
  'font-size → token': 'px equal to a scale step becomes var(--iq-type-*-size)',
  'font-size → rem': 'px off the scale becomes a rem literal',
  'font-size < 12px → meta floor': 'component text below 12px is raised to var(--iq-type-meta-size)',
  'media shrink removed': 'font-size inside @media (max-width) smaller than the base size is dropped',
  'media shrink → base size': 'font shorthand inside @media (max-width) keeps the base size',
  'line-height → token': 'heading line-height below the Cyrillic minimum uses the role token',
  'letter-spacing → token': 'tracking literal replaced by the nearest --iq-tracking-* token',
  'font-weight 750 → 700': 'weight beyond the shipped axis',
  'line-clamp added': 'standard line-clamp next to -webkit-line-clamp',
  'overflow-wrap → break-word': 'prose selectors no longer break words anywhere',
  'kicker uppercase added': 'text-transform:uppercase on an eyebrow/kicker rule',
  'kicker tracking added': 'letter-spacing:var(--iq-tracking-caps) on an eyebrow/kicker rule',
};

/** Blanks comments and string bodies (keeps length and newlines) so the parser never trips on them. */
function mask(css) {
  const blank = s => s.replace(/[^\n]/g, ' ');
  return css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m[0] + blank(m.slice(1, -1)) + m[0]);
}
const normalizeSelector = s => s.replace(/\s+/g, ' ').replace(/\s*([>,+~])\s*/g, '$1').trim();
const parts = selector => selector.split(',').map(s => s.trim()).filter(Boolean);
const lastCompound = part => part.split(/[\s>+~]+/).filter(Boolean).pop() || part;
export const isCatalog = selector => parts(selector).some(p => CATALOG.test(p));
export const isEyebrow = selector => parts(selector).some(p => EYEBROWS.some(e => p === e || p.endsWith(' ' + e) || p.endsWith('>' + e)));
const isEyebrowBase = selector => parts(selector).every(p => EYEBROWS.includes(p));
const isProse = selector => parts(selector).every(p => PROSE.has(p) || /(^|[\s>])p(\.[\w-]+)*$/.test(p));

export function remLiteral(px) {
  const s = String(+(px / 16).toFixed(5));
  return (s.startsWith('0.') ? s.slice(1) : s) + 'rem';
}
export function trackingToken(em, eyebrow) {
  if (em > 0) return (eyebrow || em >= 0.03) ? 'caps' : 'body';
  for (const [limit, role] of TRACKING) if (em <= limit) return role;
  return 'body';
}

/** Leaf style rules of one sheet: {selector, start, end, narrow} with the body at [start, end). */
function* rules(css) {
  const masked = mask(css);
  const stack = [];
  let preludeStart = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{') {
      const prelude = masked.slice(preludeStart, i).trim();
      if (stack.length) stack[stack.length - 1].hasChild = true;
      stack.push({ prelude, start: i + 1, hasChild: false });
      preludeStart = i + 1;
    } else if (c === '}') {
      const block = stack.pop();
      preludeStart = i + 1;
      if (!block || block.hasChild || block.prelude.startsWith('@')) continue;
      if (stack.some(b => /^@(keyframes|font-face|-webkit-keyframes)/.test(b.prelude))) continue;
      const narrow = stack.some(b => /^@media\b/.test(b.prelude) && /max-width/.test(b.prelude));
      yield { selector: normalizeSelector(block.prelude), start: block.start, end: i, narrow };
    } else if (c === ';' && (!stack.length || stack[stack.length - 1].hasChild)) preludeStart = i + 1;
  }
}

/** Declaration chunks of a body, preserving the original text of each. */
function chunks(body) {
  const out = [];
  let pos = 0;
  for (const raw of mask(body).split(';')) {
    const text = body.slice(pos, pos + raw.length);
    pos += raw.length + 1;
    const colon = raw.indexOf(':');
    const prop = colon < 0 ? '' : raw.slice(0, colon).trim().toLowerCase();
    out.push({ text, prop, colon });
  }
  return out;
}
const value = chunk => chunk.text.slice(chunk.colon + 1).trim();
const withValue = (chunk, next) => {
  const head = chunk.text.slice(0, chunk.colon + 1);
  const tail = chunk.text.slice(chunk.colon + 1);
  const lead = tail.match(/^\s*/)[0], trail = tail.match(/\s*$/)[0];
  return head + lead + next + trail;
};
const splitImportant = v => { const m = /\s*!important\s*$/i.exec(v); return m ? [v.slice(0, m.index), v.slice(m.index)] : [v, '']; };

export function createScale(tokens) {
  const base = tokens.base;
  const toPx = v => { const m = /^(\d*\.?\d+)(px|rem)$/.exec(v); return m ? (m[2] === 'px' ? +m[1] : +m[1] * 16) : null; };
  const roles = {};
  for (const [k, v] of Object.entries(base)) { const m = /^type-(\w+)-size$/.exec(k); if (m) roles[m[1]] = toPx(v); }
  const pxToRole = {};
  for (const role of ROLE_PRIORITY) if (roles[role] !== null && roles[role] !== undefined && !(roles[role] in pxToRole)) pxToRole[roles[role]] = role;
  return { roles, pxToRole, tokenPx: role => roles[role] ?? null };
}

/** {px, expr} of a font-size value, or null when it cannot be resolved (em, %, keywords). */
function resolveSize(v, scale) {
  let m;
  if ((m = /^(\d*\.?\d+)px$/.exec(v))) return { px: +m[1], expr: v, literal: true };
  if ((m = /^(\d*\.?\d+)rem$/.exec(v))) return { px: +m[1] * 16, expr: v };
  if ((m = /^var\(--iq-type-(\w+)-size\)$/.exec(v))) { const px = scale.tokenPx(m[1]); return px === null ? null : { px, expr: v }; }
  if ((m = /^clamp\(\s*(\d*\.?\d+)px\s*,/.exec(v))) return { px: +m[1], expr: v, clamp: true };
  return null;
}
/** The rewritten expression for a px font size on this rule and the size it resolves to. */
function mapPx(px, ctx, scale, count) {
  if (px < FLOOR_PX && (!ctx.catalog || ctx.eyebrow)) { count('font-size < 12px → meta floor'); return { px: scale.tokenPx(FLOOR_TOKEN), expr: `var(--iq-type-${FLOOR_TOKEN}-size)` }; }
  const role = scale.pxToRole[px];
  if (role) { count('font-size → token'); return { px, expr: `var(--iq-type-${role}-size)` }; }
  count('font-size → rem');
  return { px, expr: remLiteral(px) };
}
function headingRole(selector) {
  let best = null;
  for (const p of parts(selector)) {
    const role = /\.type-display\b/.test(p) ? 'display' : /\bh1\b/.test(p) ? 'heading1' : /\bh2\b|\.type-heading\b/.test(p) ? 'heading2' : /\bh3\b/.test(p) ? 'heading3' : null;
    if (role && (!best || LINE_HEIGHT_MIN[role] > LINE_HEIGHT_MIN[best])) best = role;
  }
  return best;
}
function lineHeightToken(lh, role, count) {
  if (!role || !(lh < LINE_HEIGHT_MIN[role])) return null;
  count('line-height → token');
  return `var(--iq-type-${role}-lineHeight)`;
}

const SIZE_IN_FONT = /(^|\s)((?:\d*\.?\d+)(?:px|rem)|var\(--iq-type-\w+-size\)|clamp\([^)]*\))(?=\/|\s|$)/;
const LH_IN_FONT = /\/(\d*\.?\d+)(?=\s|$)/;

/**
 * Rewrites one sheet. `bases` maps a selector to its base {px, expr}; in collect mode the map is
 * filled from non-narrow rules and nothing is written.
 */
function transform(css, scale, bases, collect, count) {
  const edits = [];
  for (const rule of rules(css)) {
    if (collect && rule.narrow) continue;
    const ctx = { catalog: isCatalog(rule.selector), eyebrow: isEyebrow(rule.selector), eyebrowBase: isEyebrowBase(rule.selector), prose: isProse(rule.selector), role: headingRole(rule.selector) };
    const body = css.slice(rule.start, rule.end);
    const list = chunks(body);
    const hasProp = p => list.some(c => c.prop === p);
    const base = rule.narrow ? lookupBase(rule.selector, bases) : null;
    let changed = false;
    const out = [];
    for (const chunk of list) {
      let text = chunk.text;
      if (chunk.colon >= 0) {
        const [v, important] = splitImportant(value(chunk));
        const p = chunk.prop;
        if (p === 'font-size') {
          const resolved = resolveSize(v, scale);
          if (resolved) {
            let next = resolved;
            if (resolved.literal) next = mapPx(resolved.px, ctx, scale, collect ? () => {} : count);
            if (collect) { setBase(rule.selector, next, bases); }
            else if (rule.narrow && base && !next.clamp && next.px < base.px) { count('media shrink removed'); changed = true; continue; }
            else if (next.expr !== v) text = withValue(chunk, next.expr + important);
          }
        } else if (p === 'font' && !/^(inherit|initial|unset|revert)$/.test(v)) {
          let next = v;
          const sm = SIZE_IN_FONT.exec(next);
          if (sm) {
            const resolved = resolveSize(sm[2], scale);
            if (resolved) {
              let size = resolved;
              if (resolved.literal) size = mapPx(resolved.px, ctx, scale, collect ? () => {} : count);
              if (collect) setBase(rule.selector, size, bases);
              else if (rule.narrow && base && !size.clamp && size.px < base.px) { count('media shrink → base size'); size = base; }
              if (size.expr !== sm[2]) next = next.slice(0, sm.index + sm[1].length) + size.expr + next.slice(sm.index + sm[0].length);
            }
          }
          if (!collect) {
            const lm = LH_IN_FONT.exec(next);
            const lh = lm && lineHeightToken(+lm[1], ctx.role, count);
            if (lh) next = next.slice(0, lm.index + 1) + lh + next.slice(lm.index + lm[0].length);
            if (/^750(\s|$)/.test(next)) { count('font-weight 750 → 700'); next = '700' + next.slice(3); }
          }
          if (next !== v) text = withValue(chunk, next + important);
        } else if (collect) {
          // Only sizes matter in collect mode.
        } else if (p === 'line-height') {
          const m = /^(\d*\.?\d+)$/.exec(v);
          const lh = m && lineHeightToken(+m[1], ctx.role, count);
          if (lh) text = withValue(chunk, lh + important);
        } else if (p === 'letter-spacing') {
          const m = /^(-?\d*\.?\d+)(em)?$/.exec(v);
          if (m && (m[2] || +m[1] === 0)) { count('letter-spacing → token'); text = withValue(chunk, `var(--iq-tracking-${trackingToken(+m[1], ctx.eyebrow)})` + important); }
        } else if (p === 'font-weight') {
          if (v === '750') { count('font-weight 750 → 700'); text = withValue(chunk, '700' + important); }
        } else if (p === '-webkit-line-clamp') {
          if (!hasProp('line-clamp')) { count('line-clamp added'); text = chunk.text + ';line-clamp:' + v + important; }
        } else if (p === 'overflow-wrap') {
          if (v === 'anywhere' && ctx.prose) { count('overflow-wrap → break-word'); text = withValue(chunk, 'break-word' + important); }
        }
      }
      if (text !== chunk.text) changed = true;
      out.push(text);
    }
    if (!collect && !rule.narrow && ctx.eyebrowBase) {
      const extra = [];
      if (!hasProp('text-transform')) { count('kicker uppercase added'); extra.push('text-transform:uppercase'); }
      if (!hasProp('letter-spacing')) { count('kicker tracking added'); extra.push('letter-spacing:var(--iq-tracking-caps)'); }
      if (extra.length) {
        changed = true;
        const trailing = out.length && out[out.length - 1].trim() === '' ? out.pop() : null;
        out.push(...extra);
        if (trailing !== null) out.push(trailing);
      }
    }
    if (changed) edits.push({ start: rule.start, end: rule.end, text: out.join(';') });
  }
  if (collect || !edits.length) return css;
  let result = css;
  for (const e of edits.reverse()) result = result.slice(0, e.start) + e.text + result.slice(e.end);
  return result;
}
function setBase(selector, size, bases) {
  bases.set(selector, size);
  for (const p of parts(selector)) bases.set(p, size);
}
/** The base size of a selector inside a narrow media query: exact, then per part, then the part's last compound. */
function lookupBase(selector, bases) {
  if (bases.has(selector)) return bases.get(selector);
  const found = parts(selector).map(p => bases.get(p) || bases.get(lastCompound(p))).filter(Boolean);
  if (!found.length) return null;
  return found.reduce((a, b) => (b.px < a.px ? b : a));
}

export function listFiles(root) {
  const dir = path.join(root, 'src/styles');
  return fs.readdirSync(dir).filter(f => f.endsWith('.css')).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

/** @returns {{counts:{[rule]:number}, changed:string[], total:number, files:number}} */
export function run({ root = defaultRoot, write = true } = {}) {
  const tokens = JSON.parse(fs.readFileSync(path.join(root, 'tokens/semantic.json'), 'utf8'));
  const scale = createScale(tokens);
  if (scale.tokenPx(FLOOR_TOKEN) !== FLOOR_PX) throw new Error(`--iq-type-${FLOOR_TOKEN}-size must be ${FLOOR_PX}px (${remLiteral(FLOOR_PX)}); tokens/semantic.json says ${tokens.base[`type-${FLOOR_TOKEN}-size`]}`);
  const counts = Object.fromEntries(Object.keys(RULES).map(r => [r, 0]));
  const count = rule => { counts[rule]++; };
  const files = listFiles(root);
  const sources = new Map(files.map(f => [f, fs.readFileSync(path.join(root, 'src/styles', f), 'utf8')]));
  const bases = new Map();
  for (const f of files) transform(sources.get(f), scale, bases, true, count);
  const changed = [];
  for (const f of files) {
    const next = transform(sources.get(f), scale, bases, false, count);
    if (next !== sources.get(f)) { changed.push(f); if (write) fs.writeFileSync(path.join(root, 'src/styles', f), next); }
  }
  return { counts, changed, total: Object.values(counts).reduce((a, b) => a + b, 0), files: files.length };
}

export function format(result) {
  const lines = Object.entries(result.counts).map(([rule, n]) => `${String(n).padStart(5)}  ${rule}`);
  lines.push(`${String(result.total).padStart(5)}  changes in ${result.changed.length} of ${result.files} sheets${result.changed.length ? ': ' + result.changed.join(', ') : ''}`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag > -1 ? path.resolve(process.argv[rootFlag + 1]) : defaultRoot;
  const result = run({ root, write: !process.argv.includes('--dry') });
  console.log(`type-scale codemod${process.argv.includes('--dry') ? ' (dry run)' : ''} on ${root}\n${format(result)}`);
}
