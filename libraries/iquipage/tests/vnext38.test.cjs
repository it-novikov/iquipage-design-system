'use strict';
/** Contracts for 0.6.0-vnext.38: avatars on one scale with one rule for the initials. The Sprintique owner saw initials
 *  running to the edge of the disc everywhere («буквы до самых краев»): a 12px label inside 20px card discs, 12px inside
 *  24px discs, tracked 8px capitals at 20px. Now the diameter is a step of the avatar scale and the initials are a fixed
 *  share of it, so two wide Cyrillic capitals keep a comfortable margin at every size. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const ui = require('../src/modules/ui.js');

const tokens = JSON.parse(read('tokens/semantic.json')).base;
/** A base token in px, following var(--iq-…) references to other base tokens. */
const px = name => {
  let v = tokens[name];
  for (let i = 0; i < 5 && typeof v === 'string' && v.startsWith('var('); i++) v = tokens[/^var\(--iq-([\w-]+)\)$/.exec(v)[1]];
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v); assert.ok(m, `${name} resolves to px (got ${v})`); return +m[1];
};
const SCALE = { xs: 20, sm: 24, md: 28, base: 32, lg: 40, xl: 48 };
const RATIO = +tokens['avatar-initials'], WEIGHT = +tokens['avatar-initials-weight'];

/** Painted width (ink, in em) of initials in the bundled Inter at its text optical size and weight 550, measured in
 *  Chrome with canvas measureText (actualBoundingBox) on 2026-10-08 for this font file, and confirmed on 4x screenshots
 *  of the DS avatar sheet. «ЖЛ» is the widest pair the owner's team produces; `offset` is how far its ink sits off the
 *  centre (Ж's left side bearing is smaller than Л's right one), taken off the tighter side. */
const INTER_SHA256 = 'c8126c77db9d9370281a3e473ecba9232f1b6582a69df77c9f9cd825253c1225';
const INK = { 'ЖЛ': 1.66, 'АК': 1.364, 'БП': 1.21, 'AK': 1.364, 'М': 0.764, '+3': 1.149 };
const OFFSET = 0.025;
/** Clearance on the tighter side, as a share of the diameter. */
const clearance = (text, d) => { const font = d * RATIO; return ((d - font * INK[text]) / 2 - font * OFFSET) / d; };

test('the avatar scale: six steps on DS size tokens, 20 to 48 px', () => {
  for (const [step, size] of Object.entries(SCALE)) assert.equal(px('avatar-size-' + step), size, step);
  // Every step but 28 is a spacing token; 28 sits between space-6 and space-8 and is the group default.
  for (const step of ['xs', 'sm', 'base', 'lg', 'xl']) assert.match(tokens['avatar-size-' + step], /^var\(--iq-space-\d+\)$/, step);
  const tokenCss = read('tokens/tokens.css');
  for (const step of Object.keys(SCALE)) assert.match(tokenCss, new RegExp(`--iq-avatar-size-${step}: `), step);
});

test('initials are a fixed share of the diameter at one medium weight', () => {
  assert.ok(RATIO >= 0.36 && RATIO <= 0.42, `ratio ${RATIO}`);
  assert.ok(WEIGHT >= 500 && WEIGHT <= 600, `weight ${WEIGHT}`);
  for (const [step, d] of Object.entries(SCALE)) {
    const font = d * RATIO;
    assert.ok(Math.abs(font / d - RATIO) < 1e-9, step);
    assert.ok(font >= 7.4 - 1e-9, `${step}: ${font}px initials stay legible`);
  }
});

test('two wide Cyrillic letters keep at least 18% of the diameter clear on each side at every size', () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'assets/fonts/InterVariable.woff2'))).digest('hex'), INTER_SHA256,
    'the font changed: re-measure INK and OFFSET on the avatar sheet before trusting these margins');
  for (const [step, d] of Object.entries(SCALE)) {
    assert.ok(clearance('ЖЛ', d) >= 0.18, `ЖЛ at ${step} (${d}px): ${(clearance('ЖЛ', d) * 100).toFixed(1)}%`);
    for (const text of ['АК', 'БП', 'AK']) assert.ok(clearance(text, d) >= 0.22, `${text} at ${step}`);
    assert.ok(clearance('М', d) >= 0.33, `М at ${step}`);
    assert.ok(clearance('+3', d) >= 0.26, `+3 at ${step}`);
  }
  // The vnext.36 rules, for the record: 12px initials in a 20px card disc left «ЖЛ» no margin at all.
  const before = (font, d) => ((d - font * 1.6825) / 2) / d;
  assert.ok(before(12, 20) < 0.01 && before(12, 24) < 0.09);
});

