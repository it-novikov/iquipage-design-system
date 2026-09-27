'use strict';
/** Contracts for 0.6.0-vnext.17: relation map, embedded board chip and the Maps-like whiteboard showcase. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the relation map is a public core component', () => {
  const core = read('src/entries/core.js');
  assert.match(core, /export const IqRelationMap=relationMap\.IqRelationMap;/);
  assert.match(core, /registerSettings\(\);registerRelationMap\(\);/);
  assert.equal((read('src/manifest.json').match(/"relation-map\.js"/g) || []).length, 3);
  assert.match(read('types/core.d.ts'), /export declare class IqRelationMap extends HTMLElement \{value:RelationMapValue\|null;\}/);
});
test('the relation map lays out parent, children, dependencies and links and emits open and remove', () => {
  const js = read('src/modules/relation-map.js');
  assert.match(js, /groups=\[\['parent','Родитель'\],\['dependsOn','Зависит от'\],\['blocks','Блокирует'\],\['related','Связана с'\],\['children','Подзадачи'\]\]/);
  assert.match(js, /new CustomEvent\('iq-open'/);
  assert.match(js, /new CustomEvent\('iq-remove'/);
  assert.match(js, /if\(width<560\)/);
  assert.match(js, /MAX_CHILDREN=6/);
  const css = read('src/styles/foundation.css');
  for (const rule of ['iq-relation-map{', '.rm-edge.rm-related{stroke-dasharray', '.rm-current .rm-node-body{', '.rm-node-status[data-tone=warning]::before', '.rm-list{'])
    assert.ok(css.includes(rule), rule);
});
test('embedded boards get the title chip, the sync state and the rail at the top', () => {
  const css = read('src/styles/whiteboard.css'), workshop = read('src/styles/whiteboard-workshop.css');
  assert.match(css, /\.iq-board-chip\{position:absolute;/);
  assert.match(css, /\.iq-board-sync:is\(\[data-state=saving\],\[data-state=syncing\]\) \.iq-icon\{animation:/);
  assert.match(workshop, /iq-whiteboard\[dock=side\] \.wb-shell\[data-workshop\] \.wb-footer\{top:16px;/);
});
test('the Visual whiteboard showcase is configured like Sprintique Maps', () => {
  const js = read('src/modules/whiteboard-stories.js');
  assert.match(js, /<iq-whiteboard surface-mode="embedded" selection-bar="none" dock="side" dock-tools="select">/);
  assert.match(js, /this\.board\.hostActions=\[\{id:'find'/);
  assert.match(js, /class="iq-board-chip"/);
  assert.doesNotMatch(js, /Начните с «Добавить заметку»/);
});
