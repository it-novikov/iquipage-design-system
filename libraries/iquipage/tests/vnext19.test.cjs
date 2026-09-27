'use strict';
/** Contracts for 0.6.0-vnext.19: discussions, chat composer, property grid, searchable select, inline tags,
 *  inline document editor, instant dialogs, side-dock zoom and the bare letterbox cropper. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
global.HTMLElement = global.HTMLElement || class {};
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const {cropRect, fitZoom} = require('../src/modules/image-crop.js');

test('discussions: questions pinned as frames, chat messages, resolved lines, no dividers', () => {
  const css = read('src/styles/foundation.css');
  for (const rule of ['.iq-discussion{', '.iq-thread[data-kind=question][data-state=open]{', '.iq-message{', '.iq-thread-line{', '.iq-composer{', '.iq-discussion-open-count{'])
    assert.ok(css.includes(rule), rule);
  const discussion = css.slice(css.indexOf('/* ---------- Discussions'), css.indexOf('/* Chat composer'));
  assert.doesNotMatch(discussion, /border-(top|bottom):1px/, 'space separates items, not lines');
  assert.match(read('src/modules/ui.js'), /function personAvatar\(person, \{ size = 'sm' \} = \{\}\)/);
  assert.match(read('src/modules/icons.js'), /"help": "circle-help"/);
});
test('chat composer rests as one line, cancels, toggles chips and submits alternate', () => {
  const js = read('src/modules/editor.js');
  assert.match(js, /const chatTools = \['bold', 'italic', 'link', 'ul', 'ol', 'quote', 'code'\]/);
  assert.match(js, /this\.getAttribute\('idle'\) === 'line'/);
  assert.match(js, /this\.emit\('iq-cancel', \{value: this\.value\}, \{cancelable: true\}\)/);
  assert.match(js, /this\.submit\(\{alternate: e\.altKey\}\)/);
  assert.match(js, /className = 'md-footer-chip'/);
  assert.match(js, /this\.toggleAttribute\('data-previewing', on\)/);
  assert.match(read('src/modules/components.js'), /emit\(type, detail, \{cancelable = false\} = \{\}\) \{ return this\.dispatchEvent/);
});
test('property grid, pill status, searchable select with meta, inline tags', () => {
  const css = read('src/styles/foundation.css'), js = read('src/modules/components.js');
  for (const rule of ['.iq-properties[data-columns=auto]{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}', '.iq-select-dot{', '.iq-select-search{', '.iq-option-meta{', 'iq-tag-picker[appearance=inline] .iq-tag-picker-field{'])
    assert.ok(css.includes(rule), rule);
  assert.match(js, /this\.hasAttribute\('searchable'\)/);
  assert.match(js, /o\.meta \? `<span class="iq-option-meta">/);
  assert.match(js, /show\(\{ instant = false \} = \{\}\)/);
});
test('side dock keeps zoom under the rail without the fit glyph', () => {
  const css = read('src/styles/whiteboard-workshop.css');
  assert.match(css, /iq-whiteboard\[dock=side\] \.wb-zoom \[data-wb-action=fit\]\{display:none\}/);
  assert.match(css, /justify-content:flex-start;align-items:stretch;bottom:auto/);
});
test('letterbox crops contain the image per axis and fill stays inside it', () => {
  const w = 600, h = 900, A = 12 / 5, min = fitZoom(w, h, A);
  assert.ok(min < 1);
  const fit = cropRect(w, h, min, .5, .5, A, min);
  assert.ok(fit.width >= w - .01 && fit.height >= h - .01, 'the frame contains the whole image');
  assert.ok(fit.x <= 0 && fit.x + fit.width >= w && fit.y <= 0.01);
  for (const x of [0, .5, 1]) { const r = cropRect(w, h, 1, x, .5, A); assert.ok(r.x >= 0 && r.x + r.width <= w + 1e-6 && r.y >= 0 && r.y + r.height <= h + 1e-6); }
  assert.equal(cropRect(w, h, .1, .5, .5, A).width, cropRect(w, h, 1, .5, .5, A).width, 'without letterbox zoom never drops below fill');
  const crop = read('src/modules/image-crop.js');
  assert.match(crop, /appearance'\)==='bare'/);
  assert.doesNotMatch(crop, /setAttribute\('title'/, 'never the HTML title attribute');
});
