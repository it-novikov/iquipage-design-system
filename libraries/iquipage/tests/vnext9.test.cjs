'use strict';
/** Contracts added in 0.6.0-vnext.9: side dock with host actions and host panel, file picker, tag create bubble. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('whiteboard hosts can put commands in the dock and open a side panel that shares the library motion', () => {
  const js = read('src/modules/whiteboard-workshop.js');
  assert.match(js, /Object\.defineProperty\(Klass\.prototype,'hostActions'/);
  assert.match(js, /openHostPanel\(\{id='',title='',content=''\}=\{\}\)/);
  assert.match(js, /this\.emit\('iq-host-command',\{command:host\.dataset\.wbHost\}\)/);
  const css = read('src/styles/whiteboard-workshop.css');
  assert.match(css, /iq-whiteboard\[dock=side\] \.wb-footer,/);
  assert.match(css, /iq-whiteboard\[dock=side\] \.wb-shell :is\(\.wb-library,\.wb-host-panel\)\[hidden\]\{display:flex!important;transform:translateX\(-24px\)/);
  assert.match(read('src/modules/whiteboard-studio.js'), /if\(this\.libraryOpen\)this\.closeHostPanel\?\.\(false\)/);
});
test('iq-file-picker picks or receives dropped files and leaves upload to the host', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /'iq-file-picker': IqFilePicker/);
  assert.match(js, /this\.emit\('iq-files', \{ files: this\.hasAttribute\('multiple'\) \? files : files\.slice\(0, 1\) \}\)/);
  assert.match(read('src/styles/foundation.css'), /\.iq-file-picker-row\{/);
});
test('tag picker offers a "new tag" bubble that asks the host to create', () => {
  const js = read('src/modules/components.js');
  assert.match(js, /class="iq-tag iq-tag-add" data-tag-create/);
  assert.match(js, /requestCreate\(label\) \{/);
});
