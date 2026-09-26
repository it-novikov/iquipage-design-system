'use strict';
/** Contracts added in 0.6.0-vnext.11: fixed card light field, top-anchored side rail, roadmap flow mode, editor empty text. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the task card light field keeps a fixed height instead of stretching with the card', () => {
  const css = read('src/styles/foundation.css');
  assert.match(css, /\.task-card\{--task-light-extent:160px\}/);
  assert.match(css, /background-size:100% var\(--task-light-extent\)/);
  assert.match(css, /background:var\(--task-light-image\) 0 0\/100% var\(--task-light-extent\) no-repeat/);
  assert.doesNotMatch(css, /background-image:var\(--task-light-image\);background-repeat:no-repeat;background-size:100% 100%/);
});
test('the side rail starts at the top even under the host embedding footer rule', () => {
  const css = read('src/styles/whiteboard-workshop.css');
  assert.match(css, /iq-whiteboard\[surface-mode=embedded\]\[editor-mode=host\]\[dock=side\] \.wb-footer\{top:16px;bottom:16px;left:16px;right:auto;/);
});
test('iq-roadmap[flow] leaves vertical scrolling to the page', () => {
  assert.match(read('src/styles/foundation.css'), /iq-roadmap\[flow\] \.rm-scroll\{max-height:none;overflow-y:hidden;overscroll-behavior:auto\}/);
});
test('iq-markdown-editor accepts an empty-text for an empty preview', () => {
  assert.match(read('src/modules/editor.js'), /this\.getAttribute\('empty-text'\)\|\|'Пока нет содержимого\.'/);
});
