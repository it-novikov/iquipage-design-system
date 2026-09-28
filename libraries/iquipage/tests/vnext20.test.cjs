'use strict';
/** Contracts for 0.6.0-vnext.20: drawer motion without a blink, unread count, arrowheads, narrower property grid. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('drawers slide in opaque, the backdrop fades, and closing motions never outlive the dialog', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /x \? \[\{ transform: 'translateX\(100%\)' \}, \{ transform: 'translateX\(0\)' \}\]/);
  assert.match(js, /pseudoElement: '::backdrop'/);
  assert.match(js, /this\.backdropAnimation = this\.native\.animate\(/);
  assert.match(js, /this\.native\.close\(\);\n\s+\/\/ The closing motion holds its last frame/);
  assert.doesNotMatch(js, /this\.backdrop\b(?!Animation|Motion)/, 'the element already owns a backdrop property');
});
test('unread count, question action group, 272px columns', () => {
  const css = read('src/styles/foundation.css');
  for (const rule of ['.iq-discussion-new-count{', '.iq-thread-actions-group{', 'minmax(min(100%,272px),1fr)']) assert.ok(css.includes(rule), rule);
});
test('whiteboard connectors end in a filled notched arrowhead', () => {
  const js = read('src/modules/whiteboard-studio.js');
  assert.match(js, /<path d="M0 0 L-12 -5\.4 L-9\.3 0 L-12 5\.4 Z" fill="context-stroke" stroke="none"\/>/);
  assert.match(js, /markerUnits="userSpaceOnUse"/);
});
test('avatars show a photo over the initials, only from safe URLs', () => {
  global.HTMLElement = global.HTMLElement || class {};
  const ui = require('../src/modules/ui.js');
  const html = ui.personAvatar({id: 'p1', name: 'Анна Смирнова', image: '/api/v1/people/p1/avatar?v=2'});
  assert.match(html, /class="iq-avatar sm v\d has-image"/);assert.match(html, /АС<img src="\/api\/v1\/people\/p1\/avatar\?v=2" alt=""/);
  assert.doesNotMatch(ui.personAvatar({name: 'X', image: 'javascript:alert(1)'}), /<img/);
  assert.doesNotMatch(ui.personAvatar({name: 'X', image: '//evil.example/a.png'}), /<img/);
  assert.match(ui.avatarGroup([{name: 'Анна', image: 'blob:x'}]), /has-image/);
  assert.ok(read('src/styles/foundation.css').includes('.iq-avatar.has-image>img{'));
});
test('the bare cropper can show a round photo and picks a file from its empty stage', () => {
  const js = read('src/modules/image-crop.js');
  assert.match(js, /this\.getAttribute\('mask'\)==='circle'/);
  assert.match(js, /this\.bare&&!this\.image&&!this\.loading/);
});
test('a file picker can be a quiet button while a whole region takes dropped files', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /variant'\) === 'button'/);
  assert.match(js, /this\.getAttribute\('drop-target'\) \? this\.closest\(this\.getAttribute\('drop-target'\)\) : null/);
  assert.match(js, /if \(!ev\.defaultPrevented \|\| !target\.contains\(ev\.target\)\) deliver/, 'a drop on the button is delivered once');
  assert.ok(read('src/styles/foundation.css').includes('[data-file-drop]{'));
});
