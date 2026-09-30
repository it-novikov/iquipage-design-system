'use strict';
/** Wave 1 motion regressions (MOT-01/03/04/05/07/08/10/12/13/14/15/16/17, SYS-04):
 *  one reduced-motion strategy, token-only durations, transform-only layout, theme switch guard, codemod idempotency. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const stylesDir = path.join(root, 'src/styles');
const styleFiles = () => fs.readdirSync(stylesDir).filter(f => f.endsWith('.css'));
const modulesDir = path.join(root, 'src/modules');
const moduleFiles = () => fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'));
const tokens = JSON.parse(read('tokens/semantic.json')).base;
const motionNames = Object.keys(tokens).filter(k => k.startsWith('motion-'));

test('MOT-03/SYS-04: the motion scale and easings are tokens', () => {
  assert.deepEqual(motionNames, ['motion-instant', 'motion-fast', 'motion-standard', 'motion-enter', 'motion-layout', 'motion-scene']);
  assert.equal(tokens['motion-instant'], '0ms');
  assert.equal(tokens['motion-fast'], '120ms');
  assert.equal(tokens['motion-standard'], '180ms');
  assert.equal(tokens['motion-enter'], '280ms');
  assert.equal(tokens['motion-layout'], '360ms');
  for (const ease of ['ease', 'ease-spring', 'ease-out']) assert.match(tokens[ease], /^cubic-bezier\(/, ease);
  assert.equal(tokens['loading-delay'], '180ms', 'the anti-flicker delay is a gate, not motion: it is not a motion-* token');
});

test('MOT-01: no blanket reduced-motion reset on * remains in src/styles', () => {
  for (const file of styleFiles()) {
    const css = read('src/styles/' + file);
    assert.doesNotMatch(css, /\*,\*::before,\*::after\{[^{}]*(animation|transition)/, `${file}: blanket * animation reset`);
    assert.doesNotMatch(css, /\[data-motion=reduced\] \*[^{]*\{[^{}]*(animation|transition)/, `${file}: blanket [data-motion=reduced] * reset`);
    assert.doesNotMatch(css, /\.01ms/, `${file}: .01ms hack`);
  }
});

test('MOT-01/MOT-10: both reduced selectors zero every motion token, generated once in motion.css', () => {
  const css = read('src/styles/motion.css');
  const zero = motionNames.map(n => `--iq-${n}:0ms`).join(';');
  assert.ok(css.includes(`@media (prefers-reduced-motion: reduce){:root{${zero};`), 'media query zeroes the tokens');
  assert.ok(css.includes(`:root[data-motion=reduced]{${zero};`), 'data-motion zeroes the tokens');
  assert.doesNotMatch(css, /--iq-loading-delay:0/, 'the loading delay survives reduced motion');
  const rest = styleFiles().filter(f => f !== 'motion.css').map(f => read('src/styles/' + f)).join('\n');
  assert.doesNotMatch(rest, /--iq-motion-[a-z]+:0ms/, 'no second copy of the zeroing outside motion.css');
  assert.ok(read('scripts/build.mjs').includes("src/styles/motion.css"), 'motion.css ships in dist/iquipage.css');
});

test('MOT-01: the .iq-loading anti-flicker delay is a token and fills backwards', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-loading\{[^}]*animation:iq-loading-appear var\(--iq-motion-standard\) var\(--iq-ease\) var\(--iq-loading-delay\) backwards\}/);
  assert.match(css, /\.iq-reveal\{animation:iq-reveal var\(--iq-motion-standard\) var\(--iq-ease\) backwards\}/, 'MOT-13: no permanent forwards fill');
});

test('MOT-03: the styles gate reports zero raw durations', async () => {
  const gate = await import(path.join(root, 'scripts/gates/styles.mjs'));
  const found = gate.scan();
  assert.deepEqual(found['duration-raw'].map(gate.formatHit), [], 'duration-raw must be 0');
  const raw = /(transition|animation)[^;{}]*[\s:,](?!0m?s\b)\d*\.?\d+m?s\b/;
  for (const file of styleFiles()) assert.doesNotMatch(read('src/styles/' + file), raw, `${file}: raw duration`);
  for (const file of styleFiles()) {
    const css = read('src/styles/' + file);
    assert.doesNotMatch(css, /(transition|animation)[^;{}]*cubic-bezier\(/, `${file}: raw cubic-bezier`);
    assert.doesNotMatch(css, /(transition|animation):[^;{}]*\s(ease|ease-in|ease-out|ease-in-out)(\s|,|;|})/, `${file}: raw easing keyword`);
  }
});

test('MOT-10: motionReduced is defined once and used everywhere', () => {
  const owners = moduleFiles().filter(f => /prefers-reduced-motion: reduce\)'\)\.matches\s*(\|\||\))/.test(read('src/modules/' + f)));
  assert.deepEqual(owners, ['interaction.js']);
  for (const f of ['components.js', 'board-motion.js', 'refinements.js', 'edition.js', 'app.js', 'media.js', 'editor.js']) assert.match(read('src/modules/' + f), /motionReduced/, f + ' uses motionReduced');
  assert.match(read('src/modules/interaction.js'), /exports\.motionReduced = motionReduced/);
});

test('MOT-03: JS reads durations from the tokens through motionMs/motionEase', () => {
  const interaction = read('src/modules/interaction.js');
  for (const name of ['motionMs', 'motionEase', 'scrollBehavior', 'withoutTransitions', 'bindLoading']) assert.match(interaction, new RegExp(`exports\\.${name} = ${name}`), name + ' exported');
  assert.match(interaction, /getPropertyValue\(prop\)/);
  for (const f of ['components.js', 'editor.js', 'refinements.js', 'edition.js', 'app.js', 'interaction.js']) {
    const src = read('src/modules/' + f);
    assert.doesNotMatch(src, /duration: \d+\s*[,}]/, f + ': raw duration in animate()');
    assert.doesNotMatch(src, /easing: '(cubic-bezier|ease)/, f + ': raw easing in animate()');
  }
  const core = read('src/entries/core.js');
  for (const name of ['motionMs', 'motionEase', 'scrollBehavior', 'withoutTransitions', 'bindLoading']) assert.match(core, new RegExp(`export const ${name}=m7\\.${name};`));
  const types = read('types/core.d.ts');
  for (const name of ['motionMs', 'motionEase', 'scrollBehavior', 'withoutTransitions', 'bindLoading']) assert.match(types, new RegExp(`export declare function ${name}`));
});

test('MOT-05: theme switch helper suppresses transitions for one frame', () => {
  const interaction = read('src/modules/interaction.js');
  assert.match(interaction, /setAttribute\('data-theme-switching', ''\)/);
  assert.match(interaction, /requestAnimationFrame\(\(\) => requestAnimationFrame\(release\)\)/, 'removed after the painted frame, not before it');
  assert.match(read('src/styles/motion.css'), /:root\[data-theme-switching\][^{]*\{transition:none!important\}/);
  assert.match(read('src/modules/app.js'), /withoutTransitions\(\(\) => \{ document\.documentElement\.dataset\.theme = theme; \}\)/);
});

test('MOT-04: progress animates transform, the editor never animates height', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-progress span\{[^}]*transform:translateX\(calc\(var\(--progress,0%\) - 100%\)\);transition:transform var\(--iq-motion-layout\)/);
  assert.doesNotMatch(css, /transition:[^;}]*\bwidth\b/, 'no width transition');
  assert.doesNotMatch(css, /transition:[^;}]*\bheight\b/, 'no height transition');
  const editor = read('src/modules/editor.js');
  assert.doesNotMatch(editor, /\{height: before/, 'editor height keyframes');
  assert.match(editor, /clipPath/);
});

test('MOT-08/MOT-12/MOT-14: symmetrical pairs, scoped hover lift, real switch knob', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-btn:is\(\.primary,\.secondary\):not\(:disabled\):not\(\[aria-busy=true\]\):hover\{transform:translateY\(-1px\)\}/);
  assert.doesNotMatch(css, /\.iq-btn:not\(:disabled\):not\(\[aria-busy=true\]\):hover\{transform:translateY\(-1px\)\}/);
  assert.doesNotMatch(css, /\.iq-switch-track::after/, 'the knob is ::before');
  assert.match(css, /\.iq-switch-track::before\{transition:transform var\(--iq-motion-standard\) var\(--iq-ease-spring\)\}/);
  assert.match(css, /\.iq-toast\{[^}]*animation:iq-toast-in var\(--iq-motion-standard\)/);
  assert.match(css, /\.iq-toast\.leaving\{[^}]*transition:opacity var\(--iq-motion-standard\)/);
  const components = read('src/modules/components.js');
  assert.match(components, /motionMs\(drawer \? 'enter' : 'standard'/, 'dialog standard/standard, drawer enter/enter');
  assert.equal((components.match(/motionMs\('fast', 120\)/g) || []).length >= 2, true, 'menu fades fast in and fast out');
});

test('MOT-16: dialog close returns the result first and keeps the dialog inert during the exit', () => {
  const components = read('src/modules/components.js');
  const close = components.slice(components.indexOf('    close(immediate = false) {'), components.indexOf('    get open()'));
  assert.match(close, /if \(!this\.native\?\.open \|\| this\.closing\)/, 'a second close during the exit is ignored');
  assert.ok(close.indexOf('this.settle();') < close.indexOf('this.native.animate('), 'focus return and iq-close precede the animation');
  assert.match(close, /this\.native\.inert = true;/);
  assert.match(components, /settle\(\) \{\s*if \(this\.settled\)\s*return;/);
});

test('MOT-07: skeleton breathes three times, rests faint, and loading turns slow after the token', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.iq-skeleton\{[^}]*animation:iq-breathe calc\(2 \* var\(--iq-motion-scene\)\) var\(--iq-ease\) 3 forwards\}/);
  assert.match(css, /@keyframes iq-breathe\{from,to\{opacity:\.55\}50%\{opacity:1\}\}/);
  assert.match(read('src/styles/motion.css'), /\.iq-loading\.iq-loading-slow>\.iq-loading-note\{display:block\}/);
  assert.match(read('src/modules/interaction.js'), /classList\.add\('iq-loading-slow'\)/);
  assert.match(read('docs/INTEGRATION.md'), /## Загрузка/);
});

test('MOT-15/MOT-17: reduced-aware scrolling, will-change only while gesturing', () => {
  assert.doesNotMatch(read('src/modules/app.js'), /behavior: 'smooth'/);
  const wb = read('src/styles/whiteboard.css');
  assert.doesNotMatch(wb, /\n\.wb-world\{[^}]*will-change/, 'the permanent layer on .wb-world is gone');
  assert.match(wb, /\.wb-stage\.is-interacting \.wb-world\{will-change:transform\}/);
  assert.doesNotMatch(wb, /backdrop-filter/);
});

test('codemod is idempotent: a second run changes nothing and reproduces the current styles', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'iq-motion-')));
  fs.cpSync(path.join(root, 'src/styles'), path.join(tmp, 'src/styles'), { recursive: true });
  fs.cpSync(path.join(root, 'tokens'), path.join(tmp, 'tokens'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts/codemods'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/codemods/motion-tokens.mjs'), path.join(tmp, 'scripts/codemods/motion-tokens.mjs'));
  const out = execFileSync(process.execPath, [path.join(tmp, 'scripts/codemods/motion-tokens.mjs')], { encoding: 'utf8' });
  assert.match(out, /nothing to do/, out);
  for (const file of styleFiles()) assert.equal(fs.readFileSync(path.join(tmp, 'src/styles', file), 'utf8'), read('src/styles/' + file), file + ' unchanged by a replay');
  fs.rmSync(tmp, { recursive: true, force: true });
});
