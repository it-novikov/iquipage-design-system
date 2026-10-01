'use strict';
/** Contracts for 0.6.0-vnext.26: the relation map «Ступица» with the words on its edges. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const { relationWords: words, relationNode: node } = require('../src/modules/relation-map.js');
const n = (id, extra = {}) => ({ id, key: id.toUpperCase(), title: `Задача ${id}`, status: 'Готово к работе', tone: 'neutral', icon: 'checklist', linkId: `l-${id}`, done: false, ...extra });
const value = o => ({ dependsOn: [], blocks: [], related: [], children: [], childrenDone: null, labels: { center: 'Эта задача' }, ...o });

test('the words on the edges name the relation and the state of the blockers', () => {
  assert.deepEqual(words(value({ dependsOn: [n('a')] })).dependsOn, { text: 'блокирует', state: '', tone: 'warning' });
  assert.deepEqual(words(value({ dependsOn: [n('a', { done: true })] })).dependsOn, { text: 'блокирует', state: 'закрыта', tone: 'success' });
  assert.deepEqual(words(value({ dependsOn: [n('a'), n('b', { done: true }), n('c', { done: true })] })).dependsOn, { text: 'блокируют', state: '1 из 3 открыта', tone: 'warning' });
  assert.equal(words(value({ dependsOn: [n('a'), n('b'), n('c', { done: true })] })).dependsOn.state, '2 из 3 открыты');
  assert.equal(words(value({ dependsOn: [n('a', { done: true }), n('b', { done: true })] })).dependsOn.state, 'все закрыты');
  const w = words(value({ blocks: [n('a'), n('b')], related: [n('c')] }));
  assert.equal(w.blocks.text, 'ждут'); assert.equal(w.related.text, 'связана'); assert.equal(w.parent.text, 'входит в'); assert.equal(w.children.text, 'подзадачи');
  assert.equal(words(value({ blocks: [n('a')], related: [n('b'), n('c')] })).blocks.text, 'ждёт');
  assert.equal(words(value({ related: [n('b'), n('c')] })).related.text, 'связаны');
  assert.equal(words(value({ blocks: [n('a')], labels: { center: 'Эта задача', blocks: 'держит' } })).blocks.text, 'держит');
});

test('a node is one button named by key, title, role and status; remove sits inside the node', () => {
  const html = node(n('spr-17'), { role: 'блокирует эту задачу', removable: true, blocker: true });
  assert.match(html, /^<div class="rm-node is-open">/);
  assert.match(html, /<button type="button" class="rm-node-body" data-rm-open="spr-17" aria-label="SPR-17, Задача spr-17, блокирует эту задачу, Готово к работе\. Открыть">/);
  assert.match(html, /<span class="rm-node-lock">/);
  assert.match(html, /<button type="button" class="rm-remove" data-rm-remove="l-spr-17" data-rm-id="spr-17" aria-label="Удалить связь с SPR-17">/);
  assert.match(html, /<span class="rm-node-meta"><svg class="rm-state" data-state="todo"[^>]*aria-hidden="true"/);
  const done = node(n('spr-12', { done: true, tone: 'success' }), { role: 'блокирует эту задачу', blocker: true });
  assert.match(done, /^<div class="rm-node is-done">/);
  assert.doesNotMatch(done, /rm-node-lock|rm-remove/);
  assert.match(done, /data-state="done" data-tone="success"/);
  assert.match(node(n('spr-5', { icon: 'stack' }), { role: 'родительская задача', row: true }), /data-shape="row" data-kind="epic"/);
});

test('the map draws «Ступица»: adaptive sides, trunks with words, a quiet centre, no lanes and no inset', () => {
  const js = read('src/modules/relation-map.js'), css = read('src/styles/foundation.css'), board = read('../../products/sprintique/ui/src/board/board.css');
  assert.match(js, /sides=left&&right\?'both':left\?'left':right\?'right':'none'/);
  assert.match(js, /<div class="rm-current" aria-current="true"><span class="rm-current-caption">/);
  assert.match(js, /<svg class="rm-edges" aria-hidden="true" focusable="false">/);
  assert.match(js, /<div class="rm-words" aria-hidden="true">/);
  assert.match(js, /raised=sides==='both'&&\(band\.clientWidth-hub\.offsetWidth-gapL-gapR\)\/2<MIN_SIDE/);
  assert.doesNotMatch(js, /iq-rel-lane|rm-list|width<560|style="/);
  for (const rule of ['.rm-band[data-sides=both]{grid-template-columns:minmax(0,1fr) var(--rm-gap-l,44px) auto var(--rm-gap-r,44px) minmax(0,1fr)}',
    '.rm-edge[data-tone=open]{stroke:var(--iq-warning);stroke-width:2}', '.rm-edge[data-tone=done]{stroke:var(--iq-line-strong);stroke-dasharray:4 4}',
    '.rm-current{display:grid;justify-items:center;gap:var(--iq-space-1);', '.rm-node-key{flex:none;', 'white-space:nowrap',
    '-webkit-line-clamp:2', '.rm-node:has(.rm-remove):is(:hover,:focus-within) .rm-node-status{opacity:0}'])
    assert.ok(css.includes(rule), rule);
  assert.doesNotMatch(css, /iq-rel-lane|\.rm-slot|\.rm-canvas|\.rm-list|rm-node-flag/);
  assert.doesNotMatch(board, /iq-relation-map:not\(\[data-empty\]\)/);
});
