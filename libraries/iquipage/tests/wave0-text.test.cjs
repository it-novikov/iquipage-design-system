'use strict';
/** Wave 0 text: one plural helper in core (TXT-02) and the file-list caption typo (TXT-13). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
global.HTMLElement ??= class {};
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const { plural, count } = require('../src/modules/time.js');
const tasks = { one: 'задача', few: 'задачи', many: 'задач' };
const nbsp = s => s.replace(/[  ]/g, ' ');

test('plural picks the Russian category from Intl.PluralRules', () => {
  const expected = { 1: 'задача', 2: 'задачи', 5: 'задач', 11: 'задач', 21: 'задача', 101: 'задача', 112: 'задач', 0: 'задач', 22: 'задачи', 114: 'задач' };
  for (const [n, form] of Object.entries(expected)) assert.equal(plural(Number(n), tasks), form, `n=${n}`);
});
test('count formats the number for the locale and agrees with it', () => {
  const expected = { 1: '1 задача', 2: '2 задачи', 5: '5 задач', 11: '11 задач', 21: '21 задача', 101: '101 задача', 112: '112 задач' };
  for (const [n, text] of Object.entries(expected)) assert.equal(count(Number(n), tasks), text, `n=${n}`);
  assert.equal(nbsp(count(1234, tasks)), '1 234 задачи');
  assert.equal(nbsp(count(5000, tasks)), '5 000 задач');
});
test('English needs only one/other', () => {
  const en = { one: 'task', other: 'tasks' };
  assert.equal(count(1, en, 'en'), '1 task');
  assert.equal(count(2, en, 'en'), '2 tasks');
  assert.equal(count(1234, en, 'en'), '1,234 tasks');
  assert.equal(plural(0, en, 'en'), 'tasks');
});
test('missing forms fall back instead of printing undefined', () => {
  assert.equal(plural(1.5, tasks), 'задач');
  assert.equal(plural(NaN, tasks), 'задач');
  assert.equal(plural(3, { one: 'элемент', other: 'элементов' }), 'элементов');
  assert.equal(plural(3, { one: 'x' }), 'x');
});
test('every replaced site reads correctly for 1, 2, 5, 11 and 21', () => {
  const sites = {
    'Удалить N задач?': [{ one: 'задачу', few: 'задачи', many: 'задач' }, ['1 задачу', '2 задачи', '5 задач', '11 задач', '21 задачу']],
    'N задач ожидают': [{ one: 'задача ожидает', few: 'задачи ожидают', many: 'задач ожидают' }, ['1 задача ожидает', '2 задачи ожидают', '5 задач ожидают', '11 задач ожидают', '21 задача ожидает']],
    'K из N задач': [{ one: 'задачи', few: 'задач', many: 'задач' }, ['1 задачи', '2 задач', '5 задач', '11 задач', '21 задачи']],
    'N голосов': [{ one: 'голос', few: 'голоса', many: 'голосов' }, ['1 голос', '2 голоса', '5 голосов', '11 голосов', '21 голос']],
    'N объектов': [{ one: 'объект', few: 'объекта', many: 'объектов' }, ['1 объект', '2 объекта', '5 объектов', '11 объектов', '21 объект']],
    'N связей': [{ one: 'связь', few: 'связи', many: 'связей' }, ['1 связь', '2 связи', '5 связей', '11 связей', '21 связь']],
    'N документов': [{ one: 'документ', few: 'документа', many: 'документов' }, ['1 документ', '2 документа', '5 документов', '11 документов', '21 документ']],
    'N сроков': [{ one: 'срок', few: 'срока', many: 'сроков' }, ['1 срок', '2 срока', '5 сроков', '11 сроков', '21 срок']],
    'Добавить N заметок': [{ one: 'заметку', few: 'заметки', many: 'заметок' }, ['1 заметку', '2 заметки', '5 заметок', '11 заметок', '21 заметку']],
    'N карточек': [{ one: 'карточка', few: 'карточки', many: 'карточек' }, ['1 карточка', '2 карточки', '5 карточек', '11 карточек', '21 карточка']],
  };
  for (const [name, [forms, expected]] of Object.entries(sites)) assert.deepEqual([1, 2, 5, 11, 21].map(n => count(n, forms)), expected, name);
});
test('plural and count are public core exports with types', () => {
  const entry = read('src/entries/core.js'), types = read('types/core.d.ts');
  assert.ok(entry.includes('export const plural=m4.plural;') && entry.includes('export const count=m4.count;'));
  assert.ok(types.includes('export declare function plural(n:number,forms:PluralForms,locale?:string):string;'));
  assert.ok(types.includes('export declare function count(n:number,forms:PluralForms,locale?:string):string;'));
});
test('no hand-rolled plural ternary or bare counter remains in the modules', () => {
  const stale = [
    ["app.js", "${ids.length === 1 ? 'задачу' : 'задачи'}"],
    ["app.js", "${review === 1 ? 'задача ожидает' : 'задачи ожидают'}"],
    ["app.js", "из ${tasks.length} задач"],
    ["whiteboard.js", "===1?'голос':'голоса'"],
    ["whiteboard.js", ".length} объектов"],
    ["whiteboard-experience.js", ".length} объектов"],
    ["graph.js", ".length} объектов"],
    ["graph.js", ".length} связей"],
    ["roadmap.js", ".length} связей"],
    ["structured.js", "${this.total} документов"],
    ["structured.js", "%10===1"],
    ["whiteboard-workshop.js", "%10===1"],
  ];
  for (const [file, fragment] of stale) assert.ok(!read('src/modules/' + file).includes(fragment), `${file} still contains ${fragment}`);
  const modules = fs.readdirSync(path.join(root, 'src/modules')).filter(f => f.endsWith('.js'));
  for (const file of modules) assert.ok(!/%10\s*===?\s*1\s*&&/.test(read('src/modules/' + file)), `${file} rolls its own plural`);
});
test('the sample file caption reads as size, sample (TXT-13)', () => {
  const stories = read('src/modules/stories.js');
  assert.ok(!stories.includes('МБнстрационный'));
  assert.ok(stories.includes('<small>2,4 МБ, демонстрационный образец</small>') && stories.includes('<small>8,1 МБ, демонстрационный образец</small>'));
  assert.ok(!/МБ\s*·/.test(stories), 'no middots in the DS voice');
});
