'use strict';
/** Contracts for 0.6.0-vnext.29: mention tokens, their pills in Markdown, and the @ autocomplete of the editor. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const tokens = require('../src/modules/mention-tokens.js');
const { safeMarkdown } = require('../src/modules/markdown.js');
const css = read('src/styles/foundation.css'), mentions = read('src/modules/mentions.js'), editor = read('src/modules/editor.js');
const types = read('types/core.d.ts'), core = read('src/entries/core.js');

test('a token names the member by id and keeps a clean one-line label', () => {
  assert.equal(tokens.mentionToken({ id: 'sa_1f', name: 'Аня Карпова' }), '@[Аня Карпова](user:sa_1f)');
  assert.equal(tokens.mentionLabel(' Робот [v2] (бета)\n\\ '), 'Робот v2 бета');
  assert.equal(tokens.mentionLabel('[]()'), 'участник');
  assert.equal(tokens.mentionLabel('a`b*c_d~e|f'), 'a b c d e f', 'no code, emphasis or table delimiters');
  assert.equal(tokens.mentionLabel('я'.repeat(79) + '𝐀'), 'я'.repeat(79), 'a surrogate pair is never cut in half');
  assert.equal(tokens.mentionLabel('я'.repeat(200)).length, 80);
  for (const id of ['', 'a b', 'x)y', 'a'.repeat(101), '../x', 'u:1']) assert.throws(() => tokens.mentionToken({ id, name: 'X' }), TypeError, id);
});

test('parseMentions finds tokens outside code, at a word start, not in addresses', () => {
  const source = 'Привет, @[Аня](user:u-1)! И (@[Бот](user:sa_2)).\nmail@[x](user:u-3) `@[c](user:u-4)`\n```\n@[d](user:u-5)\n```\n@[e](user:u-6)';
  assert.deepEqual(tokens.parseMentions(source).map(t => t.id), ['u-1', 'sa_2', 'u-6']);
  const [first] = tokens.parseMentions(source);
  assert.equal(source.slice(first.start, first.end), '@[Аня](user:u-1)');
  // Malformed tokens are not mentions: a bracket in the label, a foreign scheme, an id with other characters.
  assert.deepEqual(tokens.parseMentions('@[a[b]](user:x) @[a](mailto:x) @[a](user:x y) @[a](user:x"y)'), []);
});

test('pills: the current name of a member; a label alone for anyone else; escaped «@label» text without members', () => {
  const html = safeMarkdown('Смотри @[<img src=x onerror=alert(1)>"](user:u-1) и @[Аня](user:u-2)');
  assert.equal(html, '<p>Смотри @&lt;img src=x onerror=alert(1)&gt;&quot; и @Аня</p>', 'nothing known, so no pill claims a member');
  assert.doesNotMatch(html, /<img/);
  const members = [{ id: 'u-2', name: 'Анна Карпова' }, { id: 'sa_9', name: 'Робот <релизов>', kind: 'service' }];
  const resolved = safeMarkdown('@[Аня](user:u-2), @[Директор](user:u-7), @[Р](user:sa_9)', { mentions: members });
  assert.match(resolved, /<span class="md-mention" data-mention="u-2">@Анна Карпова<\/span>/, 'a renamed member reads with the new name');
  assert.match(resolved, /, Директор, /, 'a token of a non-member is its label as plain text, never a pill or a mention');
  assert.match(resolved, /data-mention="sa_9" data-kind="service">@Робот &lt;релизов&gt;<\/span>/);
  assert.equal(safeMarkdown('`@[Аня](user:u-2)`'), '<p><code>@[Аня](user:u-2)</code></p>');
  assert.match(safeMarkdown('[@[Аня](user:u-2)](https://example.com)'), /<a [^>]*>@Аня<\/a>/, 'inside a link label it is the label');
  // A lookup function works too, and an older renderer's output stays readable text.
  assert.match(safeMarkdown('@[A](user:u-2)', { mentions: id => id === 'u-2' ? 'Новое имя' : null }), />@Новое имя</);
});

test('plain text and one-paragraph previews turn tokens into names', () => {
  const members = [{ id: 'u-2', name: 'Анна Карпова' }];
  assert.equal(tokens.mentionPlainText('Ок, @[Аня](user:u-2) и @[X](user:u-9)', members), 'Ок, @Анна Карпова и X');
  assert.equal(tokens.mentionsHTML('<b>@[Аня](user:u-2)</b>', members), '&lt;b&gt;<span class="md-mention" data-mention="u-2">@Анна Карпова</span>&lt;/b&gt;');
  assert.equal(tokens.mentionsHTML('@[X](user:u-9)', members), 'X');
  assert.equal(tokens.mentionPlainText('@[X](user:u-9)'), '@X', 'without members a token is the name as typed');
});

test('mentionQuery: «@» at a word start, one line, up to two spaces, never in code', () => {
  const q = value => tokens.mentionQuery(value, value.length);
  assert.deepEqual(q('Привет @'), { start: 7, query: '' });
  assert.deepEqual(q('@Аня К'), { start: 0, query: 'Аня К' });
  assert.deepEqual(q('(@ан'), { start: 1, query: 'ан' });
  for (const value of ['mail@ан', 'text', '@ ', '@a b c d', '`@ан', '@[Аня](user:u)', '```\n@ан', '@' + 'я'.repeat(41)]) assert.equal(q(value), null, value);
  assert.equal(tokens.mentionQuery('@ан\nтекст', 9), null, 'the caret on the next line');
  assert.deepEqual(tokens.mentionQuery('@ан\n@бо', 3), { start: 0, query: 'ан' });
});

test('filterMentionCandidates: people first, service accounts after; prefix, word, substring; ё and case folded', () => {
  const members = [
    { id: 'sa_1', name: 'Анализатор', kind: 'service' }, { id: 'p1', name: 'Фёдор Анин' }, { id: 'p2', name: 'Аня Карпова' },
    { id: 'p3', name: 'Жанна' }, { id: 'bad id', name: 'Аноним' }, { id: 'p4', name: '   ' }];
  assert.deepEqual(tokens.filterMentionCandidates(members, 'ан').map(m => m.id), ['p2', 'p1', 'p3', 'sa_1']);
  assert.deepEqual(tokens.filterMentionCandidates(members, 'ФЕДОР').map(m => m.id), ['p1']);
  assert.deepEqual(tokens.filterMentionCandidates(members, 'аня к').map(m => m.id), ['p2']);
  assert.deepEqual(tokens.filterMentionCandidates(members, '').map(m => m.id), ['p1', 'p2', 'p3', 'sa_1']);
  assert.equal(tokens.filterMentionCandidates(Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'Имя ' + i })), 'им').length, 12);
});

test('the autocomplete: keys, a list next to the field, an insert with one undo step, no focus taken', () => {
  for (const key of ["'ArrowDown'", "'ArrowUp'", "'Escape'", "event.key === 'Enter' || event.key === 'Tab'"]) assert.ok(mentions.includes(key), key);
  assert.match(mentions, /execCommand\(text \? 'insertText' : 'delete', false, text\)/);
  assert.match(mentions, /this\.list\.addEventListener\('pointerdown', event => event\.preventDefault\(\)/);
  assert.match(mentions, /input\.after\(this\.popup, this\.status\)/, 'inside a modal dialog the list stays reachable');
  assert.match(mentions, /<div class="iq-mention-heading" aria-hidden="true">Сервисные аккаунты<\/div>/);
  assert.match(mentions, /role="option" aria-selected="\$\{index === this\.active\}"/);
  assert.doesNotMatch(mentions, /setAttribute\('aria-expanded'/, 'a textarea keeps its textbox role');
  assert.match(mentions, /new CustomEvent\('iq-mention'/);
});

test('the editor and the viewer take members; exports, types and the version follow', () => {
  assert.match(editor, /for \(const name of \['density','footerActions','toolbarActions','mentions'\]\)/);
  assert.match(editor, /attachMentionAutocomplete\(this\.input, \{members: this\._mentions\}\)/);
  assert.match(editor, /safeMarkdown\(value,\{mentions:this\._mentions\|\|undefined\}\)/);
  assert.match(read('src/modules/markdown-viewer.js'), /mentions:this\.#mentions\?\?undefined/);
  for (const name of ['mentionToken', 'parseMentions', 'mentionPlainText', 'mentionsHTML', 'filterMentionCandidates', 'mentionsFromMarkdown', 'mentionsToMarkdown', 'attachMentionAutocomplete']) {
    assert.match(core, new RegExp(`export const ${name}=`), name);
    assert.match(types, new RegExp(`export declare (function|class) ${name}`), name);
  }
  assert.match(types, /mentions:MentionMember\[\]\|null;preview\(\):void;/);
  // Later releases keep these exports; the version moves on (vnext.30 checks its own).
  assert.match(core, /export const version='0\.6\.0-vnext\.(29|[3-9]\d)';/);
  assert.match(require('../package.json').version, /^0\.6\.0-vnext\.(29|[3-9]\d)$/);
});

test('the pill and the list: accent on a soft fill, the calm 34px rows of vnext.27, a sentence-case group label', () => {
  for (const rule of ['.md-mention{padding:0 2px;border-radius:var(--iq-radius-xs);background:var(--iq-accent-soft);color:var(--iq-accent);font-weight:500;white-space:nowrap}',
    '.iq-mention-popup{width:280px;max-height:320px}',
    '.iq-mention-heading{margin-top:var(--iq-space-1);padding:var(--iq-space-2) var(--iq-space-2) var(--iq-space-1);font-size:var(--iq-type-caption-size);line-height:16px;color:var(--iq-muted)}'])
    assert.ok(css.includes(rule), rule);
  assert.doesNotMatch(css, /\.iq-mention-heading\{[^}]*text-transform/);
  assert.ok(css.includes('.iq-option{display:flex;align-items:center;gap:var(--iq-space-2);min-height:34px;'));
  assert.ok(css.includes('.iq-option[aria-selected=true]{color:var(--iq-accent)}'), 'the active row is accent');
});

test('the composer shows names, never tokens: a side map of picked mentions follows edits', () => {
  const members = [{ id: 'u-f', name: 'Фёдор Андреев' }, { id: 'sa_c', name: 'Claude', kind: 'service' }];
  const shown = tokens.mentionsFromMarkdown('Посмотри, @[Федя](user:u-f) и @[Чужой](user:zz). `@[A](user:u-f)`', members);
  assert.equal(shown.text, 'Посмотри, @Фёдор Андреев и Чужой. `@[A](user:u-f)`', 'members by current name, others as a label, code as is');
  assert.deepEqual(shown.marks, [{ start: 10, end: 24, id: 'u-f', name: 'Фёдор Андреев' }]);
  assert.equal(tokens.mentionsToMarkdown(shown.text, shown.marks), 'Посмотри, @[Фёдор Андреев](user:u-f) и Чужой. `@[A](user:u-f)`');
  const shift = after => tokens.shiftMentionMarks(shown.marks, shown.text, after);
  assert.deepEqual(shift('Да. ' + shown.text).map(m => m.start), [14], 'an edit before moves the mention');
  assert.deepEqual(shift(shown.text + ' Спасибо!').map(m => m.start), [10], 'an edit after keeps it');
  assert.deepEqual(shift(shown.text.replace('Фёдор', 'Фёдр')), [], 'an edit inside the name drops it');
  assert.deepEqual(shift(shown.text.replace('Андреев', 'Андреевич')), [], 'letters typed against the name drop it');
  assert.deepEqual(shift(shown.text.replace('@Фёдор Андреев', 'x@Фёдор Андреев')), [], 'a letter before the @ drops it');
  assert.deepEqual(shift(shown.text.replace('Андреев и', 'Андреев, и')).length, 1, 'punctuation after the name keeps it');
  // A dropped mention is ordinary text: the name typed after «@», which the server matches as before.
  assert.equal(tokens.mentionsToMarkdown(shown.text.replace('Фёдор', 'Фёдр'), shift(shown.text.replace('Фёдор', 'Фёдр'))), shown.text.replace('Фёдор', 'Фёдр'));
  // A stale or forged mark never writes a token over other text.
  assert.equal(tokens.mentionsToMarkdown('@Фёдор', [{ start: 0, end: 14, id: 'u-f', name: 'Фёдор Андреев' }]), '@Фёдор');
  assert.equal(tokens.mentionsToMarkdown('@X', [{ start: 0, end: 2, id: 'bad id', name: 'X' }]), '@X');
  assert.deepEqual(tokens.mentionMarkBefore(shown.marks, 24), shown.marks[0]);
  assert.equal(tokens.mentionMarkBefore(shown.marks, 23), null);
  // Without members a draft keeps every token as a mention under its label.
  assert.deepEqual(tokens.mentionsFromMarkdown('@[Аня](user:a1)').marks, [{ start: 0, end: 4, id: 'a1', name: 'Аня' }]);
});

/** A textarea and a document just big enough for MentionAutocomplete: no layout, execCommand unsupported. */
function fakeField(value = '') {
  class Node {
    constructor() { this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.listeners = {}; this.innerHTML = ''; this.textContent = ''; this.className = ''; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
    append(...nodes) { this.children.push(...nodes); } after(...nodes) { this.siblings = nodes; } remove() {} querySelector() { return null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); return !event.defaultPrevented; }
    showPopover() { this.open = true; } hidePopover() { this.open = false; } getBoundingClientRect() { return { left: 0, top: 0 }; }
  }
  const doc = new Node();
  Object.assign(doc, { createElement: () => new Node(), execCommand: () => false, body: new Node(),
    defaultView: Object.assign(new Node(), { innerWidth: 1200, innerHeight: 800, getComputedStyle: () => ({ lineHeight: '20px', fontSize: '14px' }) }) });
  const input = Object.assign(new Node(), { tagName: 'TEXTAREA', ownerDocument: doc, value, selectionStart: value.length, selectionEnd: value.length, maxLength: -1, scrollLeft: 0, scrollTop: 0,
    focus() {}, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    setRangeText(text, a, b) { this.value = this.value.slice(0, a) + text + this.value.slice(b); this.selectionStart = this.selectionEnd = a + text.length; } });
  const type = text => { input.setRangeText(text, input.selectionStart, input.selectionEnd); input.dispatchEvent({ type: 'input' }); };
  const key = (k, extra = {}) => { const event = { type: 'keydown', key: k, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra }; input.dispatchEvent(event); return event; };
  return { input, type, key };
}

