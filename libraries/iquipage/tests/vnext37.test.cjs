'use strict';
/** Contracts for 0.6.0-vnext.37: Markdown text reads at the same size and line height while editing and while viewing.
 *  The editor's preview (.md-preview) and its source (.md-input) resolve through the shipped dist/iquipage.css with a
 *  small cascade resolver (selector matching, specificity, source order, @media by viewport width, inheritance, var()),
 *  so a later sheet that sets one of them alone fails here. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};

// ---------- parsing ----------
/** Splits at a top-level separator, outside (), [] and strings. */
function split(text, test) {
  const parts = []; let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (!depth && test(c, i)) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
const list = text => split(text, c => c === ',').map(s => s.trim()).filter(Boolean);

/** Media conditions by viewport width; any other feature is false (reduced motion, hover: none, print, dark). */
function mediaMatches(query, width) {
  return list(query).some(q => q.split(/\s+and\s+/).every(part => {
    part = part.trim();
    if (/^(screen|all|only screen)$/.test(part)) return true;
    const m = /^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/.exec(part);
    return m ? (m[1] === 'min' ? width >= +m[2] : width <= +m[2]) : false;
  }));
}

/** Flat list of {selectors, declarations, order} for one viewport width. */
function parseSheet(css, width) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; let order = 0;
  function block(text, active) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < text.length && depth; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) block(body, active && mediaMatches(prelude.slice(6).trim(), width));
      else if (prelude.startsWith('@supports')) block(body, active);
      else if (!prelude.startsWith('@') && active) {
        const declarations = split(body, c => c === ';').map(d => d.trim()).filter(Boolean).map(d => {
          const k = d.indexOf(':'), prop = d.slice(0, k).trim(), raw = d.slice(k + 1).trim();
          return { prop, value: raw.replace(/\s*!important$/, ''), important: /!important$/.test(raw) };
        });
        rules.push({ selectors: list(prelude), declarations, order: order++ });
      }
      i = j;
    }
  }
  block(css, true);
  return rules;
}

