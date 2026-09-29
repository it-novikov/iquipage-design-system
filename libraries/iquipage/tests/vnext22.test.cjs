'use strict';
/** Contracts for 0.6.0-vnext.22: the package ships Inter itself; no font CDN anywhere. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json')), tokens = JSON.parse(read('tokens/semantic.json'));

test('the font file is in the package and stays small', () => {
  const file = path.join(root, 'assets/fonts/InterVariable.woff2');
  assert.ok(fs.existsSync(file));
  assert.ok(fs.statSync(file).size < 120000, 'woff2 grew past 120 KB: re-run scripts/subset-inter.py');
  assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2');
  assert.ok(pkg.files.includes('assets/fonts'));
  assert.equal(pkg.exports['./fonts.css'], './tokens/fonts.css');
  assert.ok(fs.existsSync(path.join(root, 'assets/fonts/OFL.txt')));
});
test('fonts.css declares Inter, Inter Display and the metric fallback', () => {
  const css = read('tokens/fonts.css');
  for (const family of ['"Inter"', '"Inter Display"', '"Inter Fallback"']) assert.ok(css.includes(`font-family:${family}`), family);
  assert.ok(css.includes('font-weight:400 700') && css.includes('font-display:swap') && css.includes('../assets/fonts/InterVariable.woff2'));
  assert.ok(css.includes('size-adjust:') && css.includes('local("Arial")'));
  assert.ok(tokens.base.font.includes('"Inter Fallback"') && tokens.base.display.startsWith('"Inter Display", "Inter", "Inter Fallback"'));
});
test('dist styles start with the font faces and the catalogs preload the file without Google Fonts', () => {
  assert.ok(read('dist/iquipage.css').startsWith('/* Inter 4.1'));
  for (const t of ['src/template.html', 'src/whiteboard-template.html', 'src/workbench-template.html']) {
    const html = read(t);
    assert.ok(!html.includes('googleapis') && !html.includes('gstatic'), t);
    assert.ok(html.includes('rel="preload" type="font/woff2"') && html.includes('assets/fonts/InterVariable.woff2'), t);
  }
  assert.equal(tokens.meta.version, pkg.version);
  assert.match(pkg.version, /^0\.6\.0-vnext\.(2[2-9]|[3-9]\d)$/);
});