test('avatar.css owns the disc: size from the scale, initials from the ratio, cap-trimmed and centred', () => {
  const css = read('src/styles/avatar.css');
  const base = /\.iq-avatar\{([^}]*)\}/.exec(css)[1];
  for (const decl of ['--iq-avatar-size:var(--iq-avatar-size-base)', 'width:var(--iq-avatar-size)', 'height:var(--iq-avatar-size)',
    'flex:0 0 var(--iq-avatar-size)', 'border-radius:50%', 'font-size:calc(var(--iq-avatar-size) * var(--iq-avatar-initials))',
    'font-weight:var(--iq-avatar-initials-weight)', 'letter-spacing:var(--iq-tracking-body)', 'line-height:1', 'text-align:center',
    'align-content:center', 'text-box:trim-both cap alphabetic', 'white-space:nowrap'])
    assert.ok(base.includes(decl), decl);
  for (const step of ['xs', 'sm', 'md', 'lg', 'xl']) assert.ok(css.includes(`.iq-avatar.${step}{--iq-avatar-size:var(--iq-avatar-size-${step})}`), step);
  // Groups: the disc takes the group's step and keeps its full diameter; the separator ring is outside it.
  assert.ok(css.includes('.iq-avatars{--avatar-size:var(--iq-avatar-size-md)}'));
  for (const step of ['xs', 'sm', 'md', 'lg']) assert.ok(css.includes(`.iq-avatars.${step}{--avatar-size:var(--iq-avatar-size-${step})}`), step);
  assert.ok(css.includes('.iq-avatars .iq-avatar,.iq-avatars .iq-avatar.more{--iq-avatar-size:var(--avatar-size);border:0;box-shadow:0 0 0 2px var(--iq-avatar-separator)}'));
  assert.ok(css.includes('.iq-avatar.bot{display:inline-grid;place-items:center}'));
  assert.match(css, /@media\(forced-colors:active\)\{\.iq-avatar\{outline:1px solid CanvasText/);
});

test('no other stylesheet sizes an avatar or its initials', () => {
  const sizing = /^(width|height|min-width|min-height|max-width|max-height|font-size|font|font-weight|letter-spacing|line-height|flex|flex-basis)$/;
  const offenders = [];
  for (const file of fs.readdirSync(path.join(root, 'src/styles')).filter(f => f.endsWith('.css') && f !== 'avatar.css')) {
    const css = read('src/styles/' + file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].split(',').map(s => s.trim());
      // The rule targets an avatar when the last compound of a selector is the avatar itself (not its photo or icon).
      const last = s => s.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '').split(/[\s>+~]+/).pop();
      const targets = selectors.some(s => /\.iq-(select-)?avatar(?![\w-])/.test(last(s)));
      const groupSize = selectors.some(s => /\.iq-avatars(?![\w-])/.test(last(s)));
      for (const decl of m[2].split(';')) {
        const [prop, ...rest] = decl.split(':'); const p = (prop || '').trim(), value = rest.join(':').trim();
        if (targets && sizing.test(p)) offenders.push(`${file}: ${m[1].trim()} { ${decl.trim()} }`);
        if (groupSize && p === '--avatar-size' && !/^var\(--iq-avatar-size-\w+\)$/.test(value)) offenders.push(`${file}: ${m[1].trim()} { ${decl.trim()} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the build ships avatar.css after the foundation, and helpers speak the scale', () => {
  assert.match(read('scripts/build.mjs'), /src\/styles\/switcher\.css'\)\+'\\n'\+await read\('src\/styles\/avatar\.css'\)/);
  const dist = read('dist/iquipage.css');
  assert.ok(dist.indexOf('.iq-avatar{--iq-avatar-size:var(--iq-avatar-size-base)') > dist.indexOf('.iq-avatar.v1{'), 'avatar.css comes after foundation.css');
  const person = { id: 'u1', name: 'Жанна Лебедева' };
  for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) assert.match(ui.personAvatar(person, { size }), new RegExp(`^<span class="iq-avatar ${size} v[1-4]" aria-hidden="true">ЖЛ</span>$`));
  assert.match(ui.personAvatar(person, { size: '' }), /^<span class="iq-avatar v[1-4]" aria-hidden="true">ЖЛ<\/span>$/);
  assert.throws(() => ui.personAvatar(person, { size: 'huge' }), /Unsupported avatar size/);
  assert.match(ui.avatarGroup([person], { size: 'md' }), /<span class="iq-avatars md"/);
  assert.throws(() => ui.avatarGroup([person], { size: 'xl' }), /Unsupported avatar group size/);
  // Select and combobox options draw xs avatars: the list and the closed control use the scale, not their own sizes.
  const components = read('src/modules/components.js');
  assert.match(components, /<span class="iq-avatar xs iq-select-avatar v\$\{/);
  assert.match(components, /<span class="iq-avatar xs iq-select-avatar bot"/);
  assert.match(read('types/core.d.ts'), /export type AvatarSize='xs'\|'sm'\|'md'\|''\|'lg'\|'xl';/);
});

test('public surface: the vnext.38 release', () => {
  assert.match(read('src/entries/core.js'), /export const version='0\.6\.0-vnext\.56';/);
  assert.equal(require('../package.json').version, '0.6.0-vnext.56');
  assert.match(read('types/core.d.ts'), /export declare const version:'0\.6\.0-vnext\.56';/);
  assert.equal(JSON.parse(read('tokens/semantic.json')).meta.version, '0.6.0-vnext.56');
  assert.equal(JSON.parse(read('PROVENANCE.json')).release, '0.6.0-vnext.56');
});