// ---------- selectors ----------
const pseudoFalse = /^(hover|focus|focus-visible|focus-within|active|disabled|checked|placeholder-shown|empty|target|visited|link|any-link|invalid|valid|required|open|popover-open|modal|fullscreen|defined|indeterminate|read-only|read-write|has|nth-child|nth-of-type|nth-last-child|first-of-type|last-of-type|only-child|first-child|last-child|host|host-context|state|autofill|user-invalid|scope)$/;
/** Parses a complex selector into [{compound, combinator}] from left to right. */
function complex(selector) {
  const out = []; let current = '', depth = 0, quote = null, pending = null;
  const flush = () => { if (current.trim()) { out.push({ compound: current.trim(), combinator: pending }); pending = null; } current = ''; };
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (quote) { current += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; current += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (!depth && /[\s>+~]/.test(c)) {
      if (current.trim()) flush();
      if (c !== ' ' && c !== '\n' && c !== '\t') pending = c; else pending ??= ' ';
      continue;
    }
    current += c;
  }
  flush();
  out.forEach((p, i) => { if (i === 0) p.combinator = null; else if (p.combinator === null) p.combinator = ' '; });
  return out;
}
function simple(compound) {
  const parts = []; let i = 0;
  while (i < compound.length) {
    const rest = compound.slice(i); let m;
    if ((m = /^\*/.exec(rest))) parts.push({ type: 'any' });
    else if ((m = /^[a-zA-Z][\w-]*/.exec(rest))) parts.push({ type: 'tag', name: m[0].toLowerCase() });
    else if ((m = /^\.((?:[\w-]|\\.)+)/.exec(rest))) parts.push({ type: 'class', name: m[1] });
    else if ((m = /^#((?:[\w-]|\\.)+)/.exec(rest))) parts.push({ type: 'id', name: m[1] });
    else if (rest[0] === '[') {
      const end = rest.indexOf(']'); // attribute values in the sheet never contain ]
      const inner = rest.slice(1, end).trim(); m = [rest.slice(0, end + 1)];
      const a = /^([\w-]+)\s*(?:([~|^$*]?=)\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s\]]+)\s*(i|s)?)?$/.exec(inner);
      parts.push(a ? { type: 'attr', name: a[1], op: a[2], value: a[3]?.replace(/^["']|["']$/g, '') } : { type: 'never' });
    } else if ((m = /^::?([\w-]+)/.exec(rest))) {
      let arg = null, length = m[0].length;
      if (compound[i + length] === '(') {
        let depth = 0, k = i + length;
        for (; k < compound.length; k++) { if (compound[k] === '(') depth++; else if (compound[k] === ')' && !--depth) break; }
        arg = compound.slice(i + length + 1, k); length = k + 1 - i;
      }
      m = [compound.slice(i, i + length)];
      const element = rest.startsWith('::') || /^(before|after|placeholder|first-line|first-letter|marker|selection|backdrop)$/.test(m[0].replace(/^:+/, '').replace(/\(.*$/, '')) && !arg;
      parts.push({ type: element ? 'pseudo-element' : 'pseudo', name: /^::?([\w-]+)/.exec(m[0])[1], arg });
    } else return [{ type: 'never' }];
    i += m[0].length;
  }
  return parts;
}
function matchesCompound(node, compound) {
  return simple(compound).every(p => {
    switch (p.type) {
      case 'any': return true;
      case 'tag': return node.tag === p.name;
      case 'class': return node.classes.has(p.name);
      case 'id': return node.attrs.id === p.name;
      case 'attr': {
        if (!(p.name in node.attrs)) return false;
        const v = String(node.attrs[p.name]);
        if (!p.op) return true;
        if (p.op === '=') return v === p.value;
        if (p.op === '~=') return v.split(/\s+/).includes(p.value);
        if (p.op === '^=') return v.startsWith(p.value);
        if (p.op === '$=') return v.endsWith(p.value);
        if (p.op === '*=') return v.includes(p.value);
        if (p.op === '|=') return v === p.value || v.startsWith(p.value + '-');
        return false;
      }
      case 'pseudo-element': case 'never': return false;
      case 'pseudo':
        if (p.name === 'root') return node.tag === 'html';
        if (p.name === 'lang') { for (let n = node; n; n = n.parent) if (n.attrs.lang) return n.attrs.lang === p.arg.trim(); return false; }
        if (p.name === 'is' || p.name === 'where' || p.name === 'matches') return list(p.arg).some(s => matches(node, s));
        if (p.name === 'not') return !list(p.arg).some(s => matches(node, s));
        if (pseudoFalse.test(p.name)) return false;
        return false;
    }
    return false;
  });
}
function matches(node, selector) {
  const parts = complex(selector);
  const at = (index, n) => {
    if (!n || !matchesCompound(n, parts[index].compound)) return false;
    if (index === 0) return true;
    const combinator = parts[index].combinator;
    if (combinator === '>') return at(index - 1, n.parent);
    if (combinator === ' ') { for (let a = n.parent; a; a = a.parent) if (at(index - 1, a)) return true; return false; }
    return false; // sibling combinators: the modelled trees have no siblings
  };
  return at(parts.length - 1, node);
}
function specificity(selector) {
  let a = 0, b = 0, c = 0;
  for (const { compound } of complex(selector)) for (const p of simple(compound)) {
    if (p.type === 'id') a++;
    else if (p.type === 'class' || p.type === 'attr') b++;
    else if (p.type === 'tag' || p.type === 'pseudo-element') c++;
    else if (p.type === 'pseudo') {
      if (p.name === 'where') continue;
      if (['is', 'not', 'matches', 'has'].includes(p.name)) {
        const max = list(p.arg).map(specificity).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop() || [0, 0, 0];
        a += max[0]; b += max[1]; c += max[2];
      } else b++;
    }
  }
  return [a, b, c];
}

// ---------- cascade ----------
const INHERITED = new Set(['font-size', 'line-height', 'font-weight', 'font-family', 'color']);
/** Expands the font shorthand into the longhands this test reads. */
function longhands(prop, value) {
  if (prop !== 'font') return [[prop, value]];
  if (value === 'inherit') return ['font-size', 'line-height', 'font-weight', 'font-family'].map(p => [p, 'inherit']);
  // Functions are opaque here: var() and calc() may hold spaces and the size/line-height slash.
  const held = [], opaque = value.replace(/(?:var|calc)\((?:[^()]|\([^()]*\))*\)/g, f => `\u0000${held.push(f) - 1}\u0000`);
  const back = text => text?.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]);
  const m = /^(?:(italic|normal)\s+)?(?:(\d{3}|bold|normal)\s+)?(\S+?)(?:\s*\/\s*(\S+))?\s+(.+)$/.exec(opaque);
  if (!m) return [];
  return [['font-size', back(m[3])], ['line-height', back(m[4]) || 'normal'], ['font-weight', m[2] || '400'], ['font-family', back(m[5])]];
}
/** Importance, then specificity, then source order: the later of two equal declarations wins. */
const wins = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
function cascade(rules) {
  return function computed(node) {
    if (node.computed) return node.computed;
    const parent = node.parent ? computed(node.parent) : null;
    const best = new Map();
    for (const rule of rules) for (const selector of rule.selectors) {
      if (!matches(node, selector)) continue;
      const spec = specificity(selector);
      rule.declarations.forEach((d, index) => {
        for (const [prop, value] of longhands(d.prop, d.value)) {
          const key = [d.important ? 1 : 0, ...spec, rule.order, index];
          const prev = best.get(prop);
          if (!prev || wins(key, prev.key)) best.set(prop, { key, value, selector });
        }
      });
    }
    const custom = { ...(parent?.custom || {}) };
    for (const [prop, { value }] of best) if (prop.startsWith('--')) custom[prop] = value;
    const resolve = value => {
      let out = value, guard = 0;
      while (/var\(/.test(out) && guard++ < 20) out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/, (_, name, fallback) => custom[name] ?? fallback ?? '');
      return out.trim();
    };
    const px = (value, base) => {
      const v = resolve(value);
      const ratio = /^calc\(([\d.]+)em\*(\d+)\/(\d+)\)$/.exec(v);
      if (ratio) return +ratio[1] * base * +ratio[2] / +ratio[3];
      if (/rem$/.test(v)) return parseFloat(v) * 16;
      if (/em$/.test(v)) return parseFloat(v) * base;
      if (/px$/.test(v)) return parseFloat(v);
      if (/%$/.test(v)) return parseFloat(v) / 100 * base;
      throw Error(`unresolved length ${value} → ${v}`);
    };
    const own = prop => best.get(prop);
    const result = { custom, rules: {} };
    for (const prop of INHERITED) result.rules[prop] = own(prop)?.selector || '(inherited)';
    const parentSize = parent?.fontSize ?? 16;
    const fs = own('font-size');
    result.fontSize = !fs || resolve(fs.value) === 'inherit' ? parentSize : px(fs.value, parentSize);
    const lh = own('line-height');
    if (!lh || resolve(lh.value) === 'inherit') result.lineHeight = parent ? parent.lineHeight : { normal: true };
    else {
      const v = resolve(lh.value);
      result.lineHeight = v === 'normal' ? { normal: true } : /^[\d.]+$/.test(v) ? { factor: +v } : { px: px(v, result.fontSize) };
    }
    result.lineHeightPx = result.lineHeight.factor != null ? +(result.lineHeight.factor * result.fontSize).toFixed(2) : result.lineHeight.px ?? null;
    const fw = own('font-weight');
    result.fontWeight = fw ? resolve(fw.value) : parent?.fontWeight ?? '400';
    const color = own('color');
    result.color = color ? resolve(color.value) : parent?.color ?? 'initial';
    node.computed = result;
    return result;
  };
}

// ---------- the modelled DOM ----------
function el(tag, { classes = [], attrs = {} } = {}, parent = null) {
  return { tag, classes: new Set(classes), attrs, parent };
}
function editorTree({ density, previewOnBlur = false, previewing = false, around = [] } = {}) {
  const html = el('html', { attrs: { lang: 'ru' } }), body = el('body', {}, html);
  let host = body;
  for (const classes of around) host = el('div', { classes }, host);
  const attrs = { label: 'Описание', variant: 'compact' };
  if (density) attrs.density = density;
  if (previewOnBlur) attrs['preview-on-blur'] = '';
  if (previewing) attrs['data-previewing'] = '';
  const editor = el('iq-markdown-editor', { attrs }, host);
  const shell = el('div', { classes: ['markdown-editor', 'variant-compact'] }, editor);
  const input = el('textarea', { classes: ['md-input'] }, shell);
  const preview = el('article', { classes: ['md-preview', 'md-document'] }, shell);
  const child = (tag, classes = [], parent = preview) => el(tag, { classes }, parent);
  const ul = child('ul');
  return { input, preview, p: child('p'), li: child('li', [], ul), task: child('li', ['md-task'], child('ul')), h2: child('h2'), h3: child('h3'), h4: child('h4'), h5: child('h5') };
}
function viewerTree({ density, classes = [] } = {}) {
  const html = el('html', { attrs: { lang: 'ru' } }), body = el('body', {}, html);
  const viewer = el('iq-markdown-viewer', { classes, attrs: density ? { density } : {} }, body);
  const article = el('article', { classes: ['md-document', 'iq-markdown-viewer-document'] }, viewer);
  return { article, p: el('p', {}, article), h3: el('h3', {}, article) };
}

const css = read('dist/iquipage.css');
const sheets = new Map();
const at = width => { if (!sheets.has(width)) sheets.set(width, cascade(parseSheet(css, width))); return sheets.get(width); };
const metrics = c => ({ size: c.fontSize, lineHeight: c.lineHeightPx });

test('the resolver reads the shipped sheet: the type tokens resolve and a plain viewer keeps the reading measure', () => {
  const computed = at(1440), v = viewerTree();
  assert.deepEqual(metrics(computed(v.p)), { size: 16, lineHeight: 25.6 }, 'iq-markdown-viewer: 16px / 1.6 (text.css .md-document)');
  const message = viewerTree({ classes: ['iq-message-text'] });
  assert.deepEqual(metrics(computed(message.p)), { size: 14, lineHeight: 22.4 }, 'messages and comments are unchanged: 14px / 1.6');
});

const contexts = [
  ['task description: compact, preview on blur', { density: 'compact', previewOnBlur: true, previewing: true }],
  ['compact editor with the preview toggle', { density: 'compact' }],
  ['comfortable editor (template editor)', {}],
  ['comment composer', { around: [['comment-compose']] }],
  ['whiteboard rich sheet', { around: [['wb-rich-sheet']] }]
];
for (const width of [1440, 375]) for (const [name, options] of contexts) {
  test(`${name} at ${width}px: viewing reads at the size and line height of editing`, () => {
    const computed = at(width), t = editorTree(options);
    const source = metrics(computed(t.input));
    assert.ok(source.size >= 14, `source at ${source.size}px`);
    for (const part of ['preview', 'p', 'li', 'task']) assert.deepEqual(metrics(computed(t[part])), source, `${part} in view mode`);
  });
}

test('task description at 1440px: 14px / 24.5px in both modes, template headings at the text size, # one step up', () => {
  const computed = at(1440), t = editorTree({ density: 'compact', previewOnBlur: true, previewing: true });
  assert.deepEqual(metrics(computed(t.input)), { size: 14, lineHeight: 24.5 });
  assert.deepEqual(metrics(computed(t.p)), { size: 14, lineHeight: 24.5 });
  // «## Цель», «## Что сделать», «## Критерии готовности» render as h3 (heading level 2): the text size, bold.
  assert.equal(computed(t.h3).fontSize, 14);
  assert.equal(computed(t.h3).fontWeight, '600');
  assert.equal(computed(t.h2).fontSize, 16, '# is the body step (16px) over 14px text');
  assert.equal(computed(t.h4).fontSize, 14, '### at the text size, muted');
  assert.match(computed(t.h4).color, /--iq-muted|var\(--iq-muted\)|^#|rgb/);
  assert.equal(computed(t.h5).fontSize, 13, '#### and below one step under the text, muted');
  for (const h of ['h2', 'h3', 'h4', 'h5']) assert.ok(computed(t[h]).fontSize >= computed(t.p).fontSize * .9, `${h} is not smaller than the text by more than a step`);
});

test('headings keep their relation to the text when the text size changes (narrow screens)', () => {
  const wide = at(1440), narrow = at(375);
  const a = editorTree({ density: 'compact', previewOnBlur: true, previewing: true }), b = editorTree({ density: 'compact', previewOnBlur: true, previewing: true });
  for (const h of ['h2', 'h3', 'h4', 'h5'])
    assert.ok(Math.abs(wide(a[h]).fontSize / wide(a.p).fontSize - narrow(b[h]).fontSize / narrow(b.p).fontSize) < 1e-9, h);
});

test('a compact viewer reads like a compact editor preview', () => {
  const computed = at(1440), v = viewerTree({ density: 'compact' }), t = editorTree({ density: 'compact', previewOnBlur: true, previewing: true });
  assert.deepEqual(metrics(computed(v.p)), metrics(computed(t.p)));
  assert.equal(computed(v.h3).fontSize, computed(t.h3).fontSize);
});

test('the viewer density property and the sources', () => {
  const viewer = read('src/modules/markdown-viewer.js'), types = read('types/core.d.ts'), text = read('src/styles/text.css'), foundation = read('src/styles/foundation.css');
  assert.match(viewer, /get density\(\)\{return this\.getAttribute\('density'\)==='compact'\?'compact':'comfortable';\}/);
  assert.match(types, /class IqMarkdownViewer extends HTMLElement \{[^}]*density:'compact'\|'comfortable';/);
  assert.ok(text.includes('.markdown-editor .md-preview,iq-markdown-viewer[density=compact] .md-document{font-size:var(--iq-md-text-size);line-height:var(--iq-md-text-leading);max-width:none}'));
  // The source size lives in one place: no sheet sets .md-input's font size or line height directly any more (chat variant excepted: no preview).
  for (const f of fs.readdirSync(path.join(root, 'src/styles')).filter(f => f.endsWith('.css')))
    for (const m of read('src/styles/' + f).matchAll(/([^{}]*\.md-input)\{([^}]*)\}/g))
      if (!/variant-chat|data-idle/.test(m[1])) assert.doesNotMatch(m[2], /(^|;)\s*(font-size|line-height|font)\s*:(?!var\(--iq-md-text)/, `${f}: ${m[1].trim()}`);
  assert.match(foundation, /\.markdown-editor\{[^}]*--iq-md-text-size:var\(--iq-type-interface-size\);--iq-md-text-leading:1\.75\}/);
  // Shipped in vnext.37; later releases pin their own version (vnext38.test.cjs), this one only that it is not older.
  const release = Number(/^0\.6\.0-vnext\.(\d+)$/.exec(require('../package.json').version)?.[1]);
  assert.ok(release >= 37, 'Markdown text at one size ships from 0.6.0-vnext.37 on');
});
