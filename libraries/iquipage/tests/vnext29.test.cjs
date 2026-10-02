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
  assert.match(mentions, /execCommand\('insertText', false, text\)/);
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
  for (const name of ['mentionToken', 'parseMentions', 'mentionPlainText', 'mentionsHTML', 'filterMentionCandidates', 'attachMentionAutocomplete']) {
    assert.match(core, new RegExp(`export const ${name}=`), name);
    assert.match(types, new RegExp(`export declare (function|class) ${name}`), name);
  }
  assert.match(types, /mentions:MentionMember\[\]\|null;preview\(\):void;/);
  assert.match(core, /export const version='0\.6\.0-vnext\.29';/);
  assert.equal(require('../package.json').version, '0.6.0-vnext.29');
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
