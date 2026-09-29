'use strict';
/** Wave 1 typography (TYP-03..10, TYP-14..19): rem scale, the 12px floor, the replayable codemod, text.css, typo(). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { pathToFileURL } = require('node:url');
global.HTMLElement ??= class {};
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const tokens = JSON.parse(read('tokens/semantic.json'));
const gate = () => import(pathToFileURL(path.join(root, 'scripts/gates/styles.mjs')).href);
const codemod = () => import(pathToFileURL(path.join(root, 'scripts/codemods/type-scale.mjs')).href);
const sheets = () => fs.readdirSync(path.join(root, 'src/styles')).filter(f => f.endsWith('.css'));

test('TYP-03: every type size token is rem at a 16px root and the meta step is the 12px floor', () => {
  const sizes = Object.entries(tokens.base).filter(([k]) => /^type-\w+-size$/.test(k));
  assert.ok(sizes.length >= 11, 'type scale present');
  for (const [k, v] of sizes) assert.match(v, /^\d*\.?\d+rem$/, `${k}=${v}`);
  assert.equal(tokens.base['type-meta-size'], '.75rem');
  assert.equal(tokens.base['type-interface-size'], '.875rem');
  assert.equal(tokens.base['type-body-size'], '1rem');
  for (const k of ['type-label-size', 'type-caption-size', 'type-title-size', 'type-heading3-size', 'type-heading1-size', 'type-lead-size']) assert.ok(tokens.base[k], k);
  assert.ok(!Object.entries(tokens.base).some(([k, v]) => /^type-/.test(k) && /px$/.test(v)), 'no px left in the type tokens');
  assert.ok(read('src/styles/text.css').includes('html{font-size:100%;'));
});

test('TYP-07/08: Cyrillic line-height minimums and the tracking scale are tokens', () => {
  assert.equal(tokens.base['type-display-lineHeight'], '1.1');
  assert.equal(tokens.base['type-heading1-lineHeight'], '1.15');
  assert.equal(tokens.base['type-heading2-lineHeight'], '1.2');
  assert.equal(tokens.base['type-heading3-lineHeight'], '1.3');
  assert.deepEqual(['tracking-display', 'tracking-h1', 'tracking-h2', 'tracking-h3', 'tracking-body', 'tracking-caps'].map(k => tokens.base[k]), ['-0.028em', '-0.024em', '-0.018em', '-0.012em', '0', '.06em']);
  for (const role of ['display', 'heading1', 'heading2', 'heading3']) assert.match(tokens.base[`type-${role}-letterSpacing`], /^var\(--iq-tracking-/, role);
  for (const f of sheets()) assert.doesNotMatch(read('src/styles/' + f), /letter-spacing:-?\.\d+em/, `${f} still has a tracking literal`);
});

test('TYP-04 / SYS-03: no font-size below 12px on a component selector, no px font sizes at all', async () => {
  const { scan, summarize } = await gate();
  const { CATALOG } = await codemod();
  const found = scan(), summary = summarize(found);
  const component = found['font-size-below-12px'].filter(h => !CATALOG.test(h.selector));
  assert.deepEqual(component.map(h => `${h.file}:${h.line} ${h.declaration} [${h.selector}]`), []);
  assert.equal(summary['font-size-below-12px'].total, 0, 'catalog sizes below 12px are rem literals, never px');
  assert.equal(summary['font-size-px'].total, 0, 'every font size is a token or a rem literal');
});

test('the sheets are in codemod normal form: a run on the tree reports zero changes', async () => {
  const { run } = await codemod();
  const result = run({ root, write: false });
  assert.equal(result.total, 0, JSON.stringify(result.counts));
  assert.deepEqual(result.changed, []);
});

test('the codemod is idempotent on the pre-wave-1 sheets: the second run changes nothing', async () => {
  const { run } = await codemod();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-type-scale-'));
  try {
    fs.mkdirSync(path.join(tmp, 'src/styles'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'tokens'));
    fs.copyFileSync(path.join(root, 'tokens/semantic.json'), path.join(tmp, 'tokens/semantic.json'));
    // A sheet that exercises every rule: floor, token, rem, media shrink, tracking, line-height, weight, clamp, prose.
    fs.writeFileSync(path.join(tmp, 'src/styles/foundation.css'), [
      'body{font:400 14px/1.5 var(--iq-font);letter-spacing:-.008em}',
      '.iq-avatar{font-size:10px}.iq-avatar.xs{font-size:9px}.sample-overline{font-size:10px;letter-spacing:.13em}',
      '.landing-fine{font-size:8px}.iq-note{font-size:15px}.work-heading h1{font-size:46px;line-height:1.04;letter-spacing:-.045em}',
      '.md-tool[data-md=bold]{font-weight:750}.plan-card .title{display:-webkit-box;-webkit-line-clamp:3;overflow:hidden}',
      '.md-document{overflow-wrap:anywhere}.iq-work-table td{overflow-wrap:anywhere}',
      '@media(max-width:600px){.iq-avatar{font-size:9px}.iq-note{font-size:14px;padding:0}.sample-overline{font-size:8px}input{font-size:16px}}',
    ].join('\n'));
    const first = run({ root: tmp });
    assert.ok(first.total > 0);
    const css = fs.readFileSync(path.join(tmp, 'src/styles/foundation.css'), 'utf8');
    assert.ok(css.includes('body{font:400 var(--iq-type-interface-size)/1.5 var(--iq-font);letter-spacing:var(--iq-tracking-body)}'));
    assert.ok(css.includes('.iq-avatar{font-size:var(--iq-type-meta-size)}.iq-avatar.xs{font-size:var(--iq-type-meta-size)}'), 'component floor');
    assert.ok(css.includes('.sample-overline{font-size:var(--iq-type-meta-size);letter-spacing:var(--iq-tracking-caps);text-transform:uppercase}'), 'kicker');
    assert.ok(css.includes('.landing-fine{font-size:.5rem}'), 'catalog keeps its size as rem');
    assert.ok(css.includes('.iq-note{font-size:.9375rem}'), 'off-scale px becomes rem');
    assert.ok(css.includes('.work-heading h1{font-size:2.875rem;line-height:var(--iq-type-heading1-lineHeight);letter-spacing:var(--iq-tracking-display)}'));
    assert.ok(css.includes('{font-weight:700}') && css.includes('-webkit-line-clamp:3;line-clamp:3;'));
    assert.ok(css.includes('.md-document{overflow-wrap:break-word}.iq-work-table td{overflow-wrap:anywhere}'));
    assert.ok(css.includes('@media(max-width:600px){.iq-avatar{font-size:var(--iq-type-meta-size)}.iq-note{padding:0}.sample-overline{font-size:var(--iq-type-meta-size)}input{font-size:var(--iq-type-body-size)}}'), 'media may not shrink text: ' + css.split('@media')[1]);
    const second = run({ root: tmp });
    assert.equal(second.total, 0, JSON.stringify(second.counts));
    assert.equal(fs.readFileSync(path.join(tmp, 'src/styles/foundation.css'), 'utf8'), css);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('TYP-09/14/18: text.css is built after the component sheets and before focus.css', () => {
  const build = read('scripts/build.mjs');
  const order = ['foundation.css', 'settings.css', 'text.css', 'focus.css', 'touch.css'].map(f => build.indexOf(`'src/styles/${f}'`));
  assert.ok(order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])), order.join(','));
  const text = read('src/styles/text.css');
  assert.ok(text.includes('text-size-adjust:100%'));
  assert.ok(text.includes('hyphens:auto;-webkit-hyphens:auto;hyphenate-limit-chars:6 3 3') && text.includes(':lang(ru) .md-document'));
  assert.ok(text.includes('.md-document{font-size:var(--iq-type-body-size);line-height:var(--iq-type-body-lineHeight);max-width:68ch}'));
  for (const role of ['heading1', 'heading3', 'lead', 'title', 'meta']) assert.ok(text.includes(`.type-${role}{font-size:var(--iq-type-${role}-size)`), role);
  const dist = read('dist/iquipage.css');
  assert.ok(dist.indexOf('text-size-adjust:100%') > dist.indexOf('.iq-settings-stack{') && dist.indexOf('text-size-adjust:100%') < dist.indexOf('/* Keyboard focus for every button-like control'), 'text.css sits between settings.css and focus.css in dist');
  assert.ok(!/\.md-document\{[^}]*overflow-wrap:anywhere/.test(read('src/styles/everyday.css')), 'prose breaks words at the line end, not anywhere');
});

test('TYP-06: every type token has a consumer', () => {
  const css = sheets().map(f => read('src/styles/' + f)).join('\n');
  const unused = Object.keys(tokens.base).filter(k => /^(type-|tracking-)/.test(k) && !css.includes(`var(--iq-${k})`) && !Object.values(tokens.base).includes(`var(--iq-${k})`));
  assert.deepEqual(unused, []);
});

test('TYP-19 / TYP-10: standard line-clamp next to every -webkit-line-clamp; no 750 weight', () => {
  for (const f of sheets()) {
    const css = read('src/styles/' + f);
    for (const block of css.match(/\{[^{}]*-webkit-line-clamp[^{}]*\}/g) || []) {
      const value = /-webkit-line-clamp:([^;}]+)/.exec(block)[1];
      assert.ok(block.includes(`line-clamp:${value}`) && /[;{]line-clamp:/.test(block), `${f}: ${block}`);
    }
    assert.doesNotMatch(css, /font-weight:750|font:750\b/, f);
  }
});

test('TYP-16: kickers are uppercase in CSS and sentence case in the modules', () => {
  const css = read('src/styles/foundation.css') + read('src/styles/whiteboard.css');
  for (const rule of ['.sample-overline', '.iq-pro-eyebrow', '.wb-library-eyebrow', '.narrative-toolbar>span', '.eyebrow', '.wb-panel-kicker', '.iq-work-header-eyebrow']) {
    const own = new RegExp('(?:^|[}\\n])' + rule.replace(/[.>]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
    const bodies = [...css.matchAll(own)].map(m => m[1]);
    assert.ok(bodies.some(body => body.includes('text-transform:uppercase') && body.includes('letter-spacing:var(--iq-tracking-caps)') && body.includes('var(--iq-type-meta-size)')), rule + ': ' + bodies.join(' | '));
  }
  for (const f of fs.readdirSync(path.join(root, 'src/modules')).filter(f => f.endsWith('.js'))) {
    const caps = read('src/modules/' + f).match(/[А-ЯЁ]{3,}/g) || [];
    assert.deepEqual(caps, [], `${f} still shouts`);
  }
  assert.ok(read('src/modules/app.js').includes("'Рабочая задача'") && read('src/modules/edition.js').includes('>SPRINTIQUE / Контекст<'), 'brands and acronyms stay, Russian words are sentence case');
});

test('TYP-15: typo() protects short words, dashes, units and № with U+00A0 and is idempotent', () => {
  const { typo } = require('../src/modules/time.js');
  const show = s => s.replace(/ /g, '_');
  assert.equal(show(typo('в работе и до 10:24')), 'в_работе и_до_10:24');
  assert.equal(show(typo('12 задач — 2,4 МБ')), '12_задач_— 2,4_МБ');
  assert.equal(show(typo('№ 12 к которым можно вернуться')), '№_12_к_которым можно вернуться');
  assert.equal(show(typo('Один акцент — одно значение')), 'Один акцент_— одно значение');
  assert.equal(typo(''), '');
  assert.equal(typo(undefined), '');
  for (const s of ['в работе и до 10:24', 'Проект / Выпуск 2.4', '№ 12']) assert.equal(typo(typo(s)), typo(s), s);
  assert.ok(read('src/entries/core.js').includes('export const typo=m4.typo;'));
  assert.ok(read('types/core.d.ts').includes('export declare function typo(text:string):string;'));
  assert.ok(read('src/modules/edition.js').includes('(0, time_js_1.typo)(text)'), 'catalog kickers go through typo()');
});