test('picking shows «@Имя», sends the token; Backspace after it removes it whole; editing inside makes it typed text', () => {
  globalThis.InputEvent ??= class { constructor(type, init = {}) { Object.assign(this, init, { type }); } };
  globalThis.CustomEvent ??= class { constructor(type, init = {}) { Object.assign(this, init, { type }); } };
  const { MentionAutocomplete } = require('../src/modules/mentions.js');
  const { input, type, key } = fakeField();
  const list = new MentionAutocomplete(input, { members: [{ id: 'u-f', name: 'Фёдор Андреев' }, { id: 'u-a', name: 'Анна Ким' }] });
  type('Посмотри, @фё');
  assert.equal(list.isOpen, true);
  key('Enter');
  assert.equal(input.value, 'Посмотри, @Фёдор Андреев ', 'the field shows the name, never the token');
  assert.equal(list.isOpen, false);
  type('и @ан');key('Tab');type('тоже.');
  assert.equal(input.value, 'Посмотри, @Фёдор Андреев и @Анна Ким тоже.');
  assert.equal(list.toMarkdown(), 'Посмотри, @[Фёдор Андреев](user:u-f) и @[Анна Ким](user:u-a) тоже.');
  // Backspace right after «@Анна Ким» removes the whole mention, and only that one.
  input.setSelectionRange(36, 36);
  assert.equal(key('Backspace').defaultPrevented, true);
  assert.equal(input.value, 'Посмотри, @Фёдор Андреев и  тоже.');
  assert.equal(list.toMarkdown(), 'Посмотри, @[Фёдор Андреев](user:u-f) и  тоже.');
  // Elsewhere Backspace is the browser's own.
  input.setSelectionRange(5, 5);
  assert.equal(key('Backspace').defaultPrevented, false);
  // Editing inside the name drops the mention: the text is then a typed one.
  input.value = input.value.replace('Андреев', 'Андреев-Петров');input.dispatchEvent({ type: 'input' });
  assert.equal(list.toMarkdown(), 'Посмотри, @Фёдор Андреев-Петров и  тоже.');
  assert.deepEqual(list.mentions, []);
  // A draft with tokens shows names again, and its mentions stay picked.
  list.load('Ответ для @[Федя](user:u-f)');
  assert.equal(input.value, 'Ответ для @Фёдор Андреев');
  assert.equal(list.toMarkdown(), 'Ответ для @[Фёдор Андреев](user:u-f)');
  list.destroy();
});

test('the editor keeps the field plain and its value Markdown', () => {
  assert.match(editor, /get value\(\) \{ return this\.input \? \(this\._mentionList \? this\._mentionList\.toMarkdown\(\) : this\.input\.value\)/);
  assert.match(editor, /if \(this\._mentionList\) this\._mentionList\.load\(next\);/);
  assert.match(editor, /if \(this\.input\.value\.includes\('@\['\)\) \{ this\._mentionList\.load\(this\.input\.value\);/);
  assert.match(editor, /this\.history\.push\(this\.input\.value\);/, 'undo history is the field, never tokens');
  assert.match(editor, /this\.listen\(this\.input, 'iq-mention', \(\) => this\.emit\('iq-change'/);
});
